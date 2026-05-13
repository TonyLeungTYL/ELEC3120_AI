/**
 * Agent Mode endpoint.
 *
 * Runs an OpenAI-compatible function-calling loop:
 *   1. Send messages + tool schemas to the model.
 *   2. If the model returns `tool_calls`, execute each tool, feed the
 *      results back as `role:"tool"` messages and loop.
 *   3. When the model returns plain `content`, that's the final answer.
 *
 * The endpoint streams Server-Sent Events back to the client so the
 * frontend can render a live "step trail" of every reasoning + tool
 * interaction. Event types:
 *
 *   { type: 'status',      stage: 'starting' | 'thinking' | ... }
 *   { type: 'tool_call',   id, name, args }
 *   { type: 'tool_result', id, name, summary, display? }
 *   { type: 'text',        text }                // final answer chunk(s)
 *   { type: 'error',       message }
 *   { type: 'done' }
 */

import { NextRequest } from 'next/server';
import {
  openrouterChatWithTools,
  type AgentMessage,
  type ChatMessage,
  type ToolCall,
} from '@/lib/openrouter';
import { AGENT_TOOLS, executeTool } from '@/lib/agent/tools';
import { db } from '@/lib/db';

// Provider-aware default. When POE_KEY is set we route through Poe and
// use a Poe bot id (case-sensitive bot name). Otherwise we use an
// OpenRouter model id. Override either with OPENROUTER_AGENT_MODEL —
// despite the name, that env var wins regardless of provider.
const DEFAULT_AGENT_MODEL =
  process.env.OPENROUTER_AGENT_MODEL ||
  (process.env.POE_KEY || process.env.POE_API_KEY
    ? process.env.POE_AGENT_MODEL || 'Gemini-3.1-Pro'
    : 'z-ai/glm-4.6');

// Bumped to 50 because mock-exam builds now batch ≤8 questions per
// `pdf_add_section_content` call. A 7-section, ~37-question paper takes
// roughly: 2 searches + 1 create_draft + (Section A's 20 MCQs ÷ 8 ≈ 3
// calls) + 6 single-call sections + 1 render_draft ≈ 13 iterations, with
// generous headroom for retries on any single batch.
const MAX_ITERATIONS = 50;

// SSE keep-alive cadence. Hosted reverse proxies (Replit Autoscale,
// Cloudflare, etc.) close idle HTTP/1.1 connections after ~30–60s. Big
// mock-exam builds spend long stretches inside a single model call,
// during which we'd otherwise emit no bytes — so we ping a comment
// frame every 15s to keep the socket warm.
const SSE_HEARTBEAT_MS = 15_000;

