'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { LandingHeroAnimation } from '@/components/landing-hero-animation';
import {
  GraduationCap,
  Code2,
  Image as ImageIcon,
  Sparkles,
  BookOpen,
  Languages,
  FileDown,
  Globe,
  Brain,
  ShieldCheck,
  ArrowRight,
  Check,
  X,
  Quote,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

type Lang = 'en' | 'zh';

const COPY = {
  en: {
    nav: { features: 'Features', compare: 'Why Us', faq: 'How It\'s Different', signin: 'Sign in', cta: 'Start Learning' },
    eyebrow: 'ELEC3120 · COMPUTER NETWORKS · HKUST',
    heroTitle1: 'Pass ELEC3120',
    heroTitle2: 'with an AI that actually',
    heroTitleAccent: 'reads your lectures.',
    heroSub:
      'LearningPacer is a virtual TA built on the real ELEC3120 lecture decks. Every answer cites the slide it came from — no hallucinations, no generic textbook fluff.',
    ctaPrimary: 'Start Learning — Free',
    ctaSecondary: 'See how it works',
    trustBadge: 'Grounded in ELEC3120 L01–L17 with page-level citations',
    featuresEyebrow: 'FOUR MODES, ONE TUTOR',
    featuresTitle: 'Built for how engineering students actually study',
    features: [
      { icon: GraduationCap, title: 'Tutor Mode', body: 'Ask any concept — TCP cwnd, ARP poisoning, CSMA/CD — and get an Answer / Warrant / Evidence breakdown with Mermaid diagrams and LaTeX equations.' },
      { icon: Code2, title: 'Code Mode', body: 'Socket programming, Wireshark filters, traceroute scripts. Inline syntax-highlighted code with explanations, not just copy-paste.' },
      { icon: ImageIcon, title: 'Image Mode', body: 'Upload a past-paper figure or hand-drawn topology. The AI reads it, explains every node, and walks through the answer.' },
      { icon: Sparkles, title: 'Agent Mode', body: 'One click → a full mock final exam PDF, complete with cover page, MCQs, structured questions, and an answer key.' },
    ],
    compareEyebrow: 'WHY NOT JUST USE CHATGPT?',
    compareTitle: 'Generic AI vs. a tutor that knows ELEC3120',
    compareCols: { feature: 'Capability', generic: 'ChatGPT / Gemini', us: 'LearningPacer' },
    compareRows: [
      { f: 'Trained on YOUR lecture slides', g: false, u: true },
      { f: 'Cites the exact slide & page #', g: false, u: true },
      { f: 'Generates ELEC3120-format mock exams', g: false, u: true },
      { f: 'Bilingual (EN ↔ 繁中) with HK terminology', g: 'Partial', u: true },
      { f: 'Switches between 6 frontier models live', g: false, u: true },
      { f: 'Mermaid + LaTeX rendered in chat', g: 'Partial', u: true },
      { f: 'Pomodoro, flashcards, daily-goal tracking', g: false, u: true },
    ],
    diffEyebrow: 'WHAT MAKES IT DIFFERENT',
    diffTitle: 'Three things no general-purpose chatbot does',
    diffs: [
      { icon: BookOpen, title: 'Cited from real lectures',
        body: 'Every claim links back to a specific lecture and page. If GLM-4.6 says "see L07 p.14", you can verify it in one click. No more guessing if the AI made it up.' },
      { icon: Brain, title: 'Multi-model, on demand',
        body: 'Switch between GLM-4.6, Gemini 2.5 Pro, Claude Sonnet 4, GPT-5, DeepSeek and Grok mid-conversation. Use the cheap fast one for definitions, the frontier one for hard derivations.' },
      { icon: Languages, title: 'Built for HK students',
        body: 'Replies default to English; auto-switches to 繁體中文 when you write Chinese. Technical terms (cwnd, RTT, MAC) always stay in English. Cantonese-friendly tone.' },
    ],
    bottomCtaTitle: 'Stop scrolling lecture PDFs at 2 AM.',
    bottomCtaSub: 'Open a chat, paste your question, get a cited answer in seconds.',
    bottomCtaBtn: 'Open LearningPacer',
    footer: 'Built for HKUST ELEC3120 students · Final-Year Project',
  },
  zh: {
    nav: { features: '功能', compare: '對比', faq: '同 ChatGPT 有咩唔同', signin: '登入', cta: '開始學習' },
    eyebrow: 'ELEC3120 · 計算機網絡 · 香港科技大學',
    heroTitle1: '考贏 ELEC3120',
    heroTitle2: '用一個真正',
    heroTitleAccent: '讀過你 lecture 嘅 AI。',
    heroSub:
      'LearningPacer 係一個 virtual TA，直接食晒成個 ELEC3120 lecture deck。每一個答案都會引用返出處 slide 同頁數 — 唔會吹水，唔會用 generic 教科書答你。',
    ctaPrimary: '開始學習 — 免費',
    ctaSecondary: '睇下點 work',
    trustBadge: '所有答案都連結到 ELEC3120 L01–L17 嘅實際頁數',
    featuresEyebrow: '四個 MODE，一個 TUTOR',
    featuresTitle: '為 engineering 學生實際讀書方式而設計',
    features: [
      { icon: GraduationCap, title: 'Tutor Mode', body: '問任何 concept — TCP cwnd、ARP poisoning、CSMA/CD — 都會用 Answer / Warrant / Evidence 結構答你，連 Mermaid 圖同 LaTeX 公式。' },
      { icon: Code2, title: 'Code Mode', body: 'Socket programming、Wireshark filter、traceroute script。Code 有 syntax highlight 加解釋，唔係淨係俾你 copy paste。' },
      { icon: ImageIcon, title: 'Image Mode', body: '上載 past paper 嘅圖或者手畫 topology，AI 會睇得明，逐個 node 解釋，再 walk through 答案。' },
      { icon: Sparkles, title: 'Agent Mode', body: '一 click → 一份完整 ELEC3120 mock final PDF，連封面、MCQ、structured question 同 answer key。' },
    ],
    compareEyebrow: '點解唔用 CHATGPT？',
    compareTitle: 'Generic AI vs. 識 ELEC3120 嘅 tutor',
    compareCols: { feature: '能力', generic: 'ChatGPT / Gemini', us: 'LearningPacer' },
    compareRows: [
      { f: '直接讀你嘅 lecture slides', g: false, u: true },
      { f: '引用具體 slide 同頁數', g: false, u: true },
      { f: '出 ELEC3120 格式嘅 mock exam', g: false, u: true },
      { f: '中英雙語（含香港用詞）', g: '部分', u: true },
      { f: '即場切換 6 個 frontier model', g: false, u: true },
      { f: 'Chat 入面 render Mermaid + LaTeX', g: '部分', u: true },
      { f: 'Pomodoro、flashcard、每日目標追蹤', g: false, u: true },
    ],
    diffEyebrow: '同其他 AI 有咩唔同',
    diffTitle: '三樣 generic chatbot 做唔到嘅嘢',
    diffs: [
      { icon: BookOpen, title: '答案引用真實 lecture',
        body: '每個論點都連結到具體 lecture 同頁數。GLM-4.6 講「睇 L07 p.14」你可以即刻 click 入去 verify，唔使估 AI 係咪吹水。' },
      { icon: Brain, title: '多模型即時切換',
        body: '一段對話入面可以切換 GLM-4.6、Gemini 2.5 Pro、Claude Sonnet 4、GPT-5、DeepSeek、Grok。簡單問題用快平模型，難 derivation 用 frontier。' },
      { icon: Languages, title: '為香港學生而設',
        body: '預設英文回覆；你用中文佢就轉繁體中文。技術詞（cwnd、RTT、MAC）永遠保留英文。Cantonese-friendly。' },
    ],
    bottomCtaTitle: '唔好再凌晨兩點 scroll lecture PDF。',
    bottomCtaSub: '打開 chat，貼問題，幾秒鐘攞到附 citation 嘅答案。',
    bottomCtaBtn: '開啟 LearningPacer',
    footer: '為 HKUST ELEC3120 學生而做 · Final-Year Project',
  },
} as const;

export default function LandingPage() {
  const [lang, setLang] = useState<Lang>('en');
  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('lp-lang') : null;
    if (stored === 'zh' || stored === 'en') setLang(stored);
  }, []);
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('lp-lang', lang);
  }, [lang]);

  const t = COPY[lang];

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-white antialiased selection:bg-emerald-400/30">
      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-[#0a0a0b]/70 border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.4)]">
              <GraduationCap className="h-4 w-4 text-[#0a0a0b]" />
            </div>
            <span className="font-semibold tracking-tight">LearningPacer</span>
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-sm text-white/60">
            <a href="#features" className="hover:text-white transition">{t.nav.features}</a>
            <a href="#compare" className="hover:text-white transition">{t.nav.compare}</a>
            <a href="#diff" className="hover:text-white transition">{t.nav.faq}</a>
          </nav>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}
              className="text-xs px-2.5 py-1.5 rounded-md text-white/60 hover:text-white hover:bg-white/5 transition flex items-center gap-1.5"
              aria-label="Toggle language"
            >
              <Globe className="h-3.5 w-3.5" />
              {lang === 'en' ? '中文' : 'EN'}
            </button>
            <Link href="/login" className="text-sm px-3 py-1.5 rounded-md text-white/70 hover:text-white hover:bg-white/5 transition">
              {t.nav.signin}
            </Link>
            <Link
              href="/chat"
              className="text-sm px-3.5 py-1.5 rounded-md bg-white text-[#0a0a0b] hover:bg-white/90 font-medium transition shadow-[0_0_30px_rgba(255,255,255,0.15)]"
            >
              {t.nav.cta}
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ── full-viewport cinematic, Apple-style ───────────────── */}
      <section className="relative w-full overflow-hidden min-h-[560px] md:min-h-[640px] md:h-[calc(100vh-3.5rem)] py-16 md:py-0">
        {/* Full-bleed animated network background (sits behind the copy) */}
        <LandingHeroAnimation />

        {/* Foreground copy — centred, big type, glassy chips */}
        <div className="relative z-10 h-full w-full flex items-center">
          <div className="max-w-6xl w-full mx-auto px-6 lg:pr-[280px]">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-400/40 bg-emerald-400/10 backdrop-blur text-[11px] font-mono tracking-wider text-emerald-200 mb-6 shadow-[0_0_30px_rgba(16,185,129,0.15)]">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 motion-safe:animate-pulse" />
                {t.eyebrow}
              </div>
              <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-[5.5rem] font-bold tracking-[-0.03em] leading-[0.98] text-white drop-shadow-[0_2px_30px_rgba(0,0,0,0.6)]">
                {t.heroTitle1}
                <br />
                {t.heroTitle2}{' '}
                <span className="bg-gradient-to-r from-emerald-300 via-cyan-200 to-emerald-300 bg-clip-text text-transparent">
                  {t.heroTitleAccent}
                </span>
              </h1>
              <p className="mt-7 text-lg md:text-xl text-white/75 leading-relaxed max-w-2xl drop-shadow-[0_2px_15px_rgba(0,0,0,0.5)]">
                {t.heroSub}
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link href="/chat">
                  <Button size="lg" className="bg-emerald-400 text-[#0a0a0b] hover:bg-emerald-300 font-semibold shadow-[0_0_50px_rgba(16,185,129,0.45)] h-12 px-7 text-base">
                    {t.ctaPrimary} <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Button>
                </Link>
                <a href="#features">
                  <Button size="lg" variant="ghost" className="text-white/85 hover:text-white hover:bg-white/10 backdrop-blur h-12 px-6 text-base">
                    {t.ctaSecondary}
                  </Button>
                </a>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-white/55">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                  {t.trustBadge}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-cyan-400" />
                  6 models · live switch
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <FileDown className="h-3.5 w-3.5 text-emerald-400" />
                  Mock paper → PDF
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Scroll cue (hidden on short screens to avoid CTA overlap) */}
        <div className="hidden md:flex absolute bottom-6 left-1/2 -translate-x-1/2 z-10 text-white/40 text-[10px] font-mono tracking-[0.25em] flex-col items-center gap-2 lp-scroll-cue">
          SCROLL
          <span className="block h-6 w-px bg-gradient-to-b from-white/40 to-transparent" />
        </div>

        <style jsx>{`
          .lp-scroll-cue {
            animation: lp-scroll-pulse 2.4s ease-in-out infinite;
          }
          @keyframes lp-scroll-pulse {
            0%, 100% { opacity: 0.35; transform: translate(-50%, 0); }
            50%      { opacity: 0.85; transform: translate(-50%, 4px); }
          }
          @media (prefers-reduced-motion: reduce) {
            .lp-scroll-cue { animation: none; opacity: 0.5; }
          }
        `}</style>
      </section>

      {/* ── Features grid ───────────────────────────────────────────────── */}
      <section id="features" className="py-24 border-t border-white/5">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <p className="text-xs font-mono tracking-[0.2em] text-emerald-400 mb-3">{t.featuresEyebrow}</p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">{t.featuresTitle}</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {t.features.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="group relative p-6 rounded-xl bg-white/[0.02] border border-white/10 hover:border-emerald-400/40 hover:bg-white/[0.04] transition-all duration-300"
                >
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-b from-emerald-400/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                  <div className="relative">
                    <div className="h-10 w-10 rounded-lg bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <Icon className="h-5 w-5 text-emerald-300" />
                    </div>
                    <h3 className="font-semibold mb-2 tracking-tight">{f.title}</h3>
                    <p className="text-sm text-white/55 leading-relaxed">{f.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Differentiators (3-col) ─────────────────────────────────────── */}
      <section id="diff" className="py-24 border-t border-white/5 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-emerald-500/5 rounded-full blur-[120px] -z-10" />
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <p className="text-xs font-mono tracking-[0.2em] text-emerald-400 mb-3">{t.diffEyebrow}</p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">{t.diffTitle}</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {t.diffs.map((d, i) => {
              const Icon = d.icon;
              return (
                <div key={d.title} className="relative p-7 rounded-2xl bg-gradient-to-b from-white/[0.04] to-transparent border border-white/10">
                  <div className="absolute top-4 right-4 text-[10px] font-mono text-white/30">0{i + 1}</div>
                  <Icon className="h-7 w-7 text-emerald-300 mb-5" />
                  <h3 className="text-lg font-semibold mb-3 tracking-tight">{d.title}</h3>
                  <p className="text-sm text-white/60 leading-relaxed">{d.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Comparison table ───────────────────────────────────────────── */}
      <section id="compare" className="py-24 border-t border-white/5">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <p className="text-xs font-mono tracking-[0.2em] text-emerald-400 mb-3">{t.compareEyebrow}</p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">{t.compareTitle}</h2>
          </div>

          <div className="rounded-2xl border border-white/10 overflow-hidden bg-white/[0.02]">
            <div className="grid grid-cols-[1.5fr_1fr_1fr] text-xs font-mono uppercase tracking-wider text-white/50 border-b border-white/10 bg-white/[0.02]">
              <div className="p-4">{t.compareCols.feature}</div>
              <div className="p-4 text-center">{t.compareCols.generic}</div>
              <div className="p-4 text-center text-emerald-300 bg-emerald-400/5">{t.compareCols.us}</div>
            </div>
            {t.compareRows.map((row, i) => (
              <div
                key={i}
                className="grid grid-cols-[1.5fr_1fr_1fr] border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition"
              >
                <div className="p-4 text-sm text-white/80">{row.f}</div>
                <div className="p-4 flex items-center justify-center text-sm text-white/50">
                  {row.g === true ? (
                    <Check className="h-4 w-4 text-white/40" />
                  ) : row.g === false ? (
                    <X className="h-4 w-4 text-white/30" />
                  ) : (
                    <span className="text-xs">{row.g}</span>
                  )}
                </div>
                <div className="p-4 flex items-center justify-center bg-emerald-400/5">
                  {row.u === true ? (
                    <Check className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <X className="h-4 w-4 text-white/30" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Quote / Trust ──────────────────────────────────────────────── */}
      <section className="py-20 border-t border-white/5">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <Quote className="h-8 w-8 text-emerald-400/50 mx-auto mb-6" />
          <p className="text-xl md:text-2xl text-white/80 leading-relaxed font-light tracking-tight">
            {lang === 'en'
              ? '"It\'s the only AI that knows what \'L07 slide 14\' actually says — and tells me when I\'m wrong, with the page reference."'
              : '「呢個係唯一一個真係知道 L07 第 14 頁有咩內容嘅 AI — 而且會話我知答錯，連 page reference 都俾埋。」'}
          </p>
          <p className="mt-4 text-sm text-white/40 font-mono">— ELEC3120 student, Spring 2026</p>
        </div>
      </section>

      {/* ── Bottom CTA ─────────────────────────────────────────────────── */}
      <section className="py-24 border-t border-white/5">
        <div className="max-w-4xl mx-auto px-6">
          <div className="relative overflow-hidden rounded-3xl border border-emerald-400/20 bg-gradient-to-br from-emerald-500/10 via-cyan-500/5 to-transparent p-12 md:p-16 text-center">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(16,185,129,0.15),transparent_60%)]" />
            <div className="relative">
              <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">{t.bottomCtaTitle}</h2>
              <p className="text-white/60 max-w-xl mx-auto mb-8">{t.bottomCtaSub}</p>
              <Link href="/chat">
                <Button size="lg" className="bg-emerald-400 text-[#0a0a0b] hover:bg-emerald-300 font-semibold shadow-[0_0_40px_rgba(16,185,129,0.4)]">
                  {t.bottomCtaBtn} <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/5 py-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-white/40">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-emerald-400" />
            <span className="font-medium text-white/60">LearningPacer</span>
            <span>· {t.footer}</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/chat" className="hover:text-white transition">{t.nav.cta}</Link>
            <Link href="/login" className="hover:text-white transition">{t.nav.signin}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
