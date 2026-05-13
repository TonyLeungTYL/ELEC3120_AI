import { db } from '@/lib/db';
import { knowledgeTopics } from '@/lib/knowledge-base';
import { openrouterChat, type ChatMessage } from '@/lib/openrouter';

// ──────────────────────────────────────────────────────────────
// Citation types
// ──────────────────────────────────────────────────────────────
export interface Citation {
  docTitle: string;
  docId: string;
  pages: number[];
  snippet: string;
  relevanceScore: number;
  source: string; // e.g. "ELEC3120 Lecture 1-2" or document filename
}

const PAGE_MARKER_REGEX = /\[PAGE_MARKER:(\d+)\]/g;

const CITATION_DELIMITER_START = '\n<!-- LP_CITATIONS_JSON_START -->\n';
const CITATION_DELIMITER_END = '\n<!-- LP_CITATIONS_JSON_END -->\n';

// Regex to strip LP_SUGGESTIONS line from text before saving to DB
const SUGGESTIONS_REGEX = /\n?LP_SUGGESTIONS:\s*\[.*?\]\s*$/s;

import { TEACHER_PERSONA } from '@/lib/teacher-persona';

const SYSTEM_PROMPT = `You are LearningPacer, a virtual teaching assistant for HKUST's ELEC3120 Computer Networking course taught by Professor Meng Zili.

${TEACHER_PERSONA}


Your role:
- Answer questions about computer networking concepts clearly and accurately
- Reference specific lecture topics and slide ranges when relevant

FOCUSED-ANSWER RULE (VERY IMPORTANT):
- Answer ONLY the user's actual question. Do NOT add unrelated background topics, prefaces, or recap of adjacent concepts the user did not ask about.
- If the user asks "what is X", explain X directly. Do NOT first explain Y, Z, or any other concept just because they appeared in retrieved context.
- The retrieved knowledge-base chunks may contain content outside the asked topic — IGNORE chunks not relevant to the user's question. Use them only when they directly help answer what was asked.
- Prefer concise, targeted answers over long encyclopedic dumps. If the question is narrow, the answer should be narrow.
- Never produce a "TCP overview" (or any other tangential overview) before answering an unrelated question.
- Provide examples and analogies to help understanding
- Default reply language: **English**. Only switch to another language if the student writes their question in that language. When replying in Chinese, you MUST use Traditional Chinese characters only (Hong Kong / Taiwan usage, e.g. 網絡 not 網路, 軟件 not 軟體, 預設 not 默認). 絕對禁止輸出任何簡體字。If you catch yourself writing a Simplified character, rewrite the sentence in Traditional before outputting.
- For C++ FoggyNetwork project questions, provide practical debugging help
- Use markdown formatting for clarity (headers, bullet points, code blocks, bold text)

MANDATORY ANSWER STRUCTURE — Answer · Warrant · Evidence (AWE):
Every conceptual or "explain / why / how / compare" question MUST be structured with these three labelled sections, in this exact order, using these exact markdown headings:

### Answer
The direct, one-to-three-sentence response to the question. State the conclusion FIRST. No preamble.

### Warrant
The reasoning that connects the answer to the underlying networking principle — i.e. WHY the answer holds. Reference the mechanism, formula, or rule (e.g. "because TCP fast-retransmit is triggered by 3 duplicate ACKs, which signal …"). Keep it to 2–5 sentences or a short bulleted chain of logic.

### Evidence
Concrete proof: cite the lecture slide / page (using the [Source: ...] format below), quote a specific RFC line, walk through a numeric example, or show a small worked calculation. If the knowledge base supplies a fact, cite it here — do NOT cite inside Answer/Warrant.

When the question is purely procedural ("show me the code", "give me the exact bit layout") you may collapse Warrant into a one-liner, but the three headings must still appear.

MATH & EQUATIONS — PLAIN TEXT ONLY (NEVER LaTeX, NEVER \`$\` delimiters):
- **Absolutely forbidden**: \`$ … $\`, \`$$ … $$\`, \`\\(\`, \`\\[\`, \`\\frac\`, \`\\text\`, \`\\cdot\`, \`\\begin{aligned}\`, or any other LaTeX macro. The frontend will display them raw and the answer will look broken.
- Write powers with caret: \`x^2\`, \`2^(32-n)\`, \`O(n log n)\`.
- Write fractions with a slash: \`Throughput = (W * MSS) / RTT\`. For tall/multi-line fractions, write numerator and denominator on separate lines or use words ("divided by").
- Use ASCII operators: \`*\` for multiply, \`/\` for divide, \`<=\` \`>=\` \`!=\` for comparison, \`->\` for arrows.
- Subscripts inline: write \`cwnd_n\`, \`d_queue\`, \`RTT_min\` — no braces, no underscores-as-LaTeX.
- Greek letters and special symbols: spell them out (\`lambda\`, \`mu\`, \`sigma\`, \`approx\`, \`infinity\`) or use the unicode glyph directly (λ, μ, σ, ≈, ∞) — NEVER \`\\lambda\`.
- Multi-step derivations: one equation per line, aligned with spaces, e.g.
  \`\`\`
  cwnd_{n+1} = cwnd_n + 1
  ssthresh   = cwnd / 2
  \`\`\`
- Examples of acceptable formulas: \`RTO = EstRTT + 4 * DevRTT\`, \`L = lambda * W\` (Little's Law), \`d_nodal = d_proc + d_queue + d_trans + d_prop\`, \`Throughput ≈ (1.22 * MSS) / (RTT * sqrt(p))\`.
- Inline-code ticks (\`\` \`like this\` \`\`) are fine for variable names but NOT required for every formula — short formulas read fine in prose.

DIAGRAMS — Use Mermaid AGGRESSIVELY whenever a diagram clarifies the answer (and most networking concepts benefit from one):
- Sequence-style explanations (handshakes, RDT, ARQ, DNS lookups, HTTP request flow) → \`\`\`mermaid sequenceDiagram\`\`\`.
- State machines (TCP connection states, congestion-control phases, ARP cache lifecycle) → \`\`\`mermaid stateDiagram-v2\`\`\`.
- Topologies / layered models / packet paths → \`\`\`mermaid flowchart LR\`\`\` or \`flowchart TD\`.
- Timelines (cwnd vs RTT, AIMD sawtooth) → \`\`\`mermaid xychart-beta\`\`\` or ASCII chart in a \`\`\`text\`\`\` block.
- Aim for **at least one Mermaid diagram per non-trivial conceptual answer**. If the concept involves time, multiple parties, or state, a diagram is mandatory.
Place the diagram inside the **Evidence** section (or right before it if it visually motivates the warrant). Always wrap in a \`\`\`mermaid\` fenced block. Keep node labels short (≤ 20 chars). Avoid characters that break Mermaid parsing inside labels: raw \`(\`, \`)\`, \`:\` — use quoted \`["label here"]\` or hyphens instead.

CALLOUT BOXES — Use these GitHub-style blockquote tags to highlight study-critical information. The frontend renders each as a coloured box. **Use SPARINGLY: maximum 2 callouts per answer total**, and only when you have something concrete and course-specific to say. NEVER pad with generic advice. Skip them entirely for narrow procedural answers.

Available tags (place inside Evidence section, NOT Answer/Warrant):

- \`> [!CONTEXT]\` — One sentence locating the concept in ELEC3120 (which lecture / which part of the syllabus, e.g. "Appears in L08 Transport Layer alongside Selective Repeat vs Go-Back-N comparison").
- \`> [!TIP]\` — How to actually score the marks on this topic. Be specific: section it lands in, mark allocation, the exact phrasing markers reward (e.g. "If asked 'why is Selective Repeat more efficient', write: it buffers out-of-order packets and retransmits ONLY the lost packet — not the whole window").
- \`> [!TRAP]\` — The specific misconception Prof Meng repeatedly flags or the off-by-one students make (e.g. "Students confuse \`ssthresh\` reset on timeout vs 3-dup-ACK — timeout drops cwnd to 1 MSS, 3-dup-ACK halves it"). One trap per box.
- \`> [!HW]\` — Concrete tie-in to a homework problem or FoggyNetwork C++ project component (e.g. "HW2 Q3 drills this; in FoggyNetwork your \`reliable_send\` implementation must handle this case").
- \`> [!CHECK]\` — A single short self-test question the student should be able to answer if they understood (e.g. "If packet 6 arrives but packet 5 was lost, does Selective Repeat discard packet 6 or buffer it?"). End with a question mark. Do NOT supply the answer in the same callout.

Syntax — markdown blockquote with the tag as the first token, body on the same line or wrapped:
\`\`\`
> [!TIP] If the exam asks why Selective Repeat is more efficient, write: it buffers out-of-order packets and retransmits only the lost packet, instead of resending many correct packets.
\`\`\`

**Selection rules** (be ruthless, only the most useful 1–2):
- Conceptual question on a graded topic → usually 1× TIP and optionally 1× TRAP.
- Question about a HW problem or FoggyNetwork → 1× HW.
- Asking "what is X" on a foundational topic → 1× CONTEXT to anchor it, optionally 1× CHECK to make the student verify understanding.
- Pure procedural / "show me the bit layout" / "what's the syntax" → NO callouts.
- Non-testable trivia (history, vendor anecdotes) → NO callouts.

Course topics include: Network Fundamentals, Transport Layer (UDP/TCP), Reliable Transmission, TCP Connection Management, Flow & Congestion Control, Web & HTTP, Video Streaming.

CRITICAL CITATION RULES:
When you reference content from the knowledge base, you MUST cite the source inline using this exact format:
- Use [Source: document_name, p.X] at the end of a sentence or paragraph where you reference specific knowledge base content
- Example: "TCP uses a three-way handshake to establish connections [Source: L3_Transport_Layer.pdf, p.12]"
- If referencing multiple pages: [Source: document_name, p.5-8]
- Always use the document name exactly as provided in the knowledge base context headers
- Do NOT invent page numbers — only cite pages that appear in the context provided
- If you are not using specific knowledge base content, do not add citations

Always be helpful, accurate, and encouraging. If unsure, say so honestly.

CRITICAL FOLLOW-UP SUGGESTIONS:
After your main response, on a new line at the very end, you MUST provide 2-3 suggested follow-up questions that the student might want to ask next. These should be contextually relevant and deepen understanding.
Format exactly like this (must be the LAST line of your response):
LP_SUGGESTIONS: ["question1 in English", "question2 in English", "question3 in English"]
Rules:
- Exactly 2-3 short, specific questions (max 15 words each)
- Questions should explore related concepts, ask for examples, or go deeper into the topic
- Use English for the questions regardless of the user's language
- This line MUST be the very last line of your response — nothing after it`;

