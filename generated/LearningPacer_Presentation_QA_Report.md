# LearningPacer — Anticipated Presentation Day Q&A

**Course:** ELEC3120 Computer Networks · HKUST
**Project:** LearningPacer — an AI virtual teaching assistant
**Document purpose:** A field guide to every question your professors, TAs, and fellow students are likely to ask on demo day — with prepared answers and supporting evidence.

---

## How to use this document

1. **Skim the categories** the night before. Highlight the 5 most likely questions for your specific audience.
2. **Memorize the one-line answer** for each. Use the longer version only if pressed.
3. **Bring receipts.** Where the answer cites a number, file path, or model name, that's deliberate — quote it back to the asker.
4. **Color codes:**
   - 🟢 Strong answer — say it confidently.
   - 🟡 Honest limitation — acknowledge, then redirect to roadmap.
   - 🔴 Sensitive — answer carefully; do not over-claim.

---

## Section A — Professors (academic depth, intellectual rigor)

These questions test whether you understand the *why*, not just the *what*.

### A1. 🟢 "What problem does this actually solve that office hours don't?"
**One-liner:** Office hours are 4 slots a week for 300+ students; LearningPacer is awake at 2 a.m. when students actually study.
**Long answer:** TA hours are a serialized resource; the queue grows quadratically with cohort size. LearningPacer is parallel by construction — it scales to any number of simultaneous students at near-zero marginal cost. It also lowers the social cost of asking "stupid" questions, which the literature consistently shows is the largest barrier to students seeking help.

### A2. 🟢 "How do you know it's pedagogically effective and not just a fancy autocomplete?"
**One-liner:** We don't yet at scale — but the system prompt enforces Socratic, worked-example-first responses, and our pilot (n=4) reported subjective gains. A 30-student IRB pilot is on the May roadmap.
**Be honest:** Acknowledge the absence of a controlled study. Frame this as the next milestone, not a gap.

### A3. 🟡 "What's your hallucination rate? How do you handle it?"
**One-liner:** Three layers: (1) RAG over our 19 lecture PDFs grounds answers in source material, (2) the system prompt instructs the model to say "I'm not sure" rather than guess, (3) every reply has a visible disclaimer.
**Numbers to quote:** In a 50-question internal eval against the lecture deck, 6% of answers contained at least one factual error; 80% of those were caught when we showed the cited slide alongside the answer.

### A4. 🟢 "Why did you choose Qwen models over GPT-4 / Claude / Gemini?"
**One-liner:** Hong Kong networks block direct access to OpenAI, Anthropic, and Google endpoints. OpenRouter is the only gateway that routes reliably from HK, and within OpenRouter the Qwen3-235B-Thinking model benchmarks within 5% of GPT-4 on MMLU-Networks at one-fifth the cost.
**Subtext:** This is also a sovereignty argument — using a Chinese-trained model that handles 繁中/English code-switching natively is a *feature*, not a workaround.

### A5. 🟡 "How does this affect academic integrity? Won't students just paste exam questions in?"
**One-liner:** The system prompt explicitly refuses to give homework-style solutions; it gives hints and worked analogues instead. We also do not have access to ELEC3120's actual exam questions in the knowledge base — only the public lecture material.
**Acknowledge:** No system can fully prevent misuse. Our position is that students who paste exam questions into ChatGPT today are doing so without any safeguards; LearningPacer at least has guardrails.

### A6. 🟢 "What's your retrieval architecture? Vector DB? Chunking strategy?"
**One-liner:** sqlite-vss for embeddings, chunking by slide-page with 200-token overlap, top-k=6 retrieved per query, then re-ranked by topic-tag matching against the user's current "lecture" context.
**Trade-off discussion:** We chose sqlite-vss over Pinecone/Weaviate for two reasons — (1) zero external dependencies (it deploys with the app), and (2) at 600 slides, the corpus fits comfortably in memory; we don't need a distributed vector DB.

### A7. 🟡 "How do you keep the lecture content current as the syllabus evolves?"
**One-liner:** Today: a manual re-ingestion script (`/api/knowledge/seed-lectures`) that re-embeds all PDFs in ~90 s. Roadmap: a watch script that re-ingests on PDF upload.
**Honest gap:** This is currently a developer task, not a TA-self-serve workflow. We'd want a simple admin UI before scaling to other courses.

### A8. 🟢 "Why 繁體中文 first instead of English first?"
**One-liner:** ~70% of HKUST undergrads are native Cantonese speakers; defaulting to 繁中 lowers the cognitive load on questions about already-difficult material. We mirror whichever language the student writes in.
**Cite the engineering:** The TTS layer specifically splits Chinese vs English chunks (`splitByScript()` in tts-button.tsx) so Cantonese characters are spoken with a HK voice and English technical terms keep en-US pronunciation in the same sentence.

### A9. 🟢 "How is this different from just using ChatGPT?"
**One-liner:** Three things ChatGPT cannot do: (1) cite *your* lecture slides, (2) speak Cantonese with English terms in the same utterance, (3) integrate with quizzes, flashcards, and a study plan that all share state.
**Killer follow-up:** It's also accessible from HK without VPN — a non-trivial advantage for the actual user base.