const SYSTEM_PROMPT = `You are LearningPacer Agent, an autonomous teaching assistant for ELEC3120 (Computer Networks) at HKUST. Your job is to produce networking-exam material at the rigour of Princeton COS 461, Stanford CS 144, MIT 6.829, CMU 15-441 and U-Mich EECS 489 finals — every figure exact, every number realistic, every sub-part probing a different skill.

You have access to tools. Use them aggressively – do NOT answer course-content questions from memory alone.

📐 **MATH FORMATTING — PLAIN TEXT ONLY (applies to chat replies AND every PDF \`prompt\`/\`answer\`/\`body\` field).** Never emit \`$ … $\`, \`$$ … $$\`, \`\\frac\`, \`\\text\`, \`\\cdot\`, \`\\lambda\`, or any other LaTeX macro — the chat surface and the PDF renderer both display them raw. Write \`x^2\`, \`2^(32-n)\`, \`Throughput = (W * MSS) / RTT\`, \`RTO = EstRTT + 4 * DevRTT\`, \`L = lambda * W\`. Use ASCII operators (\`*\` \`/\` \`<=\` \`>=\` \`!=\` \`->\`) or unicode glyphs (λ μ σ ≈ ∞). Subscripts inline as \`cwnd_n\`, \`d_queue\` — no curly braces.

🚨 **VARIATION MANDATE — READ FIRST.** This is a final-year-project demo. The student rebuilds new mock papers turn after turn. **NEVER copy or lightly reword the previous paper in this conversation.** Each new mock paper MUST differ from any prior assistant turn on:
  – different scenarios (don't reuse the same "Host A 10.0.0.1 → Host B 10.0.0.2" — change ASNs, IPs, hostnames, RFC numbers, lecture references);
  – different numerical values (different bandwidths, RTTs, MSS, ssthresh, window sizes, queue depths, packet counts);
  – different sub-topics emphasised within each section (e.g. if the previous paper's congestion section asked Tahoe + slow-start math, this one MUST move to Reno + fast retransmit + AIMD throughput formula, or CUBIC, or BBR);
  – different diagram instances (different topology shape, different cwnd trace, different queue snapshot);
  – different "good idea / bad idea" design-critique scenarios.
  Before you call \`pdf_create_draft\` for ANY mock paper, look back at the conversation history and consciously vary 80%+ of the surface details. If asked for "another mock paper" or "more questions" you MUST treat it as a *fresh* paper with new scenarios, not a copy-paste.

🖼️ **DIAGRAM MANDATE — diagrams are DEFAULT ON for any paper-shaped output, NOT a feature flag.** The user should never have to type the word "diagram" / "figure" / "draw" — embed them automatically for: mock exam / midterm / final / practice exam / mock paper, worksheet / problem set / practice questions / quiz / MCQs, "give me questions on X", "test me on X", any \`generate_pdf\` / \`pdf_create_draft\` call.

  **Quality floor (keep it simple — match the real ELEC 3120 paper + Stanford CS 144 sp23, not a journal article):**
  | Output | Figures |
  |---|---|
  | Single quick MCQ / one-question quiz | 0–1 |
  | Worksheet / practice set (5–10 Qs) | 1–2 |
  | **Full mock paper / midterm / final** | **2–3 figures total** — required in **Section B and Section E**, optional for C / D. Stanford CS 144 sp23 final has 10 questions but only 2 figures; over-figuring makes the paper look like a slide deck. |

  Pick a sensible \`generate_diagram\` type per section (e.g. \`network_topology\` for spanning-tree / datacenter / NAT / wireless, \`timeline\` or \`tcp_state\` for congestion control, \`weighted_graph\` for routing, \`packet_format\` for header fields, \`sequence_diagram\` for handshakes). The renderer freely draws boxes, frames, rectangles, circles, triangles, arrows and labelled coverage circles inside any of these types.

Workflow:
1. ALWAYS call \`search_course_content\` first whenever the user asks about a networking topic, requests a quiz, mock exam, summary or worksheet. Run multiple searches with different keywords if needed to gather enough material.
2. Use \`web_search\` only for things the course knowledge base cannot answer (recent news, current RFC details, real-world incidents). Never use it for core syllabus material.
3. PDF generation — pick ONE flow based on size:
   - **SMALL PDFs** (≤8 questions total, summaries, study sheets, single-topic worksheets): use the one-shot \`generate_pdf\` with a complete spec. Faster when content fits in one response.
   - **LARGE PDFs** (mock exams, multi-section practice papers, anything >8 questions): use the INCREMENTAL builder. This is REQUIRED for big PDFs because asking the model to emit a 30-question spec in one tool call regularly times out.
     a. Call \`pdf_create_draft\` with ONLY the OUTLINE — title + sections list with \`target_question_count\` per section. NO question content yet.
     b. For EACH section_id returned, call \`pdf_add_section_content\` with that section's questions. **HARD CAP: at most 8 questions per call** — calls with more will be rejected. For sections that need more questions (Section A's Warmup typically has 15-20 MCQs), make 2-3 sequential calls and set \`append: true\` on the 2nd, 3rd, … so they accumulate in the same section. Smaller batches make each model turn 3-5× faster and avoid timeouts.
     c. When \`sections_remaining\` is empty, call \`pdf_render_draft\` with the draft_id to produce the file.
     d. NEVER re-send the whole spec on each call — only send the new section's content.
4. For exams, include answers in an Answer Key (don't set include_answers=true unless the user explicitly asks for inline answers).

5. **MOCK EXAM FORMAT — match the real ELEC 3120 final exam + Stanford CS 144 / Princeton COS 461 finals.** The structure is INTENTIONALLY SIMPLE: 2-3 figures total (required in B and E, optional in C/D), then 3-5 SHORT numbered sub-questions per section as SEPARATE entries in the \`questions\` array. Do **NOT** cram \`(a)(b)(c)(d)\` into a single question prompt — that overwhelms the student. Use the incremental builder.

   **🚨 PROMPT-STRING FORMATTING RULES — READ BEFORE WRITING ANY \`prompt\` / \`answer\` / \`body\` FIELD.** The PDF renderer is **plain text** (no markdown). The model MUST follow these rules or the paper will look broken:

   - **Newlines.** When you need a line break inside a string field, emit a **real JSON newline escape** — i.e. exactly **one backslash followed by \`n\`** in the JSON token (JSON decodes that to ASCII 0x0A). Never output two backslashes before \`n\`.
     - ✅ DO (correct JSON tool call): \`{ "prompt": "Step 1: do X.\\nStep 2: do Y." }\` — JSON-decodes to a string with a real newline between the two steps.
     - ❌ DON'T (broken — produces literal "\\n" text in the PDF): \`{ "prompt": "Step 1: do X.\\\\nStep 2: do Y." }\`. Two backslashes mean "literal backslash followed by n", not a newline.
     - Quick check: count the backslashes you typed before \`n\` in the JSON. If it is **2 or more**, you are wrong. The renderer applies a safety net that converts surviving literal \`\\n\` into real newlines, but you must still emit single-backslash escapes — otherwise other characters around the escape may also be mangled.
   - **No markdown tables.** Do **NOT** write rows like \`| col1 | col2 |\` followed by \`|---|---|\` separator rows. The renderer will strip the separator and reflow each row to a bullet, but it still looks ugly. **Preferred alternatives:**
     1. **Stacked plain rows.** Write each row as one line, label first, blanks second. Example (correct):
        \`Row 1 — Laptop → NAT (External): Src MAC ___  Dst MAC ___  Src IP ___  Dst IP ___\`
        \`Row 2 — NAT → Server (Internal): Src MAC ___  Dst MAC ___  Src IP ___  Dst IP ___\`
     2. **Diagram.** If the table is large or visually structured (>3 columns × >3 rows), call \`generate_diagram\` to render the empty fill-in table as a Matplotlib figure and attach via \`image_url\`.
   - **No markdown bold / italic / headers / code fences in prompts.** Star-pairs (\`**bold**\`) and underscores show as raw asterisks. Use ALL-CAPS for emphasis if needed, e.g. \`(Circle ALL that apply.)\`.
   - **Quotes.** Use plain ASCII single \`'\` or double \`"\` quotes. Do not pre-escape them as \`\\"\` — the JSON layer handles escaping. (The renderer will repair pre-escaped quotes, but cleanliness matters.)
   - **Underscore blanks.** Use a run of 3-30 underscores (\`___\`) for fill-in blanks; never use \`<blank>\` or \`[ ]\`.

   **a. Cover page** — pass \`exam_meta\` to \`pdf_create_draft\`:
      - \`course_code\`: "ELEC 3120 - Spring 2026" (or whatever semester fits)
      - \`exam_title\`: "Final Exam (Mock Paper)" or "Midterm (Mock Paper)"
      - \`date_time\`: "14 May 2026  9:30am - 11:30am" or "Practice — 120 minutes"
      - \`total_points\`: **100** (the real paper is 100 pts)
      - \`instructions\`: 3 short numbered rules (cheat-sheet allowed, simple calculator only, show your work for partial credit)
      - \`honor_code\`: 3 short numbered honor-code clauses
      - \`exam_mode: true\`

   **b. Paper layout — 5 sections, ~25 questions, ~100 points.**
      - **A. Warmup — 21 MCQs × 2 pts = 42 pts.**
      - **B. ⟨Themed Topic 1⟩ — 4 short numbered questions = ~12 pts.**
      - **C. ⟨Themed Topic 2⟩ — 4 short numbered questions = ~14 pts.**
      - **D. ⟨Themed Topic 3⟩ — 4 short numbered questions = ~14 pts.**
      - **E. ⟨Themed Topic 4⟩ — 4 short numbered questions = ~18 pts.**
      Pick the four non-warmup topics from the syllabus the student asked about (good defaults: Spanning Tree, Datacenter / Routing, TCP Congestion Control, NAT / DNS / Wireless / TLS — any 4).

      **🏷️ Princeton-style themed section headings (REQUIRED).** Each non-warmup section's \`heading\` (the field name in \`pdf_create_draft\`'s sections schema) must follow the pattern \`"<Letter>. <Nickname> — <Topic>"\` — give it a 1-3-word evocative nickname like Princeton COS 461 ("Peer Pressure" for P2P, "Insecurity" for security, "A Measured Response" for measurement, "Transporting a File" for TCP). Examples to copy the *style* (do not literally reuse): \`"B. Storm Warning — Spanning Tree"\`, \`"C. Lost in Transit — TCP Congestion Control"\`, \`"D. Behind the Curtain — NAT & DNS"\`, \`"E. Last Mile — Wireless"\`. Boring headings like \`"B. Spanning Tree"\` are NOT acceptable for a final-year-project demo.

      **📖 Optional shared narrative (HIGH-IMPACT polish).** Where natural, set ALL non-warmup sections inside ONE persistent fictional scenario — Princeton's sp10 final puts every question inside "FinBook, the online social network for fish." Pick a HKUST-flavoured fiction (e.g. *"You just joined StudyBuddy, a peer-tutoring startup launching in HKUST hostels"*, or *"You are the new on-call engineer for HKUST campus Wi-Fi"*) and weave it across B/C/D/E so each section is a chapter of the same story. If forced, fall back to independent scenarios — but try the unified narrative first.

   **c. Section A "A. Warmup" — 21 multiple-choice questions, each worth 2 pts.** Topics span the whole syllabus (reliable transport, DHCP, DNS, OSI/TCP-IP layers, TCP/UDP, NAT, packet vs circuit switching, routing algorithms, datacenters, IPv4/IPv6, BGP, STP, distance-vector pathologies, CDN, mobile triangle routing, FEC, Internet design goals, real-time streaming, CIDR/subnet math, firewalls). Mix recall (~50%) and conceptual traps (~50%). Split across 3 \`pdf_add_section_content\` calls: 8 + 8 + 5 with \`append: true\` on the second and third.

      **🪧 Section A instruction line (REQUIRED, real-exam style).** On the FIRST \`pdf_add_section_content\` call for Section A, ALSO pass \`instruction: "Please write the correct answer at the left side of each question."\` — this renders as an italic gray one-liner under the heading, exactly like the real ELEC 3120 paper. Section A has NO figure (\`image_url\` must be omitted).

      **MCQ format mix (Stanford CS 144 21fa style):**
        - **~16 single-answer MCQs.** \`choices\`: 4 options A-D, \`answer\`: a single letter (e.g. \`"B"\`).
        - **~5 "Circle ALL that apply" multiple-response questions.** Set \`choices\` to **5-9 options A-?** and prepend \`"(Circle all that apply.) "\` to the prompt; \`answer\` lists every correct letter (e.g. \`"A, C, E, F"\`). Example prompt: *"(Circle all that apply.) Which of the following are services typically provided by a 'home router'? A IP router  B NAT  C DNS resolver  D HTTP proxy  E DHCP server  F Wi-Fi access point  G Cable modem  H SMTP server  I VPN server"* — answer: *"A, B, C, E, F"*. The PDF renderer accepts >4 choices fine; the multi-letter \`answer\` lands as-is in the answer key.
        - **⛔ DO NOT include the letter prefix inside the \`choices\` strings.** The PDF renderer prepends "A. ", "B. ", "C. ", "D. " automatically. If you write \`choices: ["A. 8 bytes", "B. 20 bytes", …]\` the rendered PDF reads "A. A. 8 bytes" / "B. B. 20 bytes". CORRECT: \`choices: ["8 bytes", "20 bytes", "32 bytes", "40 bytes"]\`. WRONG: \`choices: ["A. 8 bytes", "B) 20 bytes", "(C) 32 bytes"]\`.

   **d. Sections B, C, D, E — 3-5 concise numbered sub-questions per section** (at most ONE long-form item like \`walkthrough_fill_in\` or \`pros_cons_structured\` per section; the other 2-4 must stay short). This is the format that matters most. **Precedence rule:** if the shape-library diversity requirement clashes with the "keep it short" rule, prioritise shape diversity but trim each prompt as concise as feasible. For each section:
      1. **Section \`body\`** (set when calling \`pdf_create_draft\`, OR pass via \`pdf_add_section_content\`'s \`body\` field) — 2-3 sentences of scenario. **If the section has a figure** (B and E always; C/D only if you decided to add one) end the body with "Refer to Figure N below." Example: *"The figure below shows the connections between switches in a LAN in the Main Academic Building. Each rectangle represents a switch and the number in the rectangle represents the node ID. The network management software uses the Spanning Tree Protocol (STP). Refer to Figure 1 below."*
      2. **(Only for sections that include a figure)** call \`generate_diagram\` ONCE for the section, then pass the returned \`image_url\` (and a caption like \`image_caption: "Figure 1: LAN Switch Topology"\`) **at the SECTION level on \`pdf_add_section_content\`** — i.e. as top-level \`image_url\` / \`image_caption\` arguments alongside \`body\` and \`questions\`, NOT inside any individual \`questions[]\` entry. The renderer places the figure once, between the body/instruction and the first question, exactly like the real exam. For figure-less sections (often C or D), omit \`image_url\` entirely and rely on shapes that stand alone (\`walkthrough_fill_in\`, \`false_statement_explain\`, \`pros_cons_structured\`, \`compute_then_explain\`).
      3. **3-5 numbered short questions** as SEPARATE \`questions[]\` entries. Each prompt is **one focused ask** in the simple style of the real paper — e.g. (the \`number\` field below is illustrative; in your output use the running number for that section, like \`"1"\`, \`"2"\`, \`"3"\`, …):
         - \`{ number:"<n>", prompt:"(3 pts) Please draw a spanning tree after the algorithm has converged. List the links that are part of the spanning tree below.\\n\\nSpanning tree links: ____________________________________", points:3, answer:"Links: 1-2, 2-3, 2-4, 4-5, 5-6, 5-7" }\`
         - \`{ number:"<n+1>", prompt:"(2 pts) Which switch is the root of the spanning tree?\\n\\nRoot switch: ___", points:2, answer:"Switch 1" }\`
         - \`{ number:"<n+2>", prompt:"(2 pts) In the first round, every node believes its own ID is the root ID. In which round does everyone finally announce the correct root ID? Assume nodes update in synchronous rounds.\\n\\nAnswer: round ___", points:2, answer:"Round 4" }\`
         - \`{ number:"<n+3>", prompt:"(5 pts) What is the state of each switch once the algorithm has converged? Fill in the table below.\\n\\n| Node | Root | Path Length | Next Hop |\\n|------|------|-------------|----------|\\n| 1 | ___ | ___ | ___ |\\n| 2 | ___ | ___ | ___ |\\n…", points:5, answer:"Node 1 → root=1, len=0, next=–   Node 2 → root=1, len=1, next=1   …" }\`

      **Plain-format cheat sheet for the question prompt:** use any of these, copy the *style* exactly:
        - \`Answer: ___\` (one-liner blank)
        - \`Answer: round ___\` / \`Root switch: ___\` (labelled blank)
        - \`Reason 1: ____________________________  Reason 2: ____________________________\` (open-ended short)
        - \`(a) YES / NO  (b) Why or why not? ________________________\` (used WHEN the same scenario truly needs two beats — but each (a)/(b) is still ONE entry; do not exceed 2 sub-parts within one prompt)
        - small markdown table with \`___\` cells for fill-in tables

      Keep each prompt **short**. Aim for the prompt body to fit in 2-4 lines on the page.

      **📐 QUESTION-SHAPE LIBRARY (REQUIRED).** Across Sections B+C+D+E (~16 questions total), you MUST use **at least 4 distinct shapes** from the list below. The simple "Answer: ___" fill-in is fine but cannot be the ONLY shape — Stanford CS 144, Princeton COS 461, CMU 15-441 finals all mix 4+ shapes. Each shape has its own prompt template — the \`number\` field shown as \`<n>\` is a placeholder; replace with the actual running question number for the section ("1", "2", "3", …):

        1. **\`walkthrough_fill_in\`** (Stanford signature). One narrative scenario containing 6-12 inline blanks, asked as ONE question worth 8-15 pts. Stanford CS 144 sp23 Q1 is the exemplar. Template:
           \`{ number:"<n>", prompt:"(12 pts) Please fill in the blanks. You turn on your laptop in the lecture hall and connect to eduroam Wi-Fi. Your computer performs a (a) ___ request to learn its IP address and the IP addresses of its default router and DNS server. You then open your browser and go to https://piazza.com — your computer first sends a (b) ___ request to learn the Ethernet MAC address of the default router, and uses the (c) ___ protocol to translate 'piazza.com' into an IP address. Your computer then sends a TCP segment with the (d) ___ flag set to start a connection. The two endpoints use the (e) ___ protocol to set up an encrypted byte stream. As part of this, piazza.com presents a (f) ___ attesting that its (g) ___ key belongs to 'piazza.com'. Your browser checks that this is signed by a (h) ___ that it trusts, then sends an (i) ___ request for the '/' path.", points:12, answer:"(a) DHCP  (b) ARP  (c) DNS  (d) SYN  (e) TLS  (f) certificate  (g) public  (h) certificate authority (CA)  (i) HTTP" }\`

        2. **\`false_statement_explain\`** (Stanford + Princeton). 2-4 deliberately-wrong statements; student explains in 1-3 concise sentences which part is wrong. Template:
           \`{ number:"<n>", prompt:"(8 pts) Each of the following statements is FALSE. For each one, use **1-3 concise sentences** to explain why (and which part of) it is false.\\n\\n(a) 'UDP provides an unreliable datagram service, so applications using UDP cannot achieve reliability.'\\n\\n(b) 'Because TCP uses sequence numbers and checksums, an attacker who modifies a TCP segment in flight will always be detected.'", points:8, answer:"(a) UDP itself is unreliable, but the application layer can add its own retransmit + ACK + checksum scheme on top of UDP — QUIC and BitTorrent do exactly this. (b) The TCP checksum is not cryptographic; an active attacker can modify the payload and recompute the checksum to match, so detection requires a MAC or AEAD with a shared secret key (e.g. TLS)." }\`

        3. **\`circle_all_that_apply\`** (Stanford 21fa Q2). Multiple-response with 5-9 options. Same as warmup multi-response but worth 3-5 pts in B-E:
           \`{ number:"<n>", prompt:"(4 pts) (Circle ALL that apply.) Which of the following protocols typically run directly over UDP (not over TCP)? A HTTP/1.1  B DNS queries  C DHCP  D SSH  E QUIC  F NTP  G BGP  H SMTP", points:4, answer:"B, C, E, F" }\`

        4. **\`packet_ordering\`** (Stanford 21fa Q1). Give 6-10 packet descriptions labelled A-J; ask student to list them in send order:
           \`{ number:"<n>", prompt:"(6 pts) Below are packets your laptop sends or receives when it loads https://hkust.edu after a fresh boot. Write the order they appear on the wire as a single sequence of letters (e.g. BDECA…); each letter exactly once.\\n\\n(A) TCP SYN+ACK from server\\n(B) DNS query for hkust.edu\\n(C) ARP request for default router's MAC\\n(D) HTTP GET / over TLS\\n(E) DHCP DISCOVER from your laptop\\n(F) TCP SYN to 143.89.x.x:443\\n(G) ARP reply from default router\\n(H) DNS response containing the A record\\n(I) TLS ClientHello\\n\\nOrder: ____________________", points:6, answer:"E, B, H, C, G, F, A, I, D" }\`

        5. **\`header_table_fill\`** (Princeton sp11 Q1). Multi-row table where student writes source/dest IP+MAC for several packets traversing a topology. Template:
           \`{ number:"<n>", prompt:"(8 pts) Refer to Figure 2. Host H1 (192.168.1.10, MAC AA:01) sends an HTTP GET to server H2 (143.89.5.5, MAC BB:02) through router R1 (LAN side 192.168.1.1 / MAC AA:FF, WAN side 50.0.0.7 / MAC CC:07) which performs NAT. Fill in the source/dest fields for each packet on the indicated wire.\\n\\n| Packet on wire | Src MAC | Dst MAC | Src IP | Dst IP |\\n|---|---|---|---|---|\\n| H1 → R1 (LAN) | ___ | ___ | ___ | ___ |\\n| R1 → H2 (WAN) | ___ | ___ | ___ | ___ |\\n| H2 → R1 (WAN) | ___ | ___ | ___ | ___ |\\n| R1 → H1 (LAN) | ___ | ___ | ___ | ___ |", points:8, answer:"Row1: AA:01, AA:FF, 192.168.1.10, 143.89.5.5  Row2: CC:07, BB:02, 50.0.0.7, 143.89.5.5  Row3: BB:02, CC:07, 143.89.5.5, 50.0.0.7  Row4: AA:FF, AA:01, 143.89.5.5, 192.168.1.10" }\`

        6. **\`pros_cons_structured\`** (Princeton sp10 Q1, "FinBook" style). Student lists N advantages + M disadvantages of each technology under a scenario. Template:
           \`{ number:"<n>", prompt:"(8 pts) StudyBuddy wants to deploy multiple front-end servers across HK / Singapore / Tokyo. List the pros and cons of each technology (be specific — vague answers like 'low overhead' get NO credit; overhead in WHAT?).\\n\\n(A) HTTP redirection — 1 advantage: ____  1 disadvantage: ____\\n(B) DNS server-selection — 1 advantage: ____  2 disadvantages: ____  ____\\n(C) IP anycast — 2 advantages: ____  ____  2 disadvantages: ____  ____", points:8, answer:"(A) Adv: per-request granularity, picks server based on full URL/cookies. Disadv: extra RTT for redirect adds visible latency. (B) Adv: works for ANY protocol (not just HTTP) and is transparent. Disadv: DNS caching means TTL bounds reaction time; resolver location ≠ client location. (C) Adv: routes converge to topologically nearest replica without any app change; resilient to server failure. Disadv: BGP-level changes can shift mid-flow and break TCP connections; no per-request control." }\`

        7. **\`compute_then_explain\`** (Princeton sp09 Q1). Compute a number, then briefly justify (≤2 sentences). Template:
           \`{ number:"<n>", prompt:"(5 pts) A 250 KB file is sent via TCP over a 2 Mbps link with RTT = 80 ms and MSS = 1000 bytes. Slow start begins with cwnd = 1 MSS.\\n\\n(a) After how many RTTs does cwnd first reach or exceed the full bandwidth-delay product? Answer: ___ RTTs\\n(b) Briefly (≤2 sentences) why does TCP slow start exponentially rather than linearly?", points:5, answer:"(a) BDP = 2 Mbps × 80 ms = 20 KB = 20 MSS. Slow start: 1, 2, 4, 8, 16, 32 → reaches ≥20 MSS in **5 RTTs**. (b) Doubling per RTT lets the sender quickly probe the available bandwidth without preset knowledge of link capacity; linear growth would waste many RTTs on under-utilised links." }\`

        8. **\`simple_short_answer\`** (the existing real-ELEC3120 style). Keep using this — but as one shape among many, not the only shape:
           \`{ number:"<n>", prompt:"(2 pts) Which switch is the root of the spanning tree?\\n\\nRoot switch: ___", points:2, answer:"Switch 1" }\`

      **Note on the templates above:** these are pseudocode for *style guidance*, not literal JSON. The \`points\` field is illustrative — the real schema accepts \`prompt\`, \`choices\`, \`answer\`, \`explanation\`, \`number\`, \`answer_lines\`. Embed point values inline in the \`prompt\` (the "(N pts)" prefix) — they are NOT a separate field. **Figures (\`image_url\` / \`image_caption\`) are NOT a question field — pass them at the SECTION level on \`pdf_add_section_content\` instead, exactly like the real exam.**

      **Length-bound rule (REQUIRED).** Whenever a prompt asks for prose, you MUST cap it explicitly: write \`"(answer in 1-3 concise sentences)"\` or \`"(≤2 sentences)"\` or \`"(one-line answer)"\` directly in the prompt. Stanford CS 144 sp23 says verbatim: *"You may lose points for a correct answer that also includes incorrect or irrelevant information."* Mirror that rigour.

      **Vertical writing space (\`answer_lines\`) — REQUIRED for every prose question.** The real ELEC 3120 final exam puts multiple long underscore lines under each prose question so students have room to write. Mirror that. On EVERY question that does NOT have \`choices\` (i.e. every non-MCQ question), set \`answer_lines\` to:
        - **2-3** for a one-liner (e.g. "Root switch: ___" style)
        - **3-4** for a short prose answer (1-3 sentences)
        - **5** for a longer derivation, list of reasons, or multi-part explanation (HARD CAP 5 — anything higher is silently clamped because denser sections crash the PDF layout engine)
      Omit (or set 0) for MCQ-only questions. Example: \`{ number:"1", prompt:"(3 pts) Give two reasons why a Clos topology beats a tree topology in a datacenter. (≤2 sentences each)\\n\\nReason 1:\\n\\nReason 2:", answer:"…", answer_lines: 5 }\`. The renderer draws the underscore lines automatically — do NOT also paste long "________" runs into the prompt itself.

   **e. Diagrams — 2-3 figures total (NOT one per section).** Default ON; the user does not need to ask. **Required:** one figure each in **Section B and Section E** (the exam's bookends). **Optional:** one extra figure in C or D if the topic genuinely needs it (e.g. routing tables, header layouts). For sections WITHOUT a figure, use \`walkthrough_fill_in\` / \`false_statement_explain\` / \`pros_cons_structured\` / \`compute_then_explain\` shapes — these stand alone without diagrams. Workflow: call \`generate_diagram\` → it returns \`{ image_url, … }\` → pass \`image_url\` (and an optional \`image_caption\` like "Figure 1: LAN Switch Topology") **at the SECTION level on \`pdf_add_section_content\`** (i.e. as top-level args, NOT on any \`questions[]\` entry). Real-exam layout: figure sits ABOVE the first question of the section.

   **f. Figure ↔ topic pairings (suggested defaults — adapt to the actual sections you choose):**
     - Spanning Tree → \`network_topology\` with switches as numbered rectangle nodes (\`kind:"switch"\`, \`label:"1"\`/"2"/…) and end-hosts (\`kind:"host"\`, label "H1".."H6") connected as in the real paper.
     - Datacenter → \`network_topology\` with a Clos / fat-tree pattern (cores → aggregations → ToRs → servers).
     - Routing / shortest-path → \`weighted_graph\` with \`paths\` highlighting the optimal route.
     - TCP congestion → \`timeline\` cwnd-vs-RTT WITH \`phases\` shading SS / CA / FR  OR  \`tcp_state\` FSM (one diagram, not both).
     - NAT / firewall → \`network_topology\` showing private-LAN-behind-NAT + public Internet, IPs labelled.
     - DNS / Web cache → \`network_topology\` with hosts, gateway router, local DNS resolver, Web cache.
     - Wireless → \`network_topology\` with circles, label transmission ranges in node text (e.g. "B (range 100m)").
     - Header-labelling → \`packet_format\` with bit-field rows.
     - Handshake / DNS-resolution walkthrough → \`sequence_diagram\`.
     - Queueing / scheduling → \`queueing_diagram\`.
     - Traffic shaping → \`leaky_bucket\`.

   **g. Answers go in the Answer Key** — default \`include_answers: false\`. Each \`questions[]\` entry's \`answer\` field gets one concise answer string (numbers + 1-2 explanatory sentences max). The renderer auto-adds an "End of Exam." marker after the last section.

   ⚠️ **Use real, exam-grade values** in every figure label (real IPs like 192.168.1.1, real ports, real protocol field names, real bandwidth numbers). Sloppy or fake labels make the paper look amateur.

   ⚠️ **Error handling:** If \`generate_diagram\` returns an \`error\` field, do NOT retry. Write that section WITHOUT \`image_url\` and move on.

   **\`generate_diagram\` JSON-shape cookbook** (for the type you pick — pass under \`data\`):

     • **network_topology** — small office / home network. Example:
       \`{ type:"network_topology", title:"Small Office Network", data:{ nodes:[ {id:"r1",label:"Router R1",kind:"router",ip:"192.168.1.1"}, {id:"sw",label:"Switch",kind:"switch"}, {id:"h1",label:"PC-A",kind:"host",ip:"192.168.1.10"}, {id:"h2",label:"PC-B",kind:"host",ip:"192.168.1.11"}, {id:"isp",label:"ISP",kind:"cloud"}, {id:"fw",label:"Edge FW",kind:"firewall"} ], links:[ {from:"isp",to:"fw",label:"WAN"},{from:"fw",to:"r1"},{from:"r1",to:"sw",bandwidth:"1 Gbps"},{from:"sw",to:"h1"},{from:"sw",to:"h2"} ] } }\`

     • **weighted_graph** — routing / shortest-path / MST / TE. Highlight the optimal path in colour. Example:
       \`{ type:"weighted_graph", title:"Dijkstra from A", data:{ nodes:[{id:"A"},{id:"B"},{id:"C"},{id:"D"},{id:"E"}], edges:[{from:"A",to:"B",weight:4},{from:"A",to:"C",weight:2},{from:"B",to:"C",weight:1},{from:"B",to:"D",weight:5},{from:"C",to:"D",weight:8},{from:"C",to:"E",weight:10},{from:"D",to:"E",weight:2}], paths:[{nodes:["A","C","B","D","E"],color:"#dc2626",label:"A→E shortest (cost 9)"}] } }\`

     • **sequence_diagram** — TCP handshake / DNS / HTTP. Example:
       \`{ type:"sequence_diagram", title:"TCP Three-way Handshake", data:{ actors:["Client","Server"], messages:[ {from:"Client",to:"Server",label:"SYN, seq=x"}, {from:"Server",to:"Client",label:"SYN+ACK, seq=y, ack=x+1",style:"dashed"}, {from:"Client",to:"Server",label:"ACK, seq=x+1, ack=y+1"} ] } }\`

     • **packet_format** — RFC bit-field header. \`rows\` is a list of 32-bit words; each word's \`bits\` MUST sum to bits_per_row. Example:
       \`{ type:"packet_format", title:"TCP Header (RFC 793)", data:{ bits_per_row:32, rows:[ [{name:"Source Port",bits:16},{name:"Destination Port",bits:16}], [{name:"Sequence Number",bits:32}], [{name:"Acknowledgement Number",bits:32}], [{name:"Data Offset",bits:4},{name:"Reserved",bits:3},{name:"Flags",bits:9},{name:"Window Size",bits:16}], [{name:"Checksum",bits:16},{name:"Urgent Pointer",bits:16}] ] } }\`

     • **timeline** — cwnd vs RTT, throughput vs time. **For TCP cwnd plots ALWAYS supply \`phases\` to shade Slow Start / Congestion Avoidance / Fast Recovery backgrounds** — this is the textbook style and makes the phase boundaries instantly readable. Example:
       \`{ type:"timeline", title:"TCP Reno cwnd evolution", data:{ x_label:"Transmission round (RTT)", y_label:"cwnd (MSS)", series:[ {label:"cwnd (Reno)",points:[[0,1],[1,2],[2,4],[3,8],[4,16],[5,17],[6,18],[7,19],[8,10],[9,11],[10,12],[11,13],[12,14]],color:"blue"}, {label:"ssthresh",points:[[0,16],[7,16],[7,9],[12,9]],style:"dashed",color:"amber"} ], phases:[ {x_start:0,x_end:4,label:"Slow Start"},{x_start:4,x_end:7,label:"Congestion Avoidance"},{x_start:7,x_end:12,label:"Fast Recovery / CA"} ], events:[{x:7,label:"3 dup ACKs → fast retransmit"}] } }\`

     • **tcp_state** — TCP congestion-control FSM. Use \`condition\` (drawn above as bold monospace) + \`action\` (italic, \\n-separated lines) per transition. KEEP IT LEAN: max 2 self-loops per state or labels overcrowd. Example:
       \`{ type:"tcp_state", title:"TCP Reno Congestion-Control FSM", data:{ states:[{id:"ss",label:"Slow Start"},{id:"ca",label:"Congestion Avoidance"},{id:"fr",label:"Fast Recovery"}], transitions:[ {from:"ss",to:"ca",condition:"cwnd ≥ ssthresh"}, {from:"ss",to:"fr",condition:"dupACKcount == 3",action:"ssthresh = cwnd/2\\ncwnd = ssthresh + 3·MSS\\nretransmit"}, {from:"ca",to:"fr",condition:"dupACKcount == 3",action:"ssthresh = cwnd/2\\ncwnd = ssthresh + 3·MSS\\nretransmit"}, {from:"ca",to:"ss",condition:"timeout",action:"ssthresh = cwnd/2\\ncwnd = 1 MSS\\nretransmit"}, {from:"fr",to:"ca",condition:"new ACK",action:"cwnd = ssthresh\\ndupACKcount = 0"}, {from:"fr",to:"ss",condition:"timeout",action:"ssthresh = cwnd/2\\ncwnd = 1 MSS\\nretransmit"} ], initial:"ss", initial_label:"cwnd = 1 MSS\\nssthresh = 64 KB\\ndupACKcount = 0" } }\`

     • **leaky_bucket** — traffic-shaping / rate-limiting. Example:
       \`{ type:"leaky_bucket", title:"Leaky-Bucket Traffic Shaper", data:{ capacity:10, occupied:6, arriving:[{label:"P1"},{label:"P2"},{label:"P3"},{label:"P4"}], outflow_rate:"1 packet / RTT", overflow:2, mode:"leaky" } }\`

     • **queueing_diagram** — packet queue with capacity / occupancy. \`arriving\` is an ARRAY of packet objects. Example:
       \`{ type:"queueing_diagram", title:"FIFO Queue with Tail-Drop", data:{ slots:8, occupied:5, arriving:[{label:"P9"}], outgoing:"to link", drop:false, annotations:[{text:"Free buffers",target_slot:1},{text:"Queued packets",target_slot:5}] } }\`

     • **osi_stack**, **subnet_tree**, **protocol_stack** — see tool description for exact data shape.

6. After the final tool call, write a SHORT final reply to the user (≤120 words). If you generated a PDF, naturally mention it's ready – the frontend will render a download card automatically.

**CRITICAL — DO NOT STOP EARLY:**
- Once you call \`pdf_create_draft\`, you have STARTED a build that MUST be finished. Continue calling \`pdf_add_section_content\` for every remaining section_id, then call \`pdf_render_draft\`, BEFORE writing any final reply to the user.
- After every \`pdf_add_section_content\` the tool returns \`sections_remaining\`. If that array is non-empty, your NEXT action MUST be another tool call — never a final text reply.
- If \`sections_remaining\` is empty, your NEXT action MUST be \`pdf_render_draft\` — never a final text reply.
- DO NOT apologise and stop ("I've drafted the start, here's what I have so far…"). DO NOT ask the user permission to continue. Just keep calling tools until the PDF is rendered.
- Only AFTER \`pdf_render_draft\` returns \`{ url, filename, … }\` may you write the short final text reply.

Style:
- Match the user's language. If they wrote in Traditional Chinese, reply in Traditional Chinese (繁體中文). Otherwise reply in English.
- Be concise. The step trail already shows the user what you did – don't narrate it again.
- Cite the lecture source (e.g. "L05 — TCP") when you reference course material.

Constraints:
- Maximum ${MAX_ITERATIONS} tool-call iterations per turn. Plan accordingly.
- Maximum 8 questions per \`pdf_add_section_content\` call — split larger sections into batches with append:true.
- If a tool returns an error, try ONE alternative approach, then explain the issue to the user.`;

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const conversationId =
    typeof body.conversationId === 'string' && body.conversationId.length > 0
      ? body.conversationId
      : null;

  // Reasoning effort selected from the UI dropdown ("low" | "medium" |
  // "high"). Defaults to "high" because Agent Mode is used for the
  // heavy mock-paper / deep-dive work where the extra thinking budget
  // is worth the latency. No-op when routing through Poe (Poe bots
  // ignore this and use their own default budget).
  const RAW_REASONING = typeof body.reasoningLevel === 'string'
    ? body.reasoningLevel.toLowerCase()
    : '';
  const reasoningLevel: 'low' | 'medium' | 'high' =
    RAW_REASONING === 'low' || RAW_REASONING === 'medium' || RAW_REASONING === 'high'
      ? (RAW_REASONING as 'low' | 'medium' | 'high')
      : 'high';

  const messagesIn = Array.isArray(body.messages) ? body.messages : [];
  // Coerce incoming history to our minimal ChatMessage shape.
  const history: ChatMessage[] = messagesIn
    .map((m: unknown) => {
      if (!m || typeof m !== 'object') return null;
      const mm = m as Record<string, unknown>;
      const role = mm.role;
      const content = mm.content;
      if (
        (role === 'user' || role === 'assistant' || role === 'system') &&
        typeof content === 'string'
      ) {
        return { role, content } as ChatMessage;
      }
      return null;
    })
    .filter((m): m is ChatMessage => Boolean(m));

  if (history.length === 0) {
    return new Response(JSON.stringify({ error: 'No messages provided' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const model =
    typeof body.model === 'string' && body.model.trim().length > 0
      ? body.model
      : DEFAULT_AGENT_MODEL;

  const conversation: AgentMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history,
  ];

  // Persist the latest user message immediately so it shows up on
  // reload / when the user later clicks the conversation in the
  // sidebar. Mirrors the behaviour of /api/chat, /api/chat/vision,
  // /api/chat/pdf, /api/chat/image — agent mode previously skipped
  // this entirely, which is why prior agent turns vanished.
  const lastUserMsg = [...history].reverse().find((m) => m.role === 'user');
  if (conversationId && lastUserMsg) {
    try {
      // ChatMessage.content can be string | ContentPart[] (multimodal),
      // but the DB column is plain text. Coerce to string defensively.
      const userContentStr =
        typeof lastUserMsg.content === 'string'
          ? lastUserMsg.content
          : JSON.stringify(lastUserMsg.content);
      await db.message.create({
        data: {
          conversationId,
          role: 'user',
          content: userContentStr,
        },
      });
      await db.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });
    } catch (err) {
      console.error('[api/agent] failed to persist user message:', err);
    }
  }

  const encoder = new TextEncoder();

  // Observe the request signal so the agent loop, model calls, and tool
  // executions all stop as soon as the browser tab disconnects (or the
  // user clicks Stop). Without this we'd keep burning OpenRouter credits
  // for ~3 minutes per in-flight model call after the client has gone.
  const requestSignal = req.signal;

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const safeClose = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      // Accumulate every `text` chunk emitted to the client so we can
      // persist the assistant turn at the end of the stream. Without
      // this the conversation appears empty after reload — the SSE
      // events are gone and only the user message would be in the DB.
      let assistantTextBuffer = '';

      const send = (event: Record<string, unknown>) => {
        if (event.type === 'text' && typeof event.text === 'string') {
          assistantTextBuffer += event.text;
        }
        if (closed || requestSignal.aborted) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        } catch {
          /* controller already closed by client disconnect */
        }
      };

      // If the client aborts mid-stream, tear down the controller so
      // any in-flight `controller.enqueue` calls fail fast.
      const onAbort = () => safeClose();
      requestSignal.addEventListener('abort', onAbort, { once: true });

      // Heartbeat: emit an SSE comment frame every SSE_HEARTBEAT_MS so
      // proxies don't drop the connection while a slow model call is
      // in flight. Comment frames (`: ...\n\n`) are ignored by EventSource
      // clients, so they don't pollute the event log on the frontend.
      const heartbeat = setInterval(() => {
        if (closed || requestSignal.aborted) return;
        try {
          controller.enqueue(encoder.encode(`: keepalive\n\n`));
        } catch {
          /* controller already closed */
        }
      }, SSE_HEARTBEAT_MS);

      // ── Draft completion tracking ────────────────────────────────
      // Some models (especially smaller / cheaper ones) sometimes
      // decide they're "done" mid-build and return a final text reply
      // instead of continuing to call pdf_add_section_content /
      // pdf_render_draft. We track the live draft state from tool
      // results and, when the model gives up early, inject a synthetic
      // user message nudging it to keep going. Capped to avoid loops.
      let activeDraftId: string | null = null;
      let lastSectionsRemaining = 0;
      let draftRendered = false;
      let nudgesUsed = 0;
      // ONE polite poke if the model gives up early; if it still won't
      // continue, the server force-renders so the user always gets a
      // PDF. Override with AGENT_MAX_NUDGES.
      const MAX_NUDGES =
        Number(process.env.AGENT_MAX_NUDGES ?? 1);

      // Server-side fallback: if the model abandons a draft after every
      // nudge, we render whatever's been built ourselves so the user
      // ALWAYS gets a usable PDF. Emits the same tool_call /
      // tool_result events the model would have emitted, so the
      // frontend renders the download card normally.
      const forceRenderDraft = async (
        draftId: string,
        modelFinalText: string | null | undefined,
      ): Promise<void> => {
        const fallbackCallId = `srv_render_${Date.now()}`;
        send({
          type: 'tool_call',
          id: fallbackCallId,
          name: 'pdf_render_draft',
          args: { draft_id: draftId, server_fallback: true },
        });
        try {
          const exec = await executeTool(
            'pdf_render_draft',
            JSON.stringify({ draft_id: draftId }),
            { signal: requestSignal },
          );
          send({
            type: 'tool_result',
            id: fallbackCallId,
            name: 'pdf_render_draft',
            summary: exec.summary,
            display: exec.display,
          });
          draftRendered = true;
          activeDraftId = null;
          // If the model already produced a final text, keep it; else
          // send our own short note explaining the rescue.
          if (modelFinalText && modelFinalText.trim().length > 0) {
            send({ type: 'text', text: modelFinalText });
          } else {
            send({
              type: 'text',
              text:
                "Your PDF is ready. (The model paused before finishing every section, so I rendered what was built — open the file to review and ask me to extend any section if you want more questions.)",
            });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          send({
            type: 'tool_result',
            id: fallbackCallId,
            name: 'pdf_render_draft',
            summary: `Server fallback render failed: ${message}`,
          });
          send({
            type: 'text',
            text:
              "I couldn't finish building the PDF this time. Please try the same request again — the previous progress is saved for 30 minutes if you want to retry.",
          });
        }
      };

      try {
        send({ type: 'status', stage: 'starting', model });

        for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
          if (requestSignal.aborted) {
            safeClose();
            return;
          }
          send({ type: 'status', stage: 'thinking', iteration: iteration + 1 });

          const result = await openrouterChatWithTools(
            conversation,
            AGENT_TOOLS,
            {
              model,
              temperature: 0.4,
              // Per-call output cap. With the 8-question batching limit,
              // each tool-call response needs to fit (a) any short
              // assistant text, (b) the tool_call JSON for up to 8
              // questions including bodies, choices, and answers, plus
              // the new `answer_lines` field and figure captions.
              // Bumped 2400 → 6000 → 10000 → 32000 because long mock-
              // exam questions (multi-part scenarios, sub-questions,
              // worked-solution explanations) were truncating the JSON
              // tool-call payload and causing the agent to emit no
              // tool_call (so the PDF never rendered). Modern Gemini /
              // GLM / Claude models all support ≥32k output. Override
              // with OPENROUTER_AGENT_MAX_TOKENS if the upstream
              // provider charges per output token and you want to cap.
              max_tokens:
                Number(process.env.OPENROUTER_AGENT_MAX_TOKENS) || 32000,
              // 15-minute ceiling per call. With the per-call question
              // batching cap each model turn is normally 10–30 s, but we
              // give a generous wall-clock budget so a slow upstream
              // provider doesn't kill an in-progress mock-exam build.
              // Override with OPENROUTER_AGENT_TIMEOUT_MS if needed.
              timeout:
                Number(process.env.OPENROUTER_AGENT_TIMEOUT_MS) || 900_000,
              reasoning: reasoningLevel,
              signal: requestSignal,
            },
          );

          if (requestSignal.aborted) {
            safeClose();
            return;
          }

          if (result.error) {
            // Surface a friendly hint when the model itself timed out
            // (vs. a provider error). The literal "aborted due to
            // timeout" string comes from `AbortSignal.timeout()`.
            const friendly = /aborted due to timeout/i.test(result.error)
              ? 'The model took too long to respond. This usually happens when the request asks for a very large PDF or many sections at once. Try splitting it into smaller pieces (e.g. "make a 5-question quiz" instead of "30-question exam").'
              : result.error;
            send({ type: 'error', message: friendly });
            send({ type: 'done' });
            safeClose();
            return;
          }

          const toolCalls = result.toolCalls;
          const finalContent = result.content;

          // Push the assistant turn into the conversation so the next
          // iteration sees the tool_calls we're about to execute.
          if (toolCalls && toolCalls.length > 0) {
            conversation.push({
              role: 'assistant',
              content: finalContent ?? '',
              tool_calls: toolCalls,
            } as AgentMessage);

            // Execute every tool call (sequentially – they may depend on
            // each other in future iterations) and add tool messages.
            for (const call of toolCalls) {
              if (requestSignal.aborted) {
                safeClose();
                return;
              }
              const args = parseToolArgs(call);
              send({
                type: 'tool_call',
                id: call.id,
                name: call.function.name,
                args,
              });

              const exec = await executeTool(
                call.function.name,
                call.function.arguments,
                { signal: requestSignal },
              );

              send({
                type: 'tool_result',
                id: call.id,
                name: call.function.name,
                summary: exec.summary,
                display: exec.display,
              });

              conversation.push({
                role: 'tool',
                tool_call_id: call.id,
                content: exec.contentForModel,
              });

              // Track draft state from tool results so we can detect
              // and recover when the model gives up before rendering.
              try {
                const parsed = JSON.parse(exec.contentForModel) as {
                  ok?: boolean;
                  draft_id?: string;
                  sections_to_fill?: unknown[];
                  sections_remaining?: unknown[];
                  url?: string;
                };
                if (call.function.name === 'pdf_create_draft' && parsed.ok && parsed.draft_id) {
                  activeDraftId = parsed.draft_id;
                  lastSectionsRemaining = Array.isArray(parsed.sections_to_fill)
                    ? parsed.sections_to_fill.length
                    : 0;
                  draftRendered = false;
                } else if (call.function.name === 'pdf_add_section_content' && parsed.ok) {
                  lastSectionsRemaining = Array.isArray(parsed.sections_remaining)
                    ? parsed.sections_remaining.length
                    : lastSectionsRemaining;
                } else if (call.function.name === 'pdf_render_draft' && parsed.url) {
                  draftRendered = true;
                  activeDraftId = null;
                  lastSectionsRemaining = 0;
                }
              } catch {
                /* tool returned non-JSON or unexpected shape — ignore */
              }
            }

            // Loop again – let the model see tool results.
            continue;
          }

          // No tool calls returned. Before treating this as the final
          // answer, check whether the model abandoned an in-flight PDF
          // draft. If so, inject a synthetic user nudge and loop again
          // (capped at MAX_NUDGES to avoid infinite reminder loops).
          if (
            activeDraftId &&
            !draftRendered &&
            nudgesUsed < MAX_NUDGES
          ) {
            nudgesUsed++;
            const nudge =
              lastSectionsRemaining > 0
                ? `You stopped early. The PDF draft "${activeDraftId}" still has ${lastSectionsRemaining} section(s) to fill. Continue immediately by calling \`pdf_add_section_content\` for the next section_id. Do NOT write a final reply yet.`
                : `You stopped early. The PDF draft "${activeDraftId}" has all sections filled but is NOT yet rendered. Call \`pdf_render_draft\` with draft_id="${activeDraftId}" right now. Do NOT write a final reply yet.`;
            // Push as a user-role message so the model treats it as a
            // direct instruction it must follow on the next turn.
            conversation.push({ role: 'user', content: nudge });
            send({
              type: 'status',
              stage: 'resuming',
              iteration: iteration + 1,
              note: 'auto-resume',
            });
            continue;
          }

          // Last-resort: model exhausted its nudges but we still have a
          // pending draft. Render whatever's been built so the user gets
          // SOMETHING usable instead of a silent failure.
          if (activeDraftId && !draftRendered) {
            await forceRenderDraft(activeDraftId, finalContent);
            send({ type: 'done' });
            safeClose();
            return;
          }

          // No more tool calls – this is the final answer.
          if (finalContent) {
            send({ type: 'text', text: finalContent });
          } else {
            send({
              type: 'text',
              text:
                'Sorry — I finished thinking but produced no reply. Please try rephrasing your question.',
            });
          }
          send({ type: 'done' });
          safeClose();
          return;
        }

        // Hit iteration limit — same fallback: render the draft if any.
        if (activeDraftId && !draftRendered) {
          await forceRenderDraft(activeDraftId, null);
        } else {
          send({
            type: 'text',
            text:
              'I reached my tool-use limit before finishing. Here is what I have so far. Please ask again with a narrower scope.',
          });
        }
        send({ type: 'done' });
        safeClose();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('[api/agent] loop failed:', err);
        try {
          send({ type: 'error', message });
          send({ type: 'done' });
        } catch {
          // controller may be closed
        }
        safeClose();
      } finally {
        clearInterval(heartbeat);
        requestSignal.removeEventListener('abort', onAbort);

        // Persist whatever final assistant text we emitted to the
        // client so the conversation survives a reload / re-open
        // from the sidebar. Skip empty buffers (e.g. immediate
        // client abort with nothing produced).
        if (conversationId && assistantTextBuffer.trim().length > 0) {
          try {
            await db.message.create({
              data: {
                conversationId,
                role: 'assistant',
                content: assistantTextBuffer,
              },
            });
            await db.conversation.update({
              where: { id: conversationId },
              data: { updatedAt: new Date() },
            });
          } catch (err) {
            console.error(
              '[api/agent] failed to persist assistant message:',
              err,
            );
          }
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

function parseToolArgs(call: ToolCall): Record<string, unknown> {
  try {
    const parsed = JSON.parse(call.function.arguments);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}