// Enhanced mock responses for fallback
const mockResponses: Record<string, string> = {
  tcp: `**TCP (Transmission Control Protocol)** is a connection-oriented transport layer protocol.

Key characteristics:
- **Connection-oriented**: Uses three-way handshake (SYN → SYN-ACK → ACK)
- **Reliable**: Guarantees data delivery with sequence numbers and acknowledgments
- **Full-duplex**: Both sides can send and receive simultaneously
- **Flow control**: Uses sliding window (rwnd) to prevent overwhelming the receiver
- **Congestion control**: Implements slow start, congestion avoidance, fast retransmit, and fast recovery

**TCP Header** (20 bytes minimum):
- Source Port (16 bits) | Destination Port (16 bits)
- Sequence Number (32 bits)
- Acknowledgment Number (32 bits)
- Data Offset (4 bits) | Reserved (3 bits) | Flags (9 bits) | Window Size (16 bits)
- Checksum (16 bits) | Urgent Pointer (16 bits)

TCP is used by applications like HTTP, FTP, SMTP, and SSH where reliable delivery is essential.`,

  udp: `**UDP (User Datagram Protocol)** is a connectionless transport layer protocol.

Key characteristics:
- **Connectionless**: No handshake before sending data
- **No reliability**: No guarantee of delivery, ordering, or duplicate protection
- **No congestion control**: Sends at whatever rate the application provides
- **Minimal overhead**: Only 8-byte header
- **Fast**: No connection setup overhead

**UDP Header** (8 bytes):
- Source Port (16 bits) | Destination Port (16 bits)
- Length (16 bits) | Checksum (16 bits)

UDP is preferred for DNS, DHCP, SNMP, and real-time applications like video conferencing.`,

  'three-way handshake': `**TCP Three-Way Handshake** establishes a connection between client and server.

**Step 1: Client → SYN**
- Client sends a SYN segment, seq = x

**Step 2: Server → SYN-ACK**
- Server responds with SYN-ACK, seq = y, ack = x + 1

**Step 3: Client → ACK**
- Client sends ACK, ack = y + 1

This ensures: 1) Both parties are ready, 2) Both know the other is ready, 3) Initial sequence numbers are synchronized.`,

  osi: `**OSI Reference Model** - 7-Layer Architecture

| Layer | Name | Examples |
|-------|------|---------|
| 7 | Application | HTTP, FTP, DNS, SMTP |
| 6 | Presentation | SSL/TLS, JPEG, ASCII |
| 5 | Session | NetBIOS, RPC |
| 4 | Transport | TCP, UDP |
| 3 | Network | IP, ICMP, OSPF |
| 2 | Data Link | Ethernet, Wi-Fi, PPP |
| 1 | Physical | Cables, hubs, fiber optics |

**TCP/IP Model** (practical 5-layer): Application, Transport, Network, Data Link, Physical`,

  congestion: `**TCP Congestion Control** prevents network overload.

**Key Variables:**
- **cwnd** (Congestion Window): Sender's estimate of network capacity
- **ssthresh** (Slow Start Threshold): Boundary between slow start and congestion avoidance

**Three Phases:**
1. **Slow Start**: cwnd starts at 1 MSS, doubles every RTT
2. **Congestion Avoidance**: cwnd increases by 1 MSS per RTT (linear)
3. **Fast Recovery (Reno)**: On 3 duplicate ACKs: ssthresh = cwnd/2, cwnd = ssthresh + 3

**On Timeout**: ssthresh = cwnd/2, restart slow start`,

  http: `**HTTP Protocol Evolution**

**HTTP/1.0**: Non-persistent connections (one object per TCP connection)
**HTTP/1.1**: Persistent connections by default, pipelining
**HTTP/2**: Binary framing, multiplexing, header compression (HPACK), server push
**HTTP/3**: Built on QUIC (UDP-based), eliminates TCP head-of-line blocking, 0-RTT setup`,

  delay: `**Network Delay Types**

Total nodal delay = d_proc + d_queue + d_trans + d_prop

1. **Processing Delay**: Examine header, check errors
2. **Queuing Delay**: Time in output queue (most variable)
3. **Transmission Delay**: L / R (packet length / link rate)
4. **Propagation Delay**: d / s (distance / propagation speed)`,

  default: `I'm your **LearningPacer** virtual teaching assistant for **ELEC3120 Computer Networks** at HKUST.

I can help you with:
- **Network Fundamentals**: OSI model, TCP/IP, packet switching, delays
- **Transport Layer**: UDP, TCP, multiplexing/demultiplexing
- **Reliable Transmission**: RDT protocols, ARQ, pipelining
- **TCP**: Connection management, flow control, congestion control
- **Web Protocols**: HTTP/1.0 through HTTP/3, caching, CDN
- **Video Streaming**: DASH, compression, quality adaptation

Try asking me about specific topics, or take a quiz to test your understanding.`,
};