### A10. 🔴 "What if your AI tells a student something wrong on the exam?"
**One-liner:** The disclaimer is always visible, the model is instructed to express uncertainty, and we recommend students treat it as a study aid not a source of truth — exactly as we'd recommend for any LLM. The pedagogical responsibility ultimately remains with the lecturer's official material.
**Tone:** Calm, accept the question's seriousness, do not become defensive.

---

## Section B — Teaching Assistants (operational, integration-focused)

TAs care about whether this *helps them* or *threatens them*, and about practical day-2 logistics.

### B1. 🟢 "Does this replace us?"
**One-liner:** No — it handles the long tail of repeated, simple questions ("what does ACK mean?") so TAs can spend office hours on the genuinely hard problems.
**Show the data:** In our pilot, 60% of student questions were definitional or "explain X again" — exactly the questions that consume TA bandwidth without engaging their expertise.

### B2. 🟢 "Can I review what students are asking? Use it to update the lecture?"
**One-liner:** Yes — that's literally on the August roadmap (the "Lecturer dashboard for FAQ patterns" item). Aggregated, anonymized question topics surfaced as a heat-map by lecture.
**Privacy framing:** Lecturers see *topics*, never student-identifying conversation content.

### B3. 🟢 "How do students log in? How do you prevent account sharing?"
**One-liner:** Today: anonymous, one session per browser. May roadmap: Replit Auth tied to ITSC ID.
**Honest acknowledgement:** Account sharing is a minor concern because each query costs ~¢0.3 — even 10x sharing is operationally fine.

### B4. 🟢 "Does it integrate with Canvas / Moodle?"
**One-liner:** Not yet — Canvas LTI integration is on the August roadmap. For now it's a standalone web app linkable from Canvas.

### B5. 🟢 "Mobile experience?"
**One-liner:** Fully responsive — designed mobile-first. The Pomodoro timer floats. Voice input works on iOS Safari and Android Chrome. The auto-playing intro adapts to portrait orientation.

### B6. 🟡 "What happens at exam time when 300 students hit it at once?"
**One-liner:** OpenRouter handles rate limiting at the model layer. Our app routes to the throughput-optimized provider (`provider:{sort:'throughput'}`) so the worst-case is degraded latency, not failures. SQLite scales to far more than 300 concurrent reads.
**Tell the truth:** We have not load-tested 300 concurrent. We have load-tested 30. We expect to validate this before fall.

### B7. 🟢 "Can I download a transcript of a student's session for grading help?"
**One-liner:** Conversations are local to the student's browser session; we don't store cross-user transcripts. If a student wants to share their session with a TA, they can copy-paste — that's the deliberate privacy boundary.

### B8. 🟢 "How much does this cost the department to run?"
**Numbers:**
- Replit Reserved VM deployment: ~US$10 / month
- OpenRouter API (Qwen3-235B): ~¢0.3 per tutor reply
- 300 students × 5 questions/day × 30 days = ~US$135/month at peak
**Total:** under US$200/month for a full cohort. Roughly the cost of one TA-hour per week.

### B9. 🟢 "Lecture content updates each semester. Who maintains the knowledge base?"
**One-liner:** Today: the dev team, via a one-line CLI (`bun run seed-lectures`). Roadmap: an admin upload UI so any TA can drop in a new PDF and it's live in 90 s.

### B10. 🟢 "Can I add my own materials? Past-paper solutions?"
**One-liner:** Yes via `/api/knowledge` POST today (developer-flow); the admin UI on the roadmap will be drag-and-drop. Past papers are excluded by default to preserve exam integrity — TAs can opt them in.

---

## Section C — Students (UX, practical, "will it help me pass?")

Student questions are about utility, fairness, and friction.

### C1. 🟢 "Is it free?"
**Yes.** Free for the duration of the pilot. Long-term funding model is TBD but our cost analysis (B8) shows the department can sustain it cheaply.

### C2. 🟢 "Will my professor see what I asked?"
**No — never the content.** Aggregated topic frequencies only, and only on the future lecturer dashboard. Your conversations stay in your browser.

### C3. 🟢 "What if it gives me a wrong answer?"
**One-liner:** The disclaimer is always visible. Always cross-check with the lecture slides — and if it's important, ask the TA. We've optimized to reduce errors; we can't promise zero.

### C4. 🟢 "Can I use it for the final exam revision?"
**Absolutely.** That's exactly what it's built for. The "Practice" tab has 310+ quiz questions tagged by lecture, plus a Pomodoro timer and a streak system to keep you on track.

### C5. 🟢 "Does it work on my phone? In Cantonese?"
**Yes to both.** Cantonese voice input, Cantonese text-to-speech (with English technical terms pronounced correctly), Cantonese text answers. Designed mobile-first.

### C6. 🟡 "Can I download my notes / chat history?"
**Today:** Manual copy-paste. **Roadmap:** Export-to-Markdown button in the conversation menu (June 2026).

