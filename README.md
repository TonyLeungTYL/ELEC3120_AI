# LearningPacer — ELEC3120 Virtual TA

> **AI-powered virtual teaching assistant for HKUST ELEC3120 — Computer & Communication Networks**
> HKUST ELEC3120「電腦與通訊網絡」AI 虛擬助教

A bilingual (English / 繁體中文) Next.js learning app that helps students study
Computer Networks through chat, code analysis, image understanding, an
autonomous study agent, AI-generated quizzes, study plans, and weak-concept
analysis — all grounded in the actual ELEC3120 lecture material.

一個雙語（英文 / 繁體中文）嘅 Next.js 學習應用，透過聊天、程式碼分析、圖像理解、
自主學習代理、AI 測驗、學習計劃、弱項分析等功能，幫助學生學習電腦網絡——
全部基於真正嘅 ELEC3120 講義內容。

---

## 🚀 One-Click Deploy / 一鍵部署

Choose either platform — both are free for normal student traffic.
任選一個平台——兩者對一般學生流量都係免費。

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/REPLACE_WITH_YOUR_GITHUB_USERNAME/REPLACE_WITH_REPO_NAME&env=POE_KEY,DATABASE_URL,SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,SUPABASE_KEY,RESEND_API_KEY&envDescription=API%20keys%20required%20%E2%80%94%20see%20DEPLOYMENT.md%20for%20how%20to%20get%20each%20one&envLink=https://github.com/REPLACE_WITH_YOUR_GITHUB_USERNAME/REPLACE_WITH_REPO_NAME/blob/main/DEPLOYMENT.md&project-name=learningpacer&repository-name=learningpacer)

