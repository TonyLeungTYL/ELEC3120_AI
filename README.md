LearningPacer — ELEC3120 Virtual TA
AI-powered virtual teaching assistant for HKUST ELEC3120 — Computer & Communication Networks HKUST ELEC3120「電腦與通訊網絡」AI 虛擬助教

A bilingual (English / 繁體中文) Next.js learning app that helps students study Computer Networks through chat, code analysis, image understanding, an autonomous study agent, AI-generated quizzes, study plans, and weak-concept analysis — all grounded in the actual ELEC3120 lecture material.

一個雙語（英文 / 繁體中文）嘅 Next.js 學習應用，透過聊天、程式碼分析、圖像理解、 自主學習代理、AI 測驗、學習計劃、弱項分析等功能，幫助學生學習電腦網絡—— 全部基於真正嘅 ELEC3120 講義內容。

🚀 One-Click Deploy / 一鍵部署
Choose either platform — both are free for normal student traffic. 任選一個平台——兩者對一般學生流量都係免費。

Unsupported image

Unsupported image

👉 First time deploying? Read the full step-by-step guide: 👉 第一次部署？ 請睇完整圖文教學： 📖 DEPLOYMENT.md (English + 中文)

✨ Features / 功能
Mode 模式	What it does 功能
💬 Tutor Chat 導師聊天	Ask questions about networking, get answers cited from ELEC3120 lectures
就網絡問題提問，答案會引用 ELEC3120 講義
💻 Code Mode 程式碼模式	Explain / debug network-related code (sockets, TCP, HTTP …)
解釋／除錯網絡相關程式碼（socket、TCP、HTTP……）
🖼️ Image Mode 圖像模式	Upload network diagrams / textbook screenshots → AI explains them
上載網絡圖／課本截圖 → AI 講解內容
🤖 Agent Mode 代理模式	Autonomous tool-using agent that can search KB, browse web, generate study PDFs
自主代理，可搜尋知識庫、上網、產生學習 PDF
📝 Quiz Mode 測驗模式	AI-generated bilingual MCQs at 3 difficulty levels (Easy / Medium / Hard)
AI 產生嘅雙語選擇題，3 種難度（易／中／難）
📊 Study Stats + Plan 學習統計與計劃	Track progress, find weak topics, get personalised study plan
追蹤進度、找出弱項、獲得個人化學習計劃
🧠 Tech Stack
Next.js 16 (App Router, Turbopack) + React 19 + TypeScript
Tailwind CSS v4 + shadcn/ui components
Prisma ORM + PostgreSQL (any provider — Neon / Supabase / Vercel Postgres)
Poe API (OpenAI-compatible) — Claude Opus 4.7, Gemini 3.1 Pro, GPT-5, Grok 4 …
Supabase Auth — magic-link login (passwordless)
Resend — magic-link email delivery (optional)
bun — package manager / runtime
🔑 Required API Keys / 需要嘅 API Key
You will need to register for these (all have free tiers). 你需要登記以下 service（全部都有免費額度）。

Variable 變數名	Service 服務	Where to get 邊度攞	Required?
POE_KEY	Poe.com	Poe → Settings → API Keys	✅ Yes
DATABASE_URL	Neon (recommended)	Neon → Create project → Copy connection string	✅ Yes
SUPABASE_URL	Supabase	Project → Settings → API → Project URL	✅ Yes
SUPABASE_PUBLISHABLE_KEY	Supabase	Settings → API → anon public key	✅ Yes
SUPABASE_KEY	Supabase	Settings → API → service_role key (⚠️ secret)	✅ Yes
RESEND_API_KEY	Resend	Dashboard → API Keys	Optional (custom magic-link emails)
ADMIN_SECRET	Make one up	Any random string	Optional (gates /api/knowledge/seed-lectures)
📖 Step-by-step screenshots for every key: see DEPLOYMENT.md 📖 每個 key 嘅圖文教學： 請睇 DEPLOYMENT.md

🛠️ Local Development / 本地開發
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

📁 Project Structure / 專案結構
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

🌍 Languages / 語言
AI replies default to English and switch to the student's language only when they write in another language.
AI 回覆預設係 英文，只係當學生用其他語言提問時先轉。
When responding in Chinese, Traditional Chinese (繁體中文 — HK / TW) is enforced. Never Simplified.
用中文回覆時強制使用 繁體中文（香港／台灣），唔會出簡體字。
Technical terms always stay in their original English form.
技術名詞永遠保留英文原文。
📜 License
This project was developed as part of an HKUST ELEC4900 Final Year Project. 本項目為香港科技大學 ELEC4900 Final Year Project 嘅一部分。

Lecture content is © Prof. Meng's ELEC3120 course materials (HKUST). The codebase is provided for educational use within the course.

講義內容版權歸 ELEC3120 課程及 Meng 教授（香港科技大學）所有。程式碼僅供 課程內教學使用。

🙏 Acknowledgements
Prof. Meng — ELEC3120 lecturer and project advisor
HKUST ELEC department — for the FYP opportunity
Replit — initial development environment
Poe / Anthropic / Google / OpenAI / xAI — model providers