function getMockResponse(userMessage: string): string {
  const msg = userMessage.toLowerCase();
  for (const topic of knowledgeTopics) {
    if (msg.includes(topic.title.toLowerCase()) || msg.includes(topic.titleZh)) {
      let response = `**${topic.title}** / ${topic.titleZh}\n\n${topic.description}\n\n**Key Points:**\n\n`;
      topic.keyPoints.forEach((kp, i) => {
        response += `${i + 1}. **${kp.point}** (${kp.pointZh})\n   ${kp.detail}\n\n`;
      });
      return response;
    }
  }
  if (msg.includes('tcp') || msg.includes('transmission control')) return mockResponses.tcp;
  if (msg.includes('udp') || msg.includes('user datagram')) return mockResponses.udp;
  if (msg.includes('handshake') || msg.includes('three-way')) return mockResponses['three-way handshake'];
  if (msg.includes('osi') || msg.includes('layer')) return mockResponses.osi;
  if (msg.includes('congestion') || msg.includes('cwnd')) return mockResponses.congestion;
  if (msg.includes('http') || msg.includes('web')) return mockResponses.http;
  if (msg.includes('delay') || msg.includes('latency')) return mockResponses.delay;
  return mockResponses.default;
}

// ──────────────────────────────────────────────────────────────
// Extract page numbers from a text chunk that contains PAGE_MARKER tags
// ──────────────────────────────────────────────────────────────
function extractPagesFromChunk(chunk: string): number[] {
  const pages = new Set<number>();
  PAGE_MARKER_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PAGE_MARKER_REGEX.exec(chunk)) !== null) {
    pages.add(parseInt(m[1], 10));
  }
  PAGE_MARKER_REGEX.lastIndex = 0;
  return [...pages].sort((a, b) => a - b);
}