[![Run on Replit](https://replit.com/badge/github/REPLACE_WITH_YOUR_GITHUB_USERNAME/REPLACE_WITH_REPO_NAME)](https://replit.com/new/github/REPLACE_WITH_YOUR_GITHUB_USERNAME/REPLACE_WITH_REPO_NAME)

> 👉 **First time deploying?** Read the full step-by-step guide:
> 👉 **第一次部署？** 請睇完整圖文教學：
> **[📖 DEPLOYMENT.md (English + 中文)](./DEPLOYMENT.md)**

---

## ✨ Features / 功能

| Mode 模式 | What it does 功能 |
|---|---|
| 💬 **Tutor Chat** 導師聊天 | Ask questions about networking, get answers cited from ELEC3120 lectures<br>就網絡問題提問，答案會引用 ELEC3120 講義 |
| 💻 **Code Mode** 程式碼模式 | Explain / debug network-related code (sockets, TCP, HTTP …)<br>解釋／除錯網絡相關程式碼（socket、TCP、HTTP……） |
| 🖼️ **Image Mode** 圖像模式 | Upload network diagrams / textbook screenshots → AI explains them<br>上載網絡圖／課本截圖 → AI 講解內容 |
| 🤖 **Agent Mode** 代理模式 | Autonomous tool-using agent that can search KB, browse web, generate study PDFs<br>自主代理，可搜尋知識庫、上網、產生學習 PDF |
| 📝 **Quiz Mode** 測驗模式 | AI-generated bilingual MCQs at 3 difficulty levels (Easy / Medium / Hard)<br>AI 產生嘅雙語選擇題，3 種難度（易／中／難） |
| 📊 **Study Stats + Plan** 學習統計與計劃 | Track progress, find weak topics, get personalised study plan<br>追蹤進度、找出弱項、獲得個人化學習計劃 |

---

## 🧠 Tech Stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript**
- **Tailwind CSS v4** + **shadcn/ui** components
- **Prisma** ORM + **PostgreSQL** (any provider — Neon / Supabase / Vercel Postgres)
- **Poe API** (OpenAI-compatible) — Claude Opus 4.7, Gemini 3.1 Pro, GPT-5, Grok 4 …
- **Supabase Auth** — magic-link login (passwordless)
- **Resend** — magic-link email delivery (optional)
- **bun** — package manager / runtime

---

## 🔑 Required API Keys / 需要嘅 API Key

You will need to register for these (all have free tiers).
你需要登記以下 service（全部都有免費額度）。

| Variable 變數名 | Service 服務 | Where to get 邊度攞 | Required? |
|---|---|---|---|
| `POE_KEY` | [Poe.com](https://poe.com) | Poe → Settings → API Keys | ✅ Yes |
| `DATABASE_URL` | [Neon](https://neon.tech) (recommended) | Neon → Create project → Copy connection string | ✅ Yes |
| `SUPABASE_URL` | [Supabase](https://supabase.com) | Project → Settings → API → Project URL | ✅ Yes |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase | Settings → API → `anon` `public` key | ✅ Yes |
| `SUPABASE_KEY` | Supabase | Settings → API → `service_role` key (⚠️ secret) | ✅ Yes |
| `RESEND_API_KEY` | [Resend](https://resend.com) | Dashboard → API Keys | Optional (custom magic-link emails) |
| `ADMIN_SECRET` | Make one up | Any random string | Optional (gates `/api/knowledge/seed-lectures`) |

> 📖 **Step-by-step screenshots for every key:** see [DEPLOYMENT.md](./DEPLOYMENT.md)
> 📖 **每個 key 嘅圖文教學：** 請睇 [DEPLOYMENT.md](./DEPLOYMENT.md)

---

## 🛠️ Local Development / 本地開發

```bash
# 1. Clone the repo
git clone https://github.com/REPLACE_WITH_YOUR_GITHUB_USERNAME/REPLACE_WITH_REPO_NAME.git
cd REPLACE_WITH_REPO_NAME

# 2. Install dependencies
bun install      # or: npm install / pnpm install

# 3. Copy env template and fill in your keys
cp .env.example .env.local
# Then edit .env.local with your actual values

# 4. Run Prisma migrations against your Postgres
bunx prisma migrate deploy
bunx prisma generate

# 5. Start the dev server
bun run dev
# Open http://localhost:5000
```

---

## 📁 Project Structure / 專案結構

```
src/
├── app/
│   ├── page.tsx              # Marketing landing page (/)
│   ├── chat/page.tsx         # Main chat app (/chat)
│   ├── login/                # Magic-link login
│   ├── auth/callback/        # Supabase auth callback
│   └── api/
│       ├── chat/             # Tutor / Code / Image chat (streaming SSE)
│       ├── agent/            # Autonomous agent with tool-calling
│       ├── quiz/             # AI quiz generation
│       ├── study-plan/       # Personalised study plan
│       └── knowledge/        # PDF upload + lecture seeding
├── lib/
│   ├── knowledge-base.ts     # Curated bilingual ELEC3120 topics
│   ├── pdf-extract.ts        # PDF → text extractor
│   ├── openrouter.ts         # Poe / OpenRouter chat helper
│   └── agent/                # Agent tools + PDF generator
└── components/               # UI (chat, sidebar, panels …)
prisma/
└── schema.prisma             # Postgres schema
```

---

## 🌍 Languages / 語言

- AI replies default to **English** and switch to the student's language only when they write in another language.
- AI 回覆預設係 **英文**，只係當學生用其他語言提問時先轉。
- When responding in Chinese, **Traditional Chinese (繁體中文 — HK / TW)** is enforced. Never Simplified.
- 用中文回覆時強制使用 **繁體中文（香港／台灣）**，唔會出簡體字。
- Technical terms always stay in their original English form.
- 技術名詞永遠保留英文原文。

---

## 📜 License

This project was developed as part of an HKUST ELEC4900 Final Year Project.
本項目為香港科技大學 ELEC4900 Final Year Project 嘅一部分。

Lecture content is © Prof. Meng's ELEC3120 course materials (HKUST). The
codebase is provided for educational use within the course.

講義內容版權歸 ELEC3120 課程及 Meng 教授（香港科技大學）所有。程式碼僅供
課程內教學使用。

---

## 🙏 Acknowledgements

- **Prof. Meng** — ELEC3120 lecturer and project advisor
- **HKUST ELEC department** — for the FYP opportunity
- **Replit** — initial development environment
- **Poe / Anthropic / Google / OpenAI / xAI** — model providers


# 📖 Deployment Guide / 部署教學

> Complete step-by-step guide for deploying LearningPacer.
> No prior experience required — if you can use Gmail, you can do this.
>
> 完整逐步部署教學。
> 完全唔需要技術背景——識用 Gmail 就識做。

---

## 🌐 Choose Your Path / 選擇方式

| Path 方式 | Best for 適合 | Cost 費用 | Time 時間 |
|---|---|---|---|
| 🟦 **Vercel** | Production use, custom domain, auto SSL | Free tier covers a class<br>免費額度足夠成班用 | ~10 min |
| 🟧 **Replit** | Quick demo, in-browser editing | Free to start, $25/mo for always-on | ~5 min |

> **Recommended for ELEC3120 production:** Vercel.
> **建議課堂正式使用：** Vercel。

---

# Part 1 — Get All Your API Keys (10 minutes) / 第一部分：攞齊所有 API Key（10 分鐘）

You need to do this **once**, then keep these keys in a safe place (e.g. a
Notes app). You'll paste them into Vercel / Replit later.

呢部分**只需要做一次**，之後將 key 收好（例如 Notes app）。
之後會貼入 Vercel／Replit。

> ⚠️ **DO NOT commit any of these keys to GitHub.** Treat them like passwords.
> ⚠️ **千祈唔好將呢啲 key commit 上 GitHub。** 當佢係密碼咁處理。

---

## 1️⃣ Poe API Key (for the AI brains) / Poe API Key（AI 大腦）

LearningPacer uses Poe.com to access multiple AI models (Claude, Gemini, GPT-5,
Grok …) through one single API.

LearningPacer 透過 Poe.com 一個 API 同時接駁多個 AI model。

**Steps / 步驟:**

1. Go to **<https://poe.com>** and sign up / log in.
   去 **<https://poe.com>** 註冊／登入。
2. Click your **profile icon (top-right)** → **Settings**.
   撳右上角頭像 → **Settings**。
3. In the left sidebar, click **API Keys** (or **Subscription & API**).
   左側欄撳 **API Keys**（或 **Subscription & API**）。
4. Click **Create new key** → give it a name like `learningpacer-prod`.
   撳 **Create new key** → 改個名例如 `learningpacer-prod`。
5. **Copy** the key (starts with `sk-...`) and save it as `POE_KEY`.
   **Copy** 個 key（`sk-...` 開頭），存做 `POE_KEY`。

> 💡 Poe charges per-message based on the model. Claude-Opus-4.7 ≈ 100 points
> per chat; Gemini-3.1-Pro ≈ 5 points. A Poe Subscriber account ($20/month)
> gives 1 million points/month — easily enough for a small class.
>
> 💡 Poe 按 model 收 point。Claude-Opus-4.7 約 100 point／次；
> Gemini-3.1-Pro 約 5 point。Poe Subscriber（$20/月）有 100 萬 point，
> 細班完全夠用。

---

## 2️⃣ PostgreSQL Database (Neon — free) / PostgreSQL 資料庫（Neon——免費）

We'll use **Neon** (a free serverless Postgres). 0.5 GB storage free, no
credit card required.

我哋用 **Neon**（免費 serverless Postgres）。免費 0.5 GB，唔需要信用卡。

**Steps / 步驟:**

1. Go to **<https://neon.tech>** → **Sign up** with GitHub or Google.
   去 **<https://neon.tech>** → 用 GitHub 或 Google **註冊**。
2. After signup, it'll ask you to **create a project**:
   註冊後會叫你 **create a project**：
   - **Project name:** `learningpacer`
   - **Postgres version:** keep default (latest)
   - **Region:** choose **Singapore** or **Hong Kong** (closest to HKUST)
3. Once created, you'll see a **Connection string** like:
   建立後會見到一條 **Connection string**：
   ```
   postgresql://username:password@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```
4. **Copy the entire string** and save it as `DATABASE_URL`.
   **Copy 成條 string**，存做 `DATABASE_URL`。

> ⚠️ Make sure the URL ends with `?sslmode=require` (Neon needs SSL).
> ⚠️ 確保條 URL 以 `?sslmode=require` 結尾（Neon 需要 SSL）。

---

## 3️⃣ Supabase (for login) / Supabase（用戶登入）

We use Supabase for **passwordless magic-link login** (no password to remember).

我哋用 Supabase 做 **無密碼 magic-link 登入**（唔需要記密碼）。

**Steps / 步驟:**

1. Go to **<https://supabase.com>** → **Start your project** → log in with GitHub.
   去 **<https://supabase.com>** → **Start your project** → 用 GitHub 登入。
2. Click **New project**:
   撳 **New project**：
   - **Name:** `learningpacer`
   - **Database password:** click **Generate a password** → save it (you won't need it for the app, but Supabase wants one)
   - **Region:** **Southeast Asia (Singapore)**
   - **Plan:** Free
3. Wait ~2 minutes for the project to spin up.
   等 ~2 分鐘畀個 project 起好。
4. Once ready, in the left sidebar click **Project Settings (⚙️)** → **API**.
   準備好之後，左側欄撳 **Project Settings (⚙️)** → **API**。
5. You'll see three values you need to copy:
   你需要 copy 三個值：

   | What you see 你見到 | Save as 存做 |
   |---|---|
   | **Project URL** (`https://xxx.supabase.co`) | `SUPABASE_URL` |
   | **`anon` `public` key** (long string starting `eyJ...` or `sb_publishable_...`) | `SUPABASE_PUBLISHABLE_KEY` |
   | **`service_role` `secret` key** (⚠️ click "Reveal" first) | `SUPABASE_KEY` |

> 🔒 **The `service_role` key is sensitive** — never share it or paste it into
> any frontend code. Only Vercel / Replit's secret env vars should hold it.
>
> 🔒 **`service_role` key 好敏感**——千祈唔好分享或貼入任何前端 code，
> 只可以放入 Vercel／Replit 嘅 secret env var。

6. **Enable email auth:** in the left sidebar go to
   **Authentication → Providers → Email** → make sure it's **enabled**.
   **開啟 email 登入：** 左側欄去
   **Authentication → Providers → Email** → 確保已 **啟用**。

---

## 4️⃣ (Optional) Resend — for nicer login emails / （選用）Resend——更靚嘅登入信

Supabase sends magic-link emails by default. If you want them to come from
your own domain (e.g. `noreply@your-domain.com`), use Resend.

Supabase 預設會寄 magic-link email。如果想用自己 domain 寄（例如
`noreply@your-domain.com`），就用 Resend。

**Skip this step if you don't have a custom domain. The app works fine without it.**
**冇自己 domain 嘅話跳過呢步。冇都運作正常。**

1. **<https://resend.com>** → Sign up
2. **API Keys** → **Create API Key** → copy → save as `RESEND_API_KEY`

---

# Part 2A — Deploy to Vercel 🟦 (Recommended) / 第二部分 A：部署到 Vercel 🟦（建議）

## Steps / 步驟

1. **Click the big blue "Deploy with Vercel" button** in the [README](./README.md).
   撳 [README](./README.md) 入面嘅藍色 **"Deploy with Vercel"** 大掣。

2. Sign in to Vercel with **GitHub** (free account).
   用 **GitHub** 登入 Vercel（免費 account）。

3. Vercel will ask you to **clone the repo into your GitHub** — click **Create**.
   Vercel 會叫你 **將 repo clone 入你嘅 GitHub** ——撳 **Create**。

4. Vercel will then show a **form to fill in environment variables**.
   之後 Vercel 會顯示 **填 environment variables 嘅表格**。
   Paste each value you saved in Part 1:
   貼入第一部分存好嘅每個值：

   | Variable | Paste / 貼入 |
   |---|---|
   | `POE_KEY` | (from Step 1 / 第 1 步) |
   | `DATABASE_URL` | (from Step 2 / 第 2 步) |
   | `SUPABASE_URL` | (from Step 3 / 第 3 步) |
   | `SUPABASE_PUBLISHABLE_KEY` | (from Step 3 / 第 3 步) |
   | `SUPABASE_KEY` | (from Step 3 / 第 3 步) |
   | `RESEND_API_KEY` | (from Step 4, or leave blank / 第 4 步，或留空) |

5. Click **Deploy**. Wait ~3-4 minutes.
   撳 **Deploy**。等 ~3-4 分鐘。

6. When done, Vercel gives you a URL like `learningpacer-xxx.vercel.app`.
   完成後 Vercel 會俾你一條 URL，例如 `learningpacer-xxx.vercel.app`。
   **Open it — your app is live! 🎉**
   **打開——個 app live 咗！🎉**

## After First Deploy: Apply Database Schema / 首次部署後：套用資料庫 schema

Vercel runs `prisma generate` automatically during build, but you need to
**apply migrations to your Neon database** the first time:

Vercel 會自動 build 時跑 `prisma generate`，但你需要 **首次手動將 migration
套用落 Neon 資料庫**：

**Easiest way (from your computer):**
**最簡單方法（喺你電腦做）：**

```bash
# Install Vercel CLI once
npm install -g vercel

# Pull the env vars Vercel knows about
vercel link        # (links this folder to your Vercel project)
vercel env pull .env.local

# Apply the schema to Neon
bunx prisma migrate deploy
# OR if you don't have bun: npx prisma migrate deploy
```

After this, your live app at `xxx.vercel.app` will work end-to-end.
做完之後，你 `xxx.vercel.app` 上面個 app 就完全運作得到。

## Custom Domain (Optional) / 自訂 Domain（選用）

In Vercel project → **Settings → Domains** → add e.g. `learningpacer.hkust.edu`.
Vercel handles SSL automatically.

喺 Vercel project → **Settings → Domains** → 加例如 `learningpacer.hkust.edu`。
Vercel 會自動處理 SSL。

> ⚠️ After changing your domain, also update Supabase:
> ⚠️ 改 domain 後記住同步更新 Supabase：
> Supabase → Authentication → URL Configuration → set **Site URL** to your new domain
> 將 **Site URL** 設為你嘅新 domain

---

# Part 2B — Deploy to Replit 🟧 (Alternative) / 第二部分 B：部署到 Replit 🟧（替代方案）

## Steps / 步驟

1. **Click the orange "Run on Replit" button** in the [README](./README.md).
   撳 [README](./README.md) 入面嘅橙色 **"Run on Replit"** 大掣。

2. Replit will **import the repo** into a new Repl. Wait ~1 minute.
   Replit 會將 repo **import 入新 Repl**。等 ~1 分鐘。

3. Click the **🔒 Secrets** tab (left sidebar, padlock icon).
   撳左側欄嘅 **🔒 Secrets** tab（鎖頭 icon）。

4. Add each secret one by one:
   一個一個加 secret：

   | Key | Value |
   |---|---|
   | `POE_KEY` | (from Part 1 Step 1) |
   | `DATABASE_URL` | (from Part 1 Step 2) |
   | `SUPABASE_URL` | (from Part 1 Step 3) |
   | `SUPABASE_PUBLISHABLE_KEY` | (from Part 1 Step 3) |
   | `SUPABASE_KEY` | (from Part 1 Step 3) |
   | `RESEND_API_KEY` | (optional) |

5. In the Replit **Shell** tab, run:
   喺 Replit **Shell** tab 跑：
   ```bash
   bunx prisma migrate deploy
   ```

6. Click the big **▶️ Run** button at the top.
   撳頂部嘅 **▶️ Run** 大掣。

7. Once running, click **Deploy** (top-right) → **Autoscale Deployment**
   → follow the wizard.
   開始 run 之後，撳右上角 **Deploy** → **Autoscale Deployment** → 跟 wizard。

> 💡 Replit's free tier sleeps after inactivity. For a production class app,
> use **Autoscale Deployment** ($1-5/month typical usage).
>
> 💡 Replit 免費版冇人用就會 sleep。課堂正式用建議用
> **Autoscale Deployment**（一般 $1-5／月）。

---

# Part 3 — Load the Lecture Content / 第三部分：載入講義內容

After deployment, the curated bilingual ELEC3120 topics in
`src/lib/knowledge-base.ts` are **already loaded** — no extra step needed for
those.

部署完成後，`src/lib/knowledge-base.ts` 入面嘅雙語 ELEC3120 topic
**已經自動載入**，唔需要額外步驟。

If you want to **add the full lecture PDFs** as searchable content, see the
"Re-seeding" section in `replit.md`.

如果想將 **完整講義 PDF** 加入做可搜尋內容，請睇 `replit.md` 入面
"Re-seeding" 部分。

---

# 🆘 Troubleshooting / 疑難排解

| Problem 問題 | Fix 解決 |
|---|---|
| **"AI generation failed"** in chat / 聊天「AI generation failed」 | Wrong / expired `POE_KEY`. Check Vercel/Replit secrets.<br>`POE_KEY` 錯或過期。檢查 Vercel／Replit 嘅 secret。 |
| **"Database connection failed"** / 「資料庫連線失敗」 | Check `DATABASE_URL` ends with `?sslmode=require`. Re-run `bunx prisma migrate deploy`.<br>檢查 `DATABASE_URL` 結尾有冇 `?sslmode=require`。重跑 `bunx prisma migrate deploy`。 |
| **Login email never arrives** / 登入 email 收唔到 | Check Supabase → Authentication → Email Templates. Also check Spam folder.<br>檢查 Supabase → Authentication → Email Templates。亦睇下垃圾郵件。 |
| **Magic-link redirects to wrong URL** / Magic link 跳去錯嘅 URL | Supabase → Authentication → URL Configuration → set **Site URL** to your live domain.<br>Supabase → Authentication → URL Configuration → 將 **Site URL** 設為你嘅 live domain。 |
| **Build fails with "Module not found"** / Build 出現「Module not found」 | Make sure `bunx prisma generate` ran. Vercel does this automatically via `postinstall`.<br>確保 `bunx prisma generate` 有跑過。Vercel 透過 `postinstall` 自動跑。 |
| **App is slow on first visit** / 首次訪問好慢 | Normal — Vercel cold start. Subsequent visits are instant.<br>正常——Vercel cold start。之後訪問會即時。 |

---

# 📞 Getting Help / 需要協助

- **Course-related questions:** ask Prof. Meng / 課程問題：問 Meng 教授
- **Technical bugs:** open a GitHub Issue on the repo / 技術 bug：去 repo 開 GitHub Issue
- **Vercel / Replit / Neon / Supabase issues:** check their respective docs — they all have great help centres
  Vercel／Replit／Neon／Supabase 問題：睇返佢哋官方 docs，個個都有完善嘅 help centre

---

# ✅ Final Checklist / 最後檢查清單

Before sharing the URL with students, verify:
分享 URL 俾學生之前，請確認：

- [ ] Open the live URL — landing page loads / 打開 live URL，landing page 顯示正常
- [ ] Click **Get Started** → goes to `/login` / 撳 **Get Started** 跳到 `/login`
- [ ] Enter your email → magic link arrives → click it → logs in to `/chat`<br>填 email → 收到 magic link → 撳入去 → 成功登入到 `/chat`
- [ ] Send a message in **Tutor** mode → AI replies / 喺 **Tutor** mode 發訊息 → AI 有回覆
- [ ] Open **Quiz Mode** → generate 5 questions → all 4 difficulty levels work<br>打開 **Quiz Mode** → 產生 5 條題目 → 4 個難度都運作
- [ ] Open **Stats Panel** → click **Generate Study Plan** → plan appears<br>打開 **Stats Panel** → 撳 **Generate Study Plan** → 顯示計劃

If all six pass, you're ready to share with the class. 🎓
六個都 pass，就可以分享俾全班！🎓

# ─── LearningPacer environment variables ──────────────────────────────────
# Copy this file to `.env.local` and fill in your own values.
# 將此檔案複製為 `.env.local` 並填入你自己的數值。
#
# ⚠️  NEVER commit .env or .env.local to GitHub.
# ⚠️  千祈唔好將 .env 或 .env.local commit 上 GitHub。
#
# See DEPLOYMENT.md for step-by-step instructions on where to get each key.
# 詳細步驟請睇 DEPLOYMENT.md。
# ─────────────────────────────────────────────────────────────────────────

# ─── REQUIRED ─────────────────────────────────────────────────────────────

# Poe API key — powers all AI features (chat, quiz, agent, study plan…)
# Get from: https://poe.com → Settings → API Keys
POE_KEY=your-poe-api-key-here

# PostgreSQL connection string. Free options:
#   - Neon:     https://neon.tech         (recommended — serverless, 0.5GB free)
#   - Supabase: https://supabase.com      (free Postgres included with auth)
#   - Vercel:   https://vercel.com/storage/postgres
# IMPORTANT: must end with `?sslmode=require` for Neon.
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require

# Supabase — for magic-link login. Free tier: 50,000 monthly active users.
# Get from: https://supabase.com → your project → Settings → API
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-anon-public-key
SUPABASE_KEY=your-service-role-secret-key

# ─── OPTIONAL ─────────────────────────────────────────────────────────────

# Resend — only needed if you want to send magic-link emails from your own
# domain. Without this, Supabase sends emails from its default address.
# Get from: https://resend.com → API Keys
RESEND_API_KEY=

# Admin secret — gates the lecture re-seeding endpoint
# `/api/knowledge/seed-lectures`. Make up any random string.
# Localhost requests bypass this; only required in production.
ADMIN_SECRET=

# ─── ADVANCED — model overrides (defaults are sensible) ───────────────────
# Override default Poe bots per feature. Leave commented for sensible defaults.
#
# POE_CHAT_MODEL=Claude-Opus-4.7
# POE_QUIZ_MODEL=Gemini-3.1-Pro
# POE_STUDY_PLAN_MODEL=Gemini-3.1-Pro
# POE_AGENT_MODEL=Claude-Opus-4.7
# POE_VISION_MODEL=Gemini-3.1-Pro
