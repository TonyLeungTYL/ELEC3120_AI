# LearningPacer — ELEC3120 Virtual TA

A Next.js 16 + Prisma (SQLite) + Tailwind + shadcn/ui learning app that acts
as a virtual teaching assistant for HKUST ELEC3120 Computer Networks.
Originally designed for Vercel; now running on Replit and intended to be
published via Replit Deployments.

## Dev

```
bun run dev   # Next.js dev server on 0.0.0.0:5000 (configured as workflow "Start application")
```

The app uses Prisma against the Replit-provisioned **Postgres** database
specified by `DATABASE_URL` (see `prisma/schema.prisma`). `src/lib/db.ts`
exports a single shared `PrismaClient` instance that is reused across hot
reloads in development.

Workflow: `Start application` runs `bun run dev`.

## Knowledge base

Two layers, both searched by `searchKnowledgeBase` in `src/app/api/chat/route.ts`:

1. **Curated topics** (`src/lib/knowledge-base.ts`) — authoritative source of
   truth. ~20 bilingual (EN/中文) topics, each with a `source` label that maps
   to the actual ELEC3120 lecture (e.g. `"ELEC3120 L07 — Congestion Control"`).
   These drive the majority of citations in chat answers.
2. **Uploaded/seeded documents** (Prisma `KnowledgeDocument` table) — for
   user-uploaded PDFs via `/api/knowledge/upload` and for the optional bulk
   seed endpoint `POST /api/knowledge/seed-lectures` (reads the latest
   `attached_assets/Lecture_*.zip`).

### PDF extraction

`src/lib/pdf-extract.ts` primarily uses **`pdf-parse` v1** (CommonJS build,
imported via `pdf-parse/lib/pdf-parse.js` to avoid the library's infamous
"debug mode reads a test PDF at import time" bug). A custom `pagerender`
callback emits `[PAGE_MARKER:N]` boundaries so citation page numbers are
accurate. A regex-based extractor (with a `looksLikeReadableText` filter
that rejects CID-font junk) is kept as a fallback.

`pdf-parse` is listed in `next.config.ts` `serverExternalPackages` so
Turbopack doesn't try to bundle its CJS entry into the edge/server graph.

### Re-seeding

Both layers live side by side; re-seed any time after dropping new exports
into `attached_assets/`:

```
curl -X POST http://localhost:5000/api/knowledge/seed-lectures
```

To wipe seeded lecture rows again without touching user uploads:

```
curl -X POST http://localhost:5000/api/knowledge/clear-seeded
```

## Notable files

- `src/lib/knowledge-base.ts` — curated bilingual topic content with
  `source: "ELEC3120 L## — ..."` labels.
- `src/lib/pdf-extract.ts` — regex PDF text extractor (+ reader-only filter
  that rejects CID-font junk). Used by upload route and seed route.
- `src/app/api/chat/route.ts` — Gemini chat with citation support; searches
  both in-code topics and DB docs, with CJK bigram tokenization so Chinese
  queries hit the right topics.
- `src/app/api/knowledge/seed-lectures/route.ts` — one-shot zip seeder.
- `src/app/api/knowledge/clear-seeded/route.ts` — delete seeded lecture docs
  (matches title regex `^L\d{2} — `), leaves user uploads alone.
- `next.config.ts` — has
  `serverExternalPackages: ["adm-zip", "@prisma/client", "pdf-parse"]` to
  stop Turbopack from bundling server-only deps.
- `postcss.config.mjs` — pins `@tailwindcss/postcss` to `base: ./src`. The
  Tailwind v4 Oxide scanner otherwise walks the whole workspace and
  spins in an infinite loop on something under `node_modules` /
  `attached_assets` / caches, pegging PostCSS at >100 % CPU until
  Turbopack times out. Scoping the base to `src/` takes the CSS compile
  from "never finishes" to ~700 ms.
- `src/lib/admin-auth.ts` — `requireAdmin()` gate for the seed and clear
  endpoints. Localhost requests pass automatically; production requires
  an `x-admin-secret` header matching the `ADMIN_SECRET` env var.

## Language / voice

All AI prompts default to **English** replies and switch to the student's
language only when they write in another language. When responding in
Chinese, **Traditional Chinese (繁體中文 HK/TW)** is enforced (no Simplified).
Technical terms are always kept in their original English form regardless
of reply language.

## Agent Mode (4th chat mode)

Adds an autonomous tool-calling agent alongside Tutor / Code / Image.

- **Endpoint**: `src/app/api/agent/route.ts` — ReAct loop (max 8
  iterations), streams SSE events `status | tool_call | tool_result |
  text | error | done`. Default model: `deepseek/deepseek-v4-flash`
  (cheap + works with the existing OpenRouter key). Override with
  `OPENROUTER_AGENT_MODEL=anthropic/claude-opus-4.7` (requires Anthropic
  access on the OpenRouter account).
- **Tools** (`src/lib/agent/tools.ts`):
  - `search_course_content` — in-process KB search reusing
    `knowledgeTopics`.
  - `web_search` — uses OpenRouter `:online` suffix on a small model.
  - `generate_pdf` — calls `renderPdfFromSpec`. Hard caps: 30 sections,
    60 questions/section, 6 000 chars per body block.
- **PDF generator**: `src/lib/agent/pdf-generator.tsx` — React-PDF with
  CJK font (NotoSansTC from jsdelivr CDN), saves to
  `public/agent-pdfs/<slug>-<uuid>.pdf` and returns
  `{ url, filename, sizeKb, pages, title }`. A best-effort
  `pruneOldPdfs()` keeps the directory at ≤ 50 files (newest kept).