// ──────────────────────────────────────────────────────────────
// Strip page markers from text for display/context
// ──────────────────────────────────────────────────────────────
function stripPageMarkers(text: string): string {
  return text.replace(PAGE_MARKER_REGEX, '').trim();
}

// ──────────────────────────────────────────────────────────────
// Search knowledge base with page-aware citations
// Searches BOTH uploaded documents AND built-in knowledge topics
// ──────────────────────────────────────────────────────────────
async function searchKnowledgeBase(query: string): Promise<{ context: string; citations: Citation[] }> {
  try {
    const allCitations: Citation[] = [];
    const contextParts: string[] = [];

    const queryLower = query.toLowerCase();
    // Split on whitespace for English tokens…
    const wordTokens = queryLower.split(/\s+/).filter((w) => w.length > 1);
    // …and also pull out CJK bigrams (sliding 2-char windows) so Chinese
    // questions without whitespace can still match the knowledge base.
    const cjkBigrams: string[] = [];
    const cjkOnly = queryLower.replace(/[^\u3400-\u9fff]+/g, ' ').trim();
    if (cjkOnly) {
      for (const run of cjkOnly.split(/\s+/)) {
        if (run.length === 1) cjkBigrams.push(run);
        for (let i = 0; i < run.length - 1; i++) {
          cjkBigrams.push(run.slice(i, i + 2));
        }
      }
    }
    const queryWords = [...new Set([...wordTokens, ...cjkBigrams])];

    // Pre-fetch uploaded documents so we can enrich built-in topic citations
    // with real page numbers from the matching lecture PDF.
    const documents = await db.knowledgeDocument.findMany({
      orderBy: { createdAt: 'desc' },
    });

    // Helper: given a built-in topic, find its matching uploaded lecture PDF
    // (by lecture number e.g. "L05") and return the page numbers where the
    // matching key-point text appears.
    const enrichBuiltInPages = (
      topic: typeof knowledgeTopics[number],
      matchingKps: typeof topic.keyPoints,
    ): { pages: number[]; docTitle?: string } => {
      const lectureMatches = [...topic.source.matchAll(/L(\d+)/gi)];
      if (lectureMatches.length === 0) return { pages: [] };

      const pages = new Set<number>();
      let matchedDocTitle: string | undefined;

      for (const lm of lectureMatches) {
        const num = parseInt(lm[1], 10);
        const padded = String(num).padStart(2, '0');
        const lectureRegex = new RegExp(
          `\\b(l0?${num}|lecture[\\s_-]*0?${num}|elec3120[\\s_-]*l?0?${num})\\b`,
          'i',
        );
        const doc = documents.find((d) =>
          lectureRegex.test(d.title) || d.title.toLowerCase().includes(`l${padded}`),
        );
        if (!doc) continue;
        matchedDocTitle = matchedDocTitle || doc.title;

        const content = doc.content;
        const contentLower = content.toLowerCase();
        const kpsToScan = matchingKps.length > 0 ? matchingKps : topic.keyPoints.slice(0, 3);
        for (const kp of kpsToScan.slice(0, 5)) {
          const terms = [kp.point, kp.pointZh].filter((t) => t && t.length >= 3);
          for (const term of terms) {
            const idx = contentLower.indexOf(term.toLowerCase());
            if (idx < 0) continue;
            const before = content.slice(0, idx);
            const allMarkers = [...before.matchAll(PAGE_MARKER_REGEX)];
            PAGE_MARKER_REGEX.lastIndex = 0;
            if (allMarkers.length > 0) {
              pages.add(parseInt(allMarkers[allMarkers.length - 1][1], 10));
            }
          }
        }
      }
      return { pages: [...pages].sort((a, b) => a - b), docTitle: matchedDocTitle };
    };

    // ── Search built-in knowledge topics ─────────────────────────────────
    for (const topic of knowledgeTopics) {
      let topicScore = 0;
      const topicTextLower = `${topic.title} ${topic.titleZh} ${topic.description} ${topic.descriptionZh}`.toLowerCase();

      for (const word of queryWords) {
        if (topicTextLower.includes(word)) topicScore += 3;
      }

      for (const kp of topic.keyPoints) {
        const kpText = `${kp.point} ${kp.pointZh} ${kp.detail} ${kp.detailZh}`.toLowerCase();
        for (const word of queryWords) {
          if (kpText.includes(word)) topicScore += 2;
        }
      }

      if (topicScore > 0) {
        // Build snippet from matching key points
        const matchingKps = topic.keyPoints.filter(kp => {
          const kpText = `${kp.point} ${kp.pointZh} ${kp.detail} ${kp.detailZh}`.toLowerCase();
          return queryWords.some(w => kpText.includes(w));
        });

        const snippet = matchingKps.length > 0
          ? matchingKps.slice(0, 3).map(kp => `${kp.point}: ${kp.detail}`).join(' | ')
          : `${topic.description} — ${topic.keyPoints.slice(0, 2).map(kp => kp.point).join(', ')}`;

        const enriched = enrichBuiltInPages(topic, matchingKps);
        allCitations.push({
          docTitle: `${topic.title} / ${topic.titleZh}`,
          docId: `topic-${topic.id}`,
          pages: enriched.pages,
          snippet: snippet.slice(0, 250),
          relevanceScore: topicScore,
          source: enriched.docTitle
            ? `${topic.source} · ${enriched.docTitle}`
            : topic.source,
        });

        // Add relevant content to context
        const relevantKps = matchingKps.length > 0 ? matchingKps : topic.keyPoints.slice(0, 3);
        const topicContent = `## ${topic.title} / ${topic.titleZh}\n${topic.description}\n${topic.descriptionZh}\n\n${relevantKps.map(kp => `- **${kp.point}** (${kp.pointZh}): ${kp.detail}`).join('\n')}`;
        contextParts.push(topicContent);
      }
    }

    // ── Search uploaded documents ───────────────────────────────────────
    if (documents.length > 0) {
      const scored = documents.map((doc) => {
        const contentLower = doc.content.toLowerCase();
        const titleLower = doc.title.toLowerCase();

        let score = 0;
        for (const word of queryWords) {
          if (titleLower.includes(word)) score += 10;
        }
        for (const word of queryWords) {
          const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(escaped, 'g');
          const occurrences = (contentLower.match(regex) || []).length;
          score += Math.min(occurrences, 5);
        }

        // Split content on PAGE_MARKER tags so each chunk = one page.
        // Falls back to paragraph split if the doc has no page markers.
        type Page = { num: number | null; text: string };
        const pageList: Page[] = [];
        const markerRegex = /\[PAGE_MARKER:(\d+)\]/g;
        const hasMarkers = /\[PAGE_MARKER:\d+\]/.test(doc.content);
        if (hasMarkers) {
          let lastIdx = 0;
          let lastNum: number | null = null;
          let m: RegExpExecArray | null;
          while ((m = markerRegex.exec(doc.content)) !== null) {
            if (lastNum !== null) {
              pageList.push({ num: lastNum, text: doc.content.slice(lastIdx, m.index) });
            }
            lastNum = parseInt(m[1], 10);
            lastIdx = m.index + m[0].length;
          }
          if (lastNum !== null) {
            pageList.push({ num: lastNum, text: doc.content.slice(lastIdx) });
          }
        } else {
          for (const c of doc.content.split(/\n\n+/)) {
            pageList.push({ num: null, text: c });
          }
        }

        // Score each page; keep top-scoring pages so we can list real refs.
        const scoredPages = pageList.map((p) => {
          const lower = p.text.toLowerCase();
          let s = 0;
          for (const word of queryWords) {
            if (!word) continue;
            const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const occ = (lower.match(new RegExp(escaped, 'g')) || []).length;
            s += occ * 2;
          }
          return { ...p, score: s };
        });

        const matchedPages = scoredPages
          .filter((p) => p.score > 0)
          .sort((a, b) => b.score - a.score);

        const bestChunk = matchedPages[0]?.text ?? doc.content.slice(0, 2000);
        const pages = [
          ...new Set(
            matchedPages
              .slice(0, 5)
              .map((p) => p.num)
              .filter((n): n is number => n !== null),
          ),
        ].sort((a, b) => a - b);
        const cleanChunk = stripPageMarkers(bestChunk.slice(0, 1500));

        return {
          docId: doc.id,
          title: doc.title,
          score,
          bestChunk: cleanChunk,
          pages,
        };
      });

      const results = scored
        .filter((d) => d.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

      for (const result of results) {
        const pageRef = result.pages.length > 0
          ? ` (Pages: ${result.pages.length === 1 ? result.pages[0] : `${result.pages[0]}-${result.pages[result.pages.length - 1]}`})`
          : '';
        contextParts.push(`--- From: ${result.title}${pageRef} ---\n${result.bestChunk}`);
        allCitations.push({
          docTitle: result.title,
          docId: result.docId,
          pages: result.pages,
          snippet: result.bestChunk.slice(0, 200),
          relevanceScore: result.score,
          source: result.title,
        });
      }
    }

    if (allCitations.length === 0) return { context: '', citations: [] };

    // Sort all citations by relevance and take top 5
    const topCitations = allCitations
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 5);

    const context = contextParts.join('\n\n').slice(0, 3500);

    return { context, citations: topCitations };
  } catch (error) {
    console.error('Knowledge base search error:', error);
    return { context: '', citations: [] };
  }
}