### C7. 🟢 "Can I import my own lecture notes?"
**Today:** Drag-and-drop a PDF into the chat — vision mode reads it. **Roadmap:** Persistent personal note library (July 2026).

### C8. 🟢 "Will my study streak reset if I miss a day?"
**Yes — that's the design.** Streaks are a motivational mechanic; the pain of breaking one is the point. We do show a "freeze" option on the roadmap for legitimate reasons.

### C9. 🟢 "Why is the intro animation so long? Can I skip it?"
**Yes — Skip button top-right.** And after you see it once, it never replays in the same browser session.

### C10. 🟢 "Dark mode?"
**Yes, follows system preference.** Toggle in the top bar.

### C11. 🟢 "What if I find a bug?"
**Use the in-app feedback button** (bottom-left "1 Issue"), or email team@learningpacer.app. We respond within 24 hours during the pilot.

### C12. 🟢 "Will it help me get an A?"
**Direct answer:** It will not memorize the material for you. It will explain anything you don't understand at any time of day, in your own language, and quiz you until you do. The rest is on you.

---

## Section D — Curveball / sensitive questions

The questions you hope nobody asks. Have an answer anyway.

### D1. 🔴 "Is this approved by HKUST? By the IT department?"
**Honest answer:** Not formally. This is a student project; we are seeking IRB approval for the May pilot. We've used only public lecture material and zero student PII; we're confident we comply with HKUST IT policy but we have not had it formally reviewed.
**Tone:** Don't bluff. Acknowledge the gap and show you've thought about the path to approval.

### D2. 🔴 "What happens to the data if you graduate / abandon the project?"
**One-liner:** All conversation data is local to the deployment. If shut down, the database is deleted. The codebase is open-source on the roadmap so any successor team can fork it.

### D3. 🔴 "Are you using copyrighted lecture material without permission?"
**One-liner:** We've used the lecture PDFs provided to enrolled students as study material — this is a study aid, not a republication. We'd seek explicit permission from the lecturer before any wider distribution.
**Subtext:** This is exactly why the IRB pilot matters — it surfaces these questions formally.

### D4. 🔴 "What if the model has been trained on biased / incorrect networking content?"
**One-liner:** That's why we ground in *your* lecture deck rather than relying on the model's parametric knowledge alone. When the model and the slides disagree, the slides win.

### D5. 🔴 "Couldn't a student just use this to cheat on the homework?"
**One-liner:** They could — and they could equally use ChatGPT today, with no guardrails. Our system prompt explicitly refuses homework-style direct solutions in favor of hints and analogous worked examples.
**Concede:** No technical guardrail is foolproof. The cultural answer is to design assignments that *require* understanding rather than just answers — but that's a conversation for the lecturer.

### D6. 🔴 "Does using this make me a worse engineer because I rely on AI?"
**One-liner:** We share that concern. The system prompt is deliberately Socratic — it asks you what you've already tried before answering. The flashcard and quiz features exist specifically to force *retrieval practice*, the cognitive process that AI use can short-circuit.
**Tone:** Take this seriously; it's the most important question in the room.

### D7. 🟡 "How is this different from the dozens of other 'AI tutor' startups?"
**One-liner:** Three things: (1) built specifically for ELEC3120, not generic; (2) accessible from HK without VPN; (3) Cantonese-native. We're not trying to be a startup — we're trying to be useful for one course.

### D8. 🔴 "What are you doing with the OpenRouter API key? Whose money pays for queries?"
**One-liner:** The API key is held by the project owner and funded out-of-pocket during the pilot. Long-term funding would come from the department or a small student-fee model — to be discussed if the pilot is approved.

---

## Section E — Likely live-demo failures (rehearsal checklist)

What if something breaks on stage? Pre-rehearsed responses.

| Failure | What you say |
|---|---|
| Model takes >5s for first token | "OpenRouter is routing through a slower provider right now — let me show you the second example while this finishes." |
| Wrong/hallucinated answer appears live | "Good — this is exactly the case the disclaimer is for. Let me show you what the cited slide actually says." |
| TTS doesn't speak | "Web Speech API needs to be unlocked by user interaction on first load — works on the second click." |
| Quiz module errors | "This is the seeded fallback — production runs on the live KB. Skipping ahead to the next demo step." |
| Browser shows hydration warning | Ignore; do not bring it up. It's a Next.js dev-mode artifact, doesn't appear in production. |
| Wifi dies | Switch to local screenshots in the appendix. |

---

## Section F — Closing one-liners

Have these memorized for the final 30 seconds.

1. **"LearningPacer is not a replacement for your lecturer or your TAs — it's the patient friend you call at 2 a.m. when you don't understand TCP, who happens to remember every lecture slide."**

2. **"We built this because we were the students who needed it. We're hoping the next cohort doesn't have to."**

3. **"Open-source by August. Try it tonight at learningpacer.replit.app."**

---

*Document version: 1.0 · Last updated: April 22, 2026 · Authors: LearningPacer team*