- **OpenRouter helper**: `openrouterChatWithTools()` in
  `src/lib/openrouter.ts` (non-streaming, returns
  `{ content, toolCalls, finishReason }`).
- **UI**: `src/components/agent-step-trail.tsx` renders each
  tool_call/result as a colored card; PDF results get a download button.
  Wired into `chat-messages.tsx` (`agentSteps?: AgentStep[]` on
  `Message`) and `chat-input.tsx` (Sparkles "Agent" button).
- **SSE parser**: `src/app/page.tsx` parses both LF and CRLF framing and
  concatenates multi-line `data:` events.
- **Cancel-on-disconnect**: `openrouterChat()` and
  `openrouterChatWithTools()` accept an optional `signal: AbortSignal`,
  combined with the timeout via `AbortSignal.any()` (`combineSignals`
  helper). The agent route stores `req.signal`, checks
  `signal.aborted` before each iteration and tool call, propagates the
  signal through `executeTool` to `web_search`'s nested model call,
  and uses a `safeClose()` + `closed` guard so enqueues after client
  disconnect don't throw.
- **PDF list panel**: `GET /api/agent/pdfs` returns
  `{ items: [{ filename, url, title, sizeKb, mtime }] }` (newest
  first). `src/components/agent-pdfs-sheet.tsx` is a right-side Sheet
  with Download/Open buttons per file, fetched on open and refreshable.
  Wired into `ChatSidebar` as a "PDFs / PDF" tool button and into
  `page.tsx` via `agentPdfsOpen` state. Title is recovered from the
  `<slug>-<8hex>.pdf` filename convention.

## Auth (Supabase magic-link, Chunk 1)

Lightweight magic-link login UI shell. Zero DB schema changes — just the
auth surface so future chunks can scope chats / progress to a user.

**Env vars (all in Replit Secrets):**

- `SUPABASE_URL` — project URL, used by both server and browser clients
- `SUPABASE_PUBLISHABLE_KEY` — `sb_publishable_*` anon key, safe in the
  browser. Used by the user-facing server client (respects RLS) and
  injected into `window.__SUPABASE_KEY__` for the browser client.
- `SUPABASE_KEY` — `sb_secret_*` service-role key. **Never** expose to the
  browser. Reserved for clearly-marked server-only admin code paths
  (none yet; will appear in later chunks if/when needed).

**Files:**

- `src/lib/supabase/server.ts` — `getSupabaseServer()` for Server
  Components / Route Handlers. Uses Next 16 async `cookies()`.
- `src/lib/supabase/browser.ts` — singleton browser client reading from
  `window.__SUPABASE_URL__` / `window.__SUPABASE_KEY__`.
- `src/components/supabase-env-script.tsx` — Server Component injecting
  the URL + publishable key into `window` before hydration. Has a
  runtime guard (`assertAnonKey`) that **throws at render time** if the
  key looks like a `sb_secret_*` or a JWT with `role !== "anon"`. This
  is the safety net that prevents leaking the service-role key.
- `src/app/login/page.tsx` — magic-link form (`signInWithOtp`,
  `shouldCreateUser: true` → open signup, intentional for FYP demo).
- `src/app/auth/callback/route.ts` — `GET /auth/callback?code=...`
  exchanges the code for a session cookie, then redirects. The `next`
  param is sanitized to same-origin relative paths only (no
  open-redirect).
- `src/components/user-menu.tsx` — top-right menu, listens to
  `onAuthStateChange` so UI updates without reload.

Mounted in: `src/app/layout.tsx` (`<SupabaseEnvScript />` inside `<body>`)
and `src/app/page.tsx` (`<UserMenu />` in the header).

## Routing (2026-05)

- `/` — **marketing landing page** (`src/app/page.tsx`). Bilingual EN/繁中
  dark-theme cover with hero, 4-mode features grid, 3-col differentiators,
  comparison table vs ChatGPT, quote, bottom CTA. Hero image lives at
  `public/landing-hero.png` (copied from `attached_assets/`).
- `/chat` — **the actual chat app** (`src/app/chat/page.tsx`, formerly at
  `/`). Untouched in the move; full chat / sidebar / panels intact.
- All post-auth redirects (`/login`, `/auth/callback`,
  `/api/auth/send-magic-link`) default `next` to `/chat`, not `/`, so
  signing in still drops users straight into the chat.

## Live model picker (2026-05)

- `src/app/api/chat/route.ts` POST accepts optional `model: string` from
  the request body, validated against an `ALLOWED_MODELS` whitelist
  (`z-ai/glm-4.6`, `deepseek/deepseek-v4-flash`, `google/gemini-2.5-pro`,
  `anthropic/claude-sonnet-4`, `openai/gpt-5`, `x-ai/grok-4`). Threaded
  through `getAIResponse` → `openrouterChat({ model })` for tutor + code.
  Image branch ignores it (fixed vision model).
- `src/app/page.tsx` (now landing) does NOT use this; the chat page at
  `src/app/chat/page.tsx` keeps a `selectedModel` state in
  `lp-chat-model` localStorage and only includes `model` in the body for
  `/api/chat` (never `/api/chat/image`).
- `src/components/chat-input.tsx` renders an amber Cpu-icon dropdown
  (only in tutor/code mode) listing the 6 whitelisted models with
  bilingual hints and badges.

## Deployment

Publish via Replit Deployments (Autoscale). SQLite DB will persist as part
of the deploy filesystem; if you want per-deploy data isolation or
production-scale traffic, migrate to Postgres.