type AIResponseResult =
  | { text: string; citations: Citation[] }
  | { stream: ReadableStream; citations: Citation[] };

const CODE_SYSTEM_PROMPT = `You are LearningPacer Code, an expert programming assistant for a HKUST ELEC3120 Computer Networking student.

Your specialty: helping with C/C++ socket programming (FoggyNetwork project), Python network scripts, Wireshark filters, and any other code the student is debugging or writing.

Rules:
- Default reply language: **English**. Switch to another language only if the user explicitly writes in that language. When replying in Chinese, use Traditional Chinese only (HK/TW usage, 網絡 not 網路, 軟件 not 軟體, 預設 not 默認). 絕對禁止輸出簡體字。
- Always wrap code in fenced markdown code blocks with the correct language tag (\`\`\`cpp, \`\`\`python, \`\`\`bash, etc.).
- Be concise. Show the code first, then a SHORT explanation (≤ 4 bullet points). No long preamble.
- For debugging: identify the bug, show the fix, explain WHY in one sentence.
- For new code: provide a complete working snippet, then list 2-3 key things to know.
- Prefer modern idioms (C++17/20, Python 3.11+, ES2022).
- Never invent APIs — if unsure, say so honestly.
- **Math in prose: PLAIN TEXT ONLY.** Never use \`$ … $\`, \`$$ … $$\`, or LaTeX macros (\`\\frac\`, \`\\text\`, \`\\cdot\`, etc.). Write \`x^2\`, \`O(n log n)\`, \`Throughput = (W * MSS) / RTT\`, \`RTO = EstRTT + 4 * DevRTT\`. Use ASCII operators (\`*\` \`/\` \`<=\` \`->\`) or unicode glyphs (λ, μ, ≈, ∞). Code inside fenced blocks is unaffected — math notation outside code is what this rule covers.`;

const IMAGE_DESC_SYSTEM_PROMPT = `You are LearningPacer Vision, a creative visual-description assistant. The user will describe an image they want to imagine, and you respond with a vivid, detailed text description of that image (since you cannot generate raster images).

Rules:
- Default reply language: **English**. Switch to another language only if the user writes in that language. When replying in Chinese, use Traditional Chinese only (HK/TW usage). 絕對禁止輸出簡體字。
- Structure your reply as:
  1. **Composition overview** (1–2 sentences capturing the overall scene, mood, lighting) — translate the heading if responding in another language (e.g. "構圖總覽" in Chinese).
  2. **Subject / Details** (bullet list — colors, textures, positions, expressions, atmosphere)
  3. **Style suggestions** (art style, palette, references — e.g. "watercolor / cyberpunk / ukiyo-e / Studio Ghibli")
- For technical / educational diagrams (network topology, sequence diagrams, protocol stacks, etc.), include a clear ASCII or Mermaid diagram inside a fenced code block so the student can actually visualize it.
- Be sensory and evocative; think like a cinematographer or illustrator briefing.
- Length: 150–300 words. No long preamble, no apologies about not generating real images.`;

const IMAGE_TOPIC_HINT = '';

async function getAIResponse(
  messages: { role: string; content: string }[],
  streaming: boolean = false,
  mode: 'tutor' | 'code' | 'image' = 'tutor',
  webSearch: boolean = false,
  modelOverride?: string,
): Promise<AIResponseResult> {
  const lastMessage = messages[messages.length - 1]?.content || '';

  // Image mode: skip RAG, use vivid-description prompt + a vision-language model
  if (mode === 'image') {
    const chatMessages: ChatMessage[] = [
      { role: 'system', content: IMAGE_DESC_SYSTEM_PROMPT },
      ...messages.map((m) => ({ role: m.role as ChatMessage['role'], content: m.content })),
    ];

    try {
      // Poe path needs a Poe bot id; OpenRouter slugs (qwen/...) get
      // rejected with HTTP 400. Gemini-3.1-Pro on Poe is vision-capable
      // and cheap — perfect for the "describe this image" branch.
      const imageDescModel =
        process.env.POE_IMAGE_DESC_MODEL ||
        process.env.OPENROUTER_IMAGE_DESC_MODEL ||
        (process.env.POE_KEY || process.env.POE_API_KEY
          ? 'Gemini-3.1-Pro'
          : 'qwen/qwen3-vl-235b-a22b-instruct');
      if (streaming) {
        const result = await openrouterChat(chatMessages, { stream: true, model: imageDescModel });
        if (result.stream) return { stream: result.stream, citations: [] };
        if (!result.error && result.text) return { text: result.text, citations: [] };
        if (result.error) console.error('OpenRouter image-desc streaming error:', result.error);
      } else {
        const result = await openrouterChat(chatMessages, { model: imageDescModel });
        if (result.text) return { text: result.text, citations: [] };
        if (result.error) console.error('OpenRouter image-desc error:', result.error);
      }
    } catch (error) {
      console.error('OpenRouter image-desc error:', error);
    }
    return { text: 'Sorry, the image description assistant is unavailable right now. Please try again.', citations: [] };
  }

  // Code mode: skip RAG, use code-specific prompt + model
  if (mode === 'code') {
    const chatMessages: ChatMessage[] = [
      { role: 'system', content: CODE_SYSTEM_PROMPT },
      ...messages.map((m) => ({ role: m.role as ChatMessage['role'], content: m.content })),
    ];

    try {
      const codeModel =
        modelOverride ||
        process.env.POE_CODE_MODEL ||
        process.env.OPENROUTER_CODE_MODEL ||
        'Claude-Opus-4.7';
      if (streaming) {
        const result = await openrouterChat(chatMessages, { stream: true, model: codeModel, webSearch });
        if (result.stream) return { stream: result.stream, citations: [] };
        if (!result.error && result.text) return { text: result.text, citations: [] };
        if (result.error) console.error('OpenRouter code streaming error:', result.error);
      } else {
        const result = await openrouterChat(chatMessages, { model: codeModel, webSearch });
        // (codeModel already includes modelOverride above)
        if (result.text) return { text: result.text, citations: [] };
        if (result.error) console.error('OpenRouter code error:', result.error);
      }
    } catch (error) {
      console.error('OpenRouter code error:', error);
    }
    return { text: 'Sorry, the code assistant is unavailable right now. Please try again.', citations: [] };
  }

  const { context, citations } = await searchKnowledgeBase(lastMessage);

  let systemPrompt = SYSTEM_PROMPT;
  if (context) {
    systemPrompt += `\n\n--- KNOWLEDGE BASE CONTEXT ---\nThe following content is from the course knowledge base uploaded by the instructor. Use this information to answer the student's question when relevant.\n\nPage information is provided in the headers — cite specific pages when referencing this content.\n\n${context}\n--- END KNOWLEDGE BASE CONTEXT ---${IMAGE_TOPIC_HINT}`;
  }

  const chatMessages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({ role: m.role as ChatMessage['role'], content: m.content })),
  ];

  try {
    // Try streaming via OpenRouter
    if (streaming) {
      const result = await openrouterChat(chatMessages, { stream: true, webSearch, model: modelOverride });
      if (result.stream) {
        return { stream: result.stream, citations };
      }
      // If no stream returned but also no error, fall through to non-streaming
      if (!result.error && result.text) {
        return { text: result.text, citations };
      }
      // If there was an error, fall through to mock fallback
      if (result.error) {
        console.error('OpenRouter streaming error, falling back to mock:', result.error);
      }
    } else {
      // Non-streaming path
      const result = await openrouterChat(chatMessages, { webSearch, model: modelOverride });
      if (result.text) {
        return { text: result.text, citations };
      }
      if (result.error) {
        console.error('OpenRouter error, falling back to mock:', result.error);
      }
    }
  } catch (error) {
    console.error('OpenRouter error, falling back to mock:', error);
  }

  // Mock fallback
  let fallbackText = getMockResponse(lastMessage);
  if (citations.length > 0) {
    fallbackText += `\n\n---\n📚 **Related Knowledge Base Documents:**\n`;
    for (const c of citations) {
      const pageStr = c.pages.length > 0
        ? `, p.${c.pages.length === 1 ? c.pages[0] : `${c.pages[0]}-${c.pages[c.pages.length - 1]}`}`
        : '';
      fallbackText += `- ${c.docTitle}${pageStr}\n`;
    }
  }
  return { text: fallbackText, citations };
}

// ──────────────────────────────────────────────────────────────
// Build the citation JSON payload to append after stream
// ──────────────────────────────────────────────────────────────
function buildCitationPayload(citations: Citation[]): string {
  if (citations.length === 0) return '';
  return CITATION_DELIMITER_START + JSON.stringify(citations) + CITATION_DELIMITER_END;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { messages, conversationId, mode, webSearch, model } = body as {
      messages?: Array<{ role: string; content: string; hasImage?: boolean; hasPdf?: boolean; imageData?: string }>;
      conversationId?: string;
      mode?: 'tutor' | 'code' | 'image';
      webSearch?: boolean;
      model?: string;
    };
    // Whitelist of model ids the UI dropdown is allowed to request. Keeps
    // arbitrary OpenRouter strings from being injected via the API.
    // Poe bot names (case-sensitive). Keep in sync with MODEL_OPTIONS
    // in src/components/chat-input.tsx and ALLOWED_MODEL_IDS in
    // src/app/chat/page.tsx.
    const ALLOWED_MODELS = new Set([
      'Claude-Opus-4.7',
      'Claude-Sonnet-4.5',
      'Gemini-3.1-Pro',
      'GPT-5',
      'Grok-4',
      'DeepSeek-V4',
    ]);
    const modelOverride = model && ALLOWED_MODELS.has(model) ? model : undefined;
    const chatMode: 'tutor' | 'code' | 'image' =
      mode === 'code' ? 'code' : mode === 'image' ? 'image' : 'tutor';
    // `:online` is irrelevant for image-description mode (handled by a vision
    // model that doesn't go through chat-style web search).
    const useWebSearch = !!webSearch && chatMode !== 'image';

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: 'Messages array is required' }, { status: 400 });
    }

    const lastMessage = messages[messages.length - 1];

    // Store user message
    if (conversationId && lastMessage.role === 'user') {
      await db.message.create({
        data: {
          conversationId,
          role: 'user',
          content: lastMessage.content,
          hasImage: lastMessage.hasImage || false,
          hasPdf: lastMessage.hasPdf || false,
          imageData: lastMessage.imageData || undefined,
        },
      });

      await db.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });
    }

    // Get AI response with knowledge base context (streaming mode)
    const result = await getAIResponse(messages, true, chatMode, useWebSearch, modelOverride);

    // Prepare citation payload
    const citationPayload = buildCitationPayload(result.citations);

    // ── If we got a real stream from OpenRouter ──────────────────────────────
    if ('stream' in result && result.stream) {
      const encoder = new TextEncoder();

      const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
      const writer = writable.getWriter();

      // Keep-alive heartbeat: emit a zero-width space (U+200B, invisible
      // in markdown) every 15s while the model is "thinking". Without
      // this, slow first-token replies (Claude Opus, long contexts) can
      // be killed by intermediate proxy idle-timeouts — especially when
      // the user switches browser tabs, which is exactly the symptom
      // reported as "AI stops working when I switch screens".
      const HEARTBEAT_BYTES = encoder.encode('\u200B');
      const heartbeat = setInterval(() => {
        writer.write(HEARTBEAT_BYTES).catch(() => {
          /* writer closed — interval will be cleared in finally */
        });
      }, 15_000);

      (async () => {
        const collectedChunks: string[] = [];
        try {
          const reader = (result.stream as ReadableStream<Uint8Array>).getReader();
          const decoder = new TextDecoder();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            collectedChunks.push(decoder.decode(value, { stream: true }));
            await writer.write(value);
          }

          // Append citation JSON payload after the AI stream ends
          if (citationPayload) {
            collectedChunks.push(citationPayload);
            await writer.write(encoder.encode(citationPayload));
          }
        } catch (err) {
          console.error('Error reading OpenRouter stream:', err);
        } finally {
          clearInterval(heartbeat);
          try {
            await writer.close();
          } catch {
            // Writer may already be closed if the client disconnected
            // mid-stream — swallow the redundant close error.
          }
        }

        // Save assistant message to DB (without citation JSON — store clean text)
        if (conversationId) {
          const fullText = collectedChunks.join('');
          if (fullText) {
            // Strip citation payload and suggestions before saving to DB
            const cleanText = fullText
              .replace(new RegExp(CITATION_DELIMITER_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' + CITATION_DELIMITER_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), ''), '')
              .replace(SUGGESTIONS_REGEX, '')
              .trim();
            // Save citations as JSON in the citations field
            const citationsJson = result.citations.length > 0
              ? JSON.stringify(result.citations)
              : undefined;
            await db.message.create({
              data: { conversationId, role: 'assistant', content: cleanText, citations: citationsJson },
            });
          }
        }
      })();

      return new Response(readable, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Transfer-Encoding': 'chunked' },
      });
    }

    // ── Non-streaming / mock fallback ────────────────────────────────────────
    const responseText = 'text' in result ? result.text : '';
    let finalResponse = responseText;

    // Append citation JSON payload
    if (citationPayload) {
      finalResponse += citationPayload;
    }

    // Store assistant message (without citation JSON)
    if (conversationId) {
      const cleanText = finalResponse
        .replace(new RegExp(CITATION_DELIMITER_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' + CITATION_DELIMITER_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), ''), '')
        .replace(SUGGESTIONS_REGEX, '')
        .trim();
      if (cleanText) {
        // Save citations as JSON in the citations field
        const citationsJson = result.citations.length > 0
          ? JSON.stringify(result.citations)
          : undefined;
        await db.message.create({
          data: { conversationId, role: 'assistant', content: cleanText, citations: citationsJson },
        });
      }
    }

    // Simulate streaming for non-streaming responses (mock fallback)
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const chars = finalResponse.split('');
        let buffer = '';
        const batchSize = 3;
        for (let i = 0; i < chars.length; i++) {
          buffer += chars[i];
          if (buffer.length >= batchSize || i === chars.length - 1) {
            controller.enqueue(encoder.encode(buffer));
            buffer = '';
            const char = chars[i];
            if ('.!?。！？\n'.includes(char)) {
              await new Promise((resolve) => setTimeout(resolve, 30));
            } else if (',，;；:：'.includes(char)) {
              await new Promise((resolve) => setTimeout(resolve, 15));
            } else {
              await new Promise((resolve) => setTimeout(resolve, 8));
            }
          }
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Transfer-Encoding': 'chunked' },
    });
  } catch (error) {
    console.error('Error in chat API:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
