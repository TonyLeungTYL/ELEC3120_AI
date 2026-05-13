/**
 * Tool registry for Agent Mode.
 *
 * Defines the OpenAI/OpenRouter-compatible tool schemas that we expose to
 * the agent model, and provides a single `executeTool()` dispatcher that
 * the agent loop calls when the model produces a `tool_calls` array.
 *
 * Tool implementations are intentionally pure async functions: the agent
 * loop streams `tool_call` / `tool_result` SSE events around them so the
 * frontend can render a live "step trail" without needing to know about
 * the tools themselves.
 */

import 'server-only';

import { db } from '@/lib/db';
import { knowledgeTopics } from '@/lib/knowledge-base';
import {
  renderPdfFromSpec,
  type PdfQuestion,
  type PdfSpec,
} from '@/lib/agent/pdf-generator';
import { getAgentPdfDir } from '@/lib/agent/pdf-storage';
import {
  addSectionContent,
  createDraft,
  deleteDraft,
  draftToSpec,
  getDraft,
} from '@/lib/agent/pdf-drafts';
import { openrouterChat } from '@/lib/openrouter';
import { readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// ─── Tool schemas (OpenAI-compatible) ───────────────────────────────────────

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export const AGENT_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'search_course_content',
      description:
        "Search the ELEC3120 (HKUST Computer Networks) knowledge base for lecture content matching a query. Returns relevant key points with citations to specific lectures (e.g. 'L05 — TCP'). Use this BEFORE answering any course-content question, before generating quiz/exam PDFs, and any time you need authoritative material from the syllabus. Prefer concise English keyword queries (e.g. 'TCP congestion control', 'DASH video streaming') even when the user wrote in Chinese.",
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              "Keyword query, e.g. 'TCP slow start', 'HTTP caching', 'CDN selection'.",
          },
          max_results: {
            type: 'integer',
            description: 'How many key points to return. Default 6, max 12.',
            minimum: 1,
            maximum: 5,
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description:
        "Search the live public web for up-to-date information that is NOT in the course knowledge base — e.g. current RFC details, recent protocol news, real-world incidents, or definitions you are unsure about. Returns a short summary plus source URLs. Do NOT use this for core course content (use search_course_content instead).",
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Web-search query in English.',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_pdf',
      description:
        "Render a structured PDF document (worksheets, mock exams, study sheets, summaries) and return a download URL. Use this whenever the user asks for a PDF, worksheet, mock exam, or printable study guide. Always call search_course_content FIRST to ground the content in real lecture material before assembling the spec.",
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description:
              "Document title shown at the top of page 1, e.g. 'ELEC3120 Mock Exam — TCP & HTTP'.",
          },
          subtitle: {
            type: 'string',
            description:
              "Optional subtitle, e.g. 'Practice paper · 30 minutes · 25 questions'.",
          },
          sections: {
            type: 'array',
            description:
              "Ordered list of sections. Each section can be either a prose section (use `body`) or a quiz/exam section (use `questions`).",
            items: {
              type: 'object',
              properties: {
                heading: {
                  type: 'string',
                  description:
                    "Section heading, e.g. 'Section A — Multiple Choice (10 marks)'.",
                },
                body: {
                  type: 'string',
                  description:
                    'Optional plain-text paragraph(s). Use newlines to separate paragraphs.',
                },
                questions: {
                  type: 'array',
                  description: 'Optional list of questions.',
                  items: {
                    type: 'object',
                    properties: {
                      number: {
                        type: 'string',
                        description:
                          "Optional question label, e.g. '1', 'Q3', '1a'. Auto-numbered if omitted.",
                      },
                      prompt: {
                        type: 'string',
                        description: 'The question prompt.',
                      },
                      choices: {
                        type: 'array',
                        items: { type: 'string' },
                        description:
                          'Optional multiple-choice options. Rendered A./B./C./… in order.',
                      },
                      answer: {
                        type: 'string',
                        description:
                          "The correct answer. Shown inline if `include_answers` is true, otherwise listed in an Answer Key at the end.",
                      },
                      explanation: {
                        type: 'string',
                        description:
                          'Optional worked solution / explanation.',
                      },
                      answer_lines: {
                        type: 'integer',
                        minimum: 0,
                        maximum: 5,
                        description:
                          "Optional number of blank underscore lines to render BELOW this question for the student to write on. Mirrors the real ELEC 3120 final-exam layout where every prose question has multiple long '_____' lines. Use 2-3 for a one-liner, 3-4 for a short prose answer, 5 for a longer one (HARD CAP 5 — denser sections crash the layout engine). Omit (or set 0) for MCQ-only questions.",
                      },
                    },
                    required: ['prompt'],
                  },
                },
              },
              required: ['heading'],
            },
          },
          include_answers: {
            type: 'boolean',
            description:
              'When true, answers are printed under each question. When false (default), answers appear in an Answer Key section at the end of the document.',
          },
          footer: {
            type: 'string',
            description: 'Optional footer text shown on every page.',
          },
          exam_mode: {
            type: 'boolean',
            description:
              'When true, format the document as a formal exam paper: "Page X of N · Please go on to the next page…" footer on every page, "End of Exam." marker on the last page. Set this to true for any mock exam, midterm or final paper.',
          },
          exam_meta: {
            type: 'object',
            description:
              'Cover-page metadata for formal exam papers. When provided, a dedicated cover page (course header, exam title, instructions, honor code, name/ID fields, integrity pledge) is rendered before the body sections. Required for full-length mock exams. Implies exam_mode=true.',
            properties: {
              course_code: {
                type: 'string',
                description: "e.g. 'ELEC 3120 - Spring 2026'.",
              },
              exam_title: {
                type: 'string',
                description: "e.g. 'Final Exam (Mock Paper)' or 'Midterm Practice'.",
              },
              date_time: {
                type: 'string',
                description: "Optional date/duration line, e.g. 'Practice — 120 minutes'.",
              },
              total_points: {
                type: 'integer',
                description: 'Total points across all sections (typically ~100 for a final).',
              },
              instructions: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'Numbered exam-taking instructions (cheat sheet rules, calculator policy, answer style, etc.).',
              },
              honor_code: {
                type: 'array',
                items: { type: 'string' },
                description: 'Numbered academic honor code clauses.',
              },
              good_luck: {
                type: 'string',
                description: "Closing line on the cover, defaults to 'Good luck!'.",
              },
            },
            required: ['course_code', 'exam_title'],
          },
        },
        required: ['title', 'sections'],
      },
    },
  },
  // ─── Incremental PDF builder ──────────────────────────────────────
  // For LARGE PDFs (mock exams, multi-section worksheets >8 questions
  // total) the model should use these three tools instead of the
  // single-shot `generate_pdf`. Each fill call is small and fast,
  // gives the user live per-section progress in the step trail, and
  // avoids the multi-minute timeouts that the one-shot flow can hit.
  {
    type: 'function',
    function: {
      name: 'pdf_create_draft',
      description:
        "Start an INCREMENTAL PDF draft. Use for LARGE PDFs — mock exams, multi-section practice papers, anything with more than ~8 questions overall. Provide ONLY the OUTLINE here (title + section list with target_question_count). Do NOT include the actual question content yet. The tool returns a draft_id and the list of section_ids to fill via `pdf_add_section_content`. After all sections are filled, call `pdf_render_draft` to produce the file. For SMALL PDFs (≤8 questions, summaries, study sheets) prefer the one-shot `generate_pdf` instead — it's faster when content fits in a single response.",
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: "Document title, e.g. 'ELEC3120 Mock Exam — TCP & HTTP'.",
          },
          subtitle: {
            type: 'string',
            description: "Optional subtitle, e.g. 'Practice paper · 30 questions · 90 minutes'.",
          },
          footer: {
            type: 'string',
            description: 'Optional footer text shown on every page.',
          },
          include_answers: {
            type: 'boolean',
            description:
              'When true, answers are printed under each question. When false (default), answers appear in a single Answer Key at the end.',
          },
          sections: {
            type: 'array',
            description:
              'Outline of sections — heading + kind + target counts. NO actual question content here.',
            items: {
              type: 'object',
              properties: {
                heading: {
                  type: 'string',
                  description: "Section heading, e.g. 'A. Warmup' or 'B. Spanning Tree'.",
                },
                kind: {
                  type: 'string',
                  enum: ['questions', 'text', 'mixed'],
                  description:
                    "'questions' = quiz/exam section, 'text' = prose only, 'mixed' = intro paragraph + questions. Default 'questions'.",
                },
                body: {
                  type: 'string',
                  description:
                    'Optional intro paragraph(s) you can supply NOW (saves a fill round-trip). Use for short framing text only.',
                },
                target_question_count: {
                  type: 'integer',
                  minimum: 1,
                  maximum: 60,
                  description:
                    'Hint for how many questions you plan to put in this section. Aim for 6-8 per section (hard cap is 8 per call) to keep each fill call fast.',
                },
              },
              required: ['heading'],
            },
          },
          exam_mode: {
            type: 'boolean',
            description:
              'When true, format as a formal exam paper: "Page X of N · Please go on to the next page…" footer, "End of Exam." marker on the last page. Set to true for any mock exam.',
          },
          exam_meta: {
            type: 'object',
            description:
              'Cover-page metadata for formal exam papers. When provided, a dedicated cover page is rendered before the body sections. REQUIRED for full-length mock exams. Implies exam_mode=true.',
            properties: {
              course_code: { type: 'string', description: "e.g. 'ELEC 3120 - Spring 2026'." },
              exam_title: { type: 'string', description: "e.g. 'Final Exam (Mock Paper)'." },
              date_time: { type: 'string', description: "e.g. 'Practice — 120 minutes'." },
              total_points: { type: 'integer', description: 'Total points (typically ~100).' },
              instructions: {
                type: 'array',
                items: { type: 'string' },
                description: 'Numbered exam-taking instructions.',
              },
              honor_code: {
                type: 'array',
                items: { type: 'string' },
                description: 'Numbered academic honor code clauses.',
              },
              good_luck: { type: 'string', description: "Defaults to 'Good luck!'." },
            },
            required: ['course_code', 'exam_title'],
          },
        },
        required: ['title', 'sections'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pdf_add_section_content',
      description:
        'Fill ONE section of a PDF draft created by `pdf_create_draft`. Generate ONLY the questions / body for the given section_id — do NOT re-send the whole spec. Aim for 6-8 questions per call (HARD CAP 8) (keep each call small and fast). Returns which sections still need filling. Call once per section, then call `pdf_render_draft` when sections_remaining is empty.',
      parameters: {
        type: 'object',
        properties: {
          draft_id: {
            type: 'string',
            description: 'The draft_id returned by pdf_create_draft.',
          },
          section_id: {
            type: 'string',
            description: 'The section_id you are filling. Must come from the draft outline.',
          },
          body: {
            type: 'string',
            description: 'Optional prose body for this section.',
          },
          instruction: {
            type: 'string',
            description:
              "Optional one-line italic instruction shown UNDER the section heading, real-exam style. E.g. 'Please write the correct answer at the left side of each question.' (Section A — MCQ) or 'Answer ALL questions in the space provided.' (Section B+). Keep it short.",
          },
          image_url: {
            type: 'string',
            description:
              'Optional SECTION-LEVEL figure (real-exam layout: figures sit ABOVE the first question of the section, not inside any individual question). Pass the `image_url` (or `img:UUID` handle) returned by `generate_diagram` here. The renderer embeds the figure once between the body/instruction and the first question.',
          },
          image_caption: {
            type: 'string',
            description:
              'Optional caption for the section-level figure, e.g. "Figure 1: Network topology for Section B." Rendered italic gray under the figure.',
          },
          questions: {
            type: 'array',
            description: 'Questions for this section. Each must have at least a `prompt`.',
            items: {
              type: 'object',
              properties: {
                number: { type: 'string', description: "Optional label, e.g. '1', 'Q3', '1a'." },
                prompt: { type: 'string', description: 'The question prompt.' },
                choices: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Optional multiple-choice options (rendered A./B./C./…).',
                },
                answer: { type: 'string', description: 'The correct answer.' },
                explanation: { type: 'string', description: 'Optional worked solution.' },
                answer_lines: {
                  type: 'integer',
                  minimum: 0,
                  maximum: 5,
                  description:
                    "Optional number of blank underscore lines rendered BELOW the question for the student to write on. Mirrors the real ELEC 3120 final-exam layout. Use 2-3 for a one-liner, 3-4 for a short prose answer, 5 for a longer one (HARD CAP 5 — denser sections crash the layout engine). Omit (or 0) for MCQ-only questions.",
                },
              },
              required: ['prompt'],
            },
          },
          append: {
            type: 'boolean',
            description:
              'When true, ADD to the section (preserves anything already filled). When false (default), REPLACE the section content.',
          },
        },
        required: ['draft_id', 'section_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_diagram',
      description:
        "Render a PRINT-QUALITY, academic networking diagram using Python (matplotlib + networkx). Use this for ALL exam-paper diagrams — every label is exact, the style is textbook-grade (Cisco-style icons, serif title, sans-serif body, 220 DPI), and the output rivals figures in CMU 15-441 / MIT 6.829 / Stanford CS144 lecture notes. Returns { image_url } — pass it back **at the SECTION level** on `pdf_add_section_content` (top-level `image_url` arg, NOT inside any `questions[]` entry). Real-exam layout: figure sits ABOVE the first question of the section. Supported diagram types (use the EXACT JSON shape under `data` for the chosen type):\n" +
        "  • network_topology — Cisco-style icons (routers, switches, hosts, servers, clouds, firewalls, users) connected by labelled links. data = { nodes: [{ id, label, kind: 'router'|'switch'|'host'|'server'|'cloud'|'firewall'|'user', ip?, extra?, size?, pos?: [x,y] }], links: [{ from, to, label?, bandwidth?, style?: 'solid'|'dashed', color? }], layout?: 'kamada_kawai'|'spring'|'shell'|'explicit' }\n" +
        "  • weighted_graph — graph-theory style (routing/shortest path/MST/traffic engineering). Edges show numeric weights. Optionally highlight one or more paths in different colors (e.g. an OSPF best path vs. a backup). data = { nodes: [{ id, label?, pos?: [x,y] }], edges: [{ from, to, weight, color? }], paths?: [{ nodes: [id,…], color?, label?, width? }] }\n" +
        "  • sequence_diagram — TCP handshake, DNS resolution, HTTP req/resp, etc. data = { actors: [string,…], messages: [{ from, to, label, style?: 'solid'|'dashed', color? }], notes?: [{ after: <message_index>, text }] }\n" +
        "  • osi_stack — vertical layered architecture (OSI / TCP-IP / any layered model). data = { layers: [{ name, examples? }], highlight?: [layer_name,…] }\n" +
        "  • tcp_state — finite-state machine (TCP congestion control, any FSM). data = { states: [{ id, label, pos?: [x,y] }], transitions: [{ from, to, condition?: string, action?: string, label?: string }], initial?: state_id, initial_label?: string } — prefer `condition` (drawn above as bold monospace) + `action` (drawn below in italic, supports `\\n` for multi-line code-style actions like 'ssthresh = cwnd/2\\ncwnd = 1\\nretransmit'). KEEP transitions LEAN: if a state has more than 2 self-loops they will overcrowd; consolidate or use `pos` to manually space states. For TCP-CC FSM use exactly 3 states: Slow Start, Congestion Avoidance, Fast Recovery.\n" +
        "  • subnet_tree — hierarchical decomposition (VLSM, DNS hierarchy, AS structure). data = { root: { label, children?: [{ label, children?: […] }] } }\n" +
        "  • protocol_stack — side-by-side layered stacks at multiple hosts (encapsulation diagrams). data = { columns: [{ label, layers: [string,…] }], arrows?: [{ from: [col, layer], to: [col, layer], label? }] }\n" +
        "  • packet_format — RFC-style bit-field header layout (TCP / IP / UDP / Ethernet headers). data = { bits_per_row?: number (default 32), rows: [[ {name, bits}, … ], …] } — each row is an array of fields whose `bits` MUST sum to `bits_per_row`. Each row of rows is one 32-bit word. Use this for ANY question asking students to label header fields.\n" +
        "  • queueing_diagram — packet queueing / scheduling (FIFO, priority, WFQ, tail-drop). data = { slots: number, occupied: number, arriving?: [{ label?: string }, …], drop?: boolean, outgoing?: string, label?: string, annotations?: [{ text, target_slot, where?: 'below' }] } — `arriving` is an ARRAY of packet objects (left of queue), `outgoing` is the right-side caption, `drop` shows a red drop arrow.\n" +
        "  • timeline — time-series line plot (cwnd vs RTT for TCP Reno/Cubic/Tahoe, throughput vs time, RTT samples). data = { x_label?: string, y_label?: string, series: [{ label, points: [[x,y],…], color?, style?: 'solid'|'dashed', step?: boolean }], phases?: [{ x_start, x_end, label, color? }], events?: [{ x, label }] } — `phases` shades vertical bands for SS / CA / FR backgrounds (USE THIS for TCP cwnd plots — it makes the SS→CA→FR phase boundaries crystal-clear). `step` enables post-step drawing (good for ssthresh plateau jumps). Note the series field is `label` (not `name`).\n" +
        "  • leaky_bucket — leaky-bucket / token-bucket traffic-shaping diagram. data = { capacity: number, occupied: number, arriving?: [{ label?: string }, …], outflow_rate: string, overflow?: number, mode?: 'leaky'|'token' } — bursty packets above, bucket with current fill level, optional overflow drops, and constant-rate outflow arrow on the right. Use for ANY congestion-control / traffic-shaping / rate-limiting question.\n" +
        "Always supply a clear `title` so the diagram has a caption. Diagrams render in ~1-2 seconds and never fail on style.",
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: [
              'network_topology',
              'weighted_graph',
              'sequence_diagram',
              'osi_stack',
              'tcp_state',
              'subnet_tree',
              'protocol_stack',
              'packet_format',
              'queueing_diagram',
              'timeline',
              'leaky_bucket',
            ],
            description: 'The diagram type. Pick the one that matches the question scenario.',
          },
          title: {
            type: 'string',
            description: "Caption shown above the diagram (e.g. 'TCP Three-way Handshake', 'Small Office Network').",
          },
          data: {
            type: 'object',
            description:
              "Type-specific payload. See the description above for the exact shape required by each `type`. Use real, exam-grade values (real IPs like 192.168.1.1, real port numbers, real protocol field names) — every label appears verbatim in the output.",
          },
        },
        required: ['type', 'title', 'data'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pdf_render_draft',
      description:
        'Render an accumulated PDF draft to a file and return its download URL. Call this LAST, after every section in the draft has been filled via `pdf_add_section_content`. Returns { url, filename, title, pages, size_kb } just like `generate_pdf`. The draft is deleted after a successful render.',
      parameters: {
        type: 'object',
        properties: {
          draft_id: {
            type: 'string',
            description: 'The draft_id returned by pdf_create_draft.',
          },
        },
        required: ['draft_id'],
      },
    },
  },
];

// ─── Dispatcher ──────────────────────────────────────────────────────────────

export interface ToolExecutionResult {
  /** Stringified JSON returned to the model as the tool message content. */
  contentForModel: string;
  /** Optional structured payload for the frontend (e.g. PDF metadata). */
  display?: unknown;
  /** Short one-line summary used in the step-trail UI. */
  summary: string;
}

export async function executeTool(
  name: string,
  rawArgs: string | Record<string, unknown>,
  options?: { signal?: AbortSignal },
): Promise<ToolExecutionResult> {
  const args =
    typeof rawArgs === 'string' ? safeParseJson(rawArgs) : rawArgs ?? {};

  switch (name) {
    case 'search_course_content':
      return runSearchCourseContent(args);
    case 'web_search':
      return runWebSearch(args, options?.signal);
    case 'generate_pdf':
      return runGeneratePdf(args);
    case 'pdf_create_draft':
      return runPdfCreateDraft(args);
    case 'pdf_add_section_content':
      return runPdfAddSectionContent(args);
    case 'generate_diagram':
      return runGenerateDiagram(args, options?.signal);
    case 'pdf_render_draft':
      return runPdfRenderDraft(args);
    default:
      return {
        contentForModel: JSON.stringify({
          error: `Unknown tool: ${name}`,
        }),
        summary: `Unknown tool: ${name}`,
      };
  }
}

// ─── Tool: search_course_content ────────────────────────────────────────────

async function runSearchCourseContent(
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const query = String(args.query || '').trim();
  const max = clampInt(args.max_results, 1, 12, 6);

  if (!query) {
    return {
      contentForModel: JSON.stringify({ error: 'Query is required' }),
      summary: 'search_course_content: missing query',
    };
  }

  // Lightweight in-process search across the static knowledge base + any
  // uploaded lecture documents. Mirrors the heuristics used by the
  // chat route's searchKnowledgeBase but kept self-contained so the
  // agent loop doesn't depend on private internals of /api/chat.
  const queryLower = query.toLowerCase();
  const wordTokens = queryLower
    .split(/\s+/)
    .filter((w) => w.length > 1);
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
  const queryTokens = [...new Set([...wordTokens, ...cjkBigrams])];

  type Hit = {
    topicId: string;
    topicTitle: string;
    source: string;
    point: string;
    detail: string;
    score: number;
  };
  const hits: Hit[] = [];

  for (const topic of knowledgeTopics) {
    for (const kp of topic.keyPoints) {
      const haystack = [
        topic.title,
        topic.titleZh,
        topic.description,
        topic.descriptionZh,
        kp.point,
        kp.pointZh,
        kp.detail,
        kp.detailZh,
      ]
        .join(' ')
        .toLowerCase();
      let score = 0;
      for (const tok of queryTokens) {
        if (haystack.includes(tok)) score += 1;
      }
      if (score > 0) {
        hits.push({
          topicId: topic.id,
          topicTitle: topic.title,
          source: topic.source,
          point: kp.point,
          detail: kp.detail,
          score,
        });
      }
    }
  }

  hits.sort((a, b) => b.score - a.score);
  const top = hits.slice(0, max);

  const contentForModel = JSON.stringify({
    query,
    result_count: top.length,
    results: top.map((h) => ({
      topic: h.topicTitle,
      source: h.source,
      point: h.point,
      detail: h.detail,
    })),
  });

  return {
    contentForModel,
    summary:
      top.length === 0
        ? `No course content matched "${query}"`
        : `Found ${top.length} key points for "${query}"`,
    display: {
      query,
      results: top.map((h) => ({
        source: h.source,
        point: h.point,
      })),
    },
  };
}

// ─── Tool: web_search ───────────────────────────────────────────────────────

async function runWebSearch(
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<ToolExecutionResult> {
  const query = String(args.query || '').trim();
  if (!query) {
    return {
      contentForModel: JSON.stringify({ error: 'Query is required' }),
      summary: 'web_search: missing query',
    };
  }

  // Use OpenRouter's built-in `:online` web plugin via a tiny side call.
  // We deliberately use a small, cheap model here (default gemini flash)
  // because it just summarises Exa search hits – the agent's main model
  // doesn't need to be invoked for the search itself.
  // Poe rejects OpenRouter slugs and ignores the `:online` suffix —
  // but Gemini-3.1-Pro on Poe ships with native browsing, so it
  // serves the same purpose as OpenRouter's `:online` plugin.
  const sideModel =
    process.env.POE_WEB_TOOL_MODEL ||
    process.env.OPENROUTER_WEB_TOOL_MODEL ||
    (process.env.POE_KEY || process.env.POE_API_KEY
      ? 'Gemini-3.1-Pro'
      : 'google/gemini-2.5-flash-lite');

  const result = await openrouterChat(
    [
      {
        role: 'system',
        content:
          'You are a web-search assistant. Given a query, return a CONCISE factual summary (max 200 words) of what reputable sources say. Always include the source URLs you used inline as Markdown links. Do not speculate.',
      },
      { role: 'user', content: query },
    ],
    {
      model: sideModel,
      webSearch: true,
      temperature: 0.2,
      max_tokens: 700,
      timeout: 60_000,
      signal,
    },
  );

  if (result.error) {
    return {
      contentForModel: JSON.stringify({ error: result.error }),
      summary: `web_search failed: ${result.error}`,
    };
  }

  // The text returned already contains a LP_WEBSOURCES_JSON block. Strip
  // it from what we hand back to the model (we don't want it to cite
  // sentinels), but parse the JSON so the frontend can show source cards.
  const raw = result.text || '';
  const websources = extractWebSources(raw);
  const cleanText = raw
    .replace(/<!-- LP_WEBSOURCES_JSON_START -->[\s\S]*?<!-- LP_WEBSOURCES_JSON_END -->/g, '')
    .trim();

  return {
    contentForModel: JSON.stringify({
      query,
      summary: cleanText,
      sources: websources.map((s) => ({ url: s.url, title: s.title })),
    }),
    summary: `Web-searched "${query}" · ${websources.length} sources`,
    display: {
      query,
      summary: cleanText,
      sources: websources,
    },
  };
}

function extractWebSources(text: string): Array<{ url: string; title: string }> {
  const start = text.indexOf('<!-- LP_WEBSOURCES_JSON_START -->');
  const end = text.indexOf('<!-- LP_WEBSOURCES_JSON_END -->');
  if (start === -1 || end === -1 || end <= start) return [];
  try {
    const json = text.slice(start + '<!-- LP_WEBSOURCES_JSON_START -->'.length, end);
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s) => s && typeof s.url === 'string')
      .map((s) => ({ url: s.url as string, title: (s.title as string) || s.url }));
  } catch {
    return [];
  }
}

// ─── Tool: generate_pdf ─────────────────────────────────────────────────────

// Hard caps to prevent the model (or a malicious user) from triggering
// pathologically large PDFs. These match a "longest reasonable mock exam"
// and reject anything beyond it.
const MAX_SECTIONS = 30;
const MAX_QUESTIONS_PER_SECTION = 60;
// Per single `pdf_add_section_content` call. Smaller than the per-section
// total so the model is forced to send batches of at most this many
// questions per call. Big single-shot calls (e.g. 20 MCQs at once) are
// huge JSON payloads that take 1–2 minutes to generate and frequently
// time out on hosted deployments.
const MAX_QUESTIONS_PER_CALL = 8;
const MAX_TEXT_CHARS = 6_000;

// Disk hygiene: keep at most this many recent PDFs in public/agent-pdfs
// so an unauthenticated agent endpoint can't slowly fill the volume.
const MAX_PDFS_ON_DISK = 50;

// Time-based TTL: delete any PDF whose mtime is older than this. Gives
// students a generous window to download their files while still keeping
// long-term disk usage bounded even on quiet days when the 50-file cap
// would otherwise let stale files linger forever.
const PDF_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

async function pruneOldPdfs(): Promise<void> {
  const dir = getAgentPdfDir();
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }
  const pdfs = entries.filter((f) => f.toLowerCase().endsWith('.pdf'));
  if (pdfs.length === 0) return;

  const stats = await Promise.all(
    pdfs.map(async (f) => ({
      name: f,
      mtime: (await stat(path.join(dir, f))).mtimeMs,
    })),
  );

  // 1) Time-based TTL: drop anything older than PDF_MAX_AGE_MS.
  const cutoff = Date.now() - PDF_MAX_AGE_MS;
  const expired = stats.filter((s) => s.mtime < cutoff);
  const fresh = stats.filter((s) => s.mtime >= cutoff);

  // 2) Hard cap: even within the fresh set, keep only the newest N.
  fresh.sort((a, b) => b.mtime - a.mtime); // newest first
  const overCap = fresh.slice(MAX_PDFS_ON_DISK);

  const toDelete = [...expired, ...overCap];
  if (toDelete.length === 0) return;

  await Promise.all(
    toDelete.map((s) =>
      unlink(path.join(dir, s.name)).catch(() => undefined),
    ),
  );
}

async function runGeneratePdf(
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const spec = coerceToPdfSpec(args);
  if (!spec) {
    return {
      contentForModel: JSON.stringify({
        error:
          'Invalid spec. Required shape: { title: string, sections: Array<{ heading: string, body?: string, questions?: Array<{ prompt: string, choices?: string[], answer?: string, explanation?: string, number?: string }> }>, include_answers?: boolean, footer?: string }',
      }),
      summary: 'generate_pdf: invalid spec',
    };
  }

  // Enforce caps. We trim/reject rather than silently truncating so the
  // model gets a clear signal to retry with a smaller spec.
  if (spec.sections.length > MAX_SECTIONS) {
    return {
      contentForModel: JSON.stringify({
        error: `Too many sections (${spec.sections.length}). Maximum allowed: ${MAX_SECTIONS}.`,
      }),
      summary: `generate_pdf rejected: ${spec.sections.length} sections exceeds cap`,
    };
  }
  for (const sec of spec.sections) {
    if ((sec.questions?.length ?? 0) > MAX_QUESTIONS_PER_SECTION) {
      return {
        contentForModel: JSON.stringify({
          error: `Too many questions in section "${sec.heading}". Maximum allowed: ${MAX_QUESTIONS_PER_SECTION}.`,
        }),
        summary: 'generate_pdf rejected: questions cap exceeded',
      };
    }
    if (sec.body && sec.body.length > MAX_TEXT_CHARS) {
      sec.body = sec.body.slice(0, MAX_TEXT_CHARS) + '…';
    }
  }

  try {
    // Best-effort: cleanup old PDFs to keep disk usage bounded.
    await pruneOldPdfs().catch(() => undefined);

    const result = await renderPdfFromSpec(spec);

    // Persist a record so the user can find PDFs later (best-effort).
    try {
      // Stored as a simple AdminSetting-like row using our existing
      // KnowledgeDocument table would be wrong (that's for uploaded
      // lectures). Skip DB persistence for now – the file lives on
      // disk under public/agent-pdfs.
    } catch {
      // ignore
    }

    return {
      contentForModel: JSON.stringify({
        ok: true,
        url: result.url,
        filename: result.filename,
        title: result.title,
        pages: result.pages,
        size_kb: result.sizeKb,
        message:
          "PDF generated successfully. Tell the user it's ready and reference the URL above so the frontend can render a download card.",
      }),
      summary: `Generated PDF "${result.title}" (${result.pages}p · ${result.sizeKb}KB)`,
      display: {
        url: result.url,
        filename: result.filename,
        title: result.title,
        pages: result.pages,
        sizeKb: result.sizeKb,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[agent/generate_pdf] render failed:', err);
    return {
      contentForModel: JSON.stringify({ error: `PDF render failed: ${message}` }),
      summary: `PDF render failed: ${message}`,
    };
  }
}

// ─── Tools: incremental PDF builder ─────────────────────────────────────────

async function runPdfCreateDraft(
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const title = typeof args.title === 'string' ? args.title.trim() : '';
  const sectionsRaw = Array.isArray(args.sections) ? args.sections : null;
  if (!title || !sectionsRaw || sectionsRaw.length === 0) {
    return {
      contentForModel: JSON.stringify({
        error:
          'Required: { title: string, sections: Array<{ heading: string, kind?: "questions"|"text"|"mixed", target_question_count?: number, body?: string }> }',
      }),
      summary: 'pdf_create_draft: invalid input',
    };
  }
  if (sectionsRaw.length > MAX_SECTIONS) {
    return {
      contentForModel: JSON.stringify({
        error: `Too many sections (${sectionsRaw.length}). Maximum: ${MAX_SECTIONS}.`,
      }),
      summary: `pdf_create_draft rejected: ${sectionsRaw.length} sections exceeds cap`,
    };
  }

  const sections = sectionsRaw
    .map((s: unknown) => {
      if (!s || typeof s !== 'object') return null;
      const sec = s as Record<string, unknown>;
      const heading = typeof sec.heading === 'string' ? sec.heading.trim() : '';
      if (!heading) return null;
      const kindRaw = typeof sec.kind === 'string' ? sec.kind : 'questions';
      const kind = (['questions', 'text', 'mixed'] as const).includes(
        kindRaw as 'questions',
      )
        ? (kindRaw as 'questions' | 'text' | 'mixed')
        : 'questions';
      const targetQuestionCount =
        typeof sec.target_question_count === 'number'
          ? Math.max(
              1,
              Math.min(
                MAX_QUESTIONS_PER_SECTION,
                Math.floor(sec.target_question_count),
              ),
            )
          : undefined;
      // Clamp pre-seeded outline bodies at create-time to mirror the
      // limit applied in pdf_add_section_content. Otherwise a model
      // could push an arbitrarily large body in via the outline and
      // bypass the per-fill cap.
      let body = typeof sec.body === 'string' ? sec.body : undefined;
      if (body && body.length > MAX_TEXT_CHARS) {
        body = body.slice(0, MAX_TEXT_CHARS) + '…';
      }
      return { heading, kind, body, targetQuestionCount };
    })
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  if (sections.length === 0) {
    return {
      contentForModel: JSON.stringify({
        error: 'No valid sections provided.',
      }),
      summary: 'pdf_create_draft: no valid sections',
    };
  }

  // Best-effort prune to keep disk bounded — same contract as
  // generate_pdf, so disk hygiene works regardless of which flow the
  // model picks.
  await pruneOldPdfs().catch(() => undefined);

  const examMeta = coerceToExamMeta(args.exam_meta);
  const draft = createDraft({
    title,
    subtitle: typeof args.subtitle === 'string' ? args.subtitle : undefined,
    footer: typeof args.footer === 'string' ? args.footer : undefined,
    includeAnswers: Boolean(args.include_answers),
    examMode:
      typeof args.exam_mode === 'boolean'
        ? args.exam_mode
        : examMeta
          ? true
          : undefined,
    examMeta,
    sections,
  });

  const next = draft.plan.map((p) => ({
    section_id: p.id,
    heading: p.heading,
    kind: p.kind,
    target_question_count: p.targetQuestionCount,
  }));
  const totalTarget = next.reduce(
    (a, n) => a + (n.target_question_count ?? 0),
    0,
  );

  return {
    contentForModel: JSON.stringify({
      ok: true,
      draft_id: draft.id,
      title: draft.title,
      sections_to_fill: next,
      message:
        "Draft created. For EACH section_id above, call `pdf_add_section_content` once with that section's questions (aim for 6-8 per call (hard cap 8)). When sections_remaining is empty, call `pdf_render_draft` to produce the file. Do NOT re-send the whole spec.",
    }),
    summary: `Drafted "${title}" (${sections.length} sections, ~${totalTarget || '?'} questions planned)`,
    display: {
      draftId: draft.id,
      title: draft.title,
      sectionsTotal: sections.length,
      questionsTarget: totalTarget || undefined,
    },
  };
}

async function runPdfAddSectionContent(
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const draftId = typeof args.draft_id === 'string' ? args.draft_id : '';
  const sectionId = typeof args.section_id === 'string' ? args.section_id : '';
  if (!draftId || !sectionId) {
    return {
      contentForModel: JSON.stringify({
        error: 'Required: { draft_id, section_id, questions?, body?, append? }',
      }),
      summary: 'pdf_add_section_content: missing draft_id or section_id',
    };
  }

  const body = typeof args.body === 'string' ? args.body : undefined;
  const instruction =
    typeof args.instruction === 'string' ? args.instruction : undefined;
  // Section-level figure (real-exam layout: figure sits ABOVE the
  // first question of the section). Resolve `img:UUID` handles into
  // the actual base64 data URL so the renderer embeds bytes.
  const rawSectionImageUrl =
    typeof args.image_url === 'string'
      ? args.image_url
      : typeof args.imageUrl === 'string'
        ? args.imageUrl
        : undefined;
  const sectionImageUrl = rawSectionImageUrl
    ? resolveImageHandle(rawSectionImageUrl)
    : undefined;
  const sectionImageCaption =
    typeof args.image_caption === 'string'
      ? args.image_caption
      : typeof args.imageCaption === 'string'
        ? args.imageCaption
        : undefined;
  const questionsRaw = Array.isArray(args.questions) ? args.questions : null;
  const questions: PdfQuestion[] | undefined = questionsRaw
    ? questionsRaw
        .map((q: unknown) => {
          if (!q || typeof q !== 'object') return null;
          const qq = q as Record<string, unknown>;
          const prompt = typeof qq.prompt === 'string' ? qq.prompt : '';
          if (!prompt) return null;
          const choices = Array.isArray(qq.choices)
            ? qq.choices
                .map((c) => (typeof c === 'string' ? c : null))
                .filter((c): c is string => Boolean(c))
            : undefined;
          // Accept both snake_case (model-friendly) and camelCase for
          // image_url / image_caption — the JSON schema advertises
          // snake_case but Gemini occasionally camelCases tool args.
          const rawImageUrl =
            typeof qq.image_url === 'string'
              ? qq.image_url
              : typeof qq.imageUrl === 'string'
                ? qq.imageUrl
                : undefined;
          // Resolve `img:UUID` handles produced by generate_image into the
          // actual base64 data URL so the PDF renderer embeds bytes, not
          // a (potentially expiring) Poe CDN link.
          const imageUrl = resolveImageHandle(rawImageUrl);
          const imageCaption =
            typeof qq.image_caption === 'string'
              ? qq.image_caption
              : typeof qq.imageCaption === 'string'
                ? qq.imageCaption
                : undefined;
          // Accept snake_case (`answer_lines`) and camelCase
          // (`answerLines`). Coerce numeric strings → integer, clamp to
          // [0, 12] so a runaway value can't blow up the page.
          const rawAnswerLines =
            qq.answer_lines !== undefined
              ? qq.answer_lines
              : qq.answerLines !== undefined
                ? qq.answerLines
                : undefined;
          let answerLines: number | undefined;
          if (rawAnswerLines !== undefined && rawAnswerLines !== null) {
            const n =
              typeof rawAnswerLines === 'number'
                ? rawAnswerLines
                : Number(rawAnswerLines);
            if (Number.isFinite(n) && n > 0) {
              answerLines = Math.min(Math.max(Math.round(n), 1), 5);
            }
          }
          return {
            number:
              typeof qq.number === 'string' || typeof qq.number === 'number'
                ? qq.number
                : undefined,
            prompt,
            choices,
            answer: typeof qq.answer === 'string' ? qq.answer : undefined,
            explanation:
              typeof qq.explanation === 'string' ? qq.explanation : undefined,
            imageUrl,
            imageCaption,
            answerLines,
          };
        })
        .filter((q): q is PdfQuestion => Boolean(q))
    : undefined;

  if (questions && questions.length > MAX_QUESTIONS_PER_CALL) {
    return {
      contentForModel: JSON.stringify({
        error: `Too many questions in a single call (${questions.length}). Maximum per call: ${MAX_QUESTIONS_PER_CALL}. Split this section across multiple pdf_add_section_content calls — use append:true on the 2nd, 3rd, ... call to add more questions to the same section. Smaller batches are MUCH faster and avoid timeouts.`,
      }),
      summary: 'pdf_add_section_content: per-call questions cap exceeded',
    };
  }

  // Backward-compat: older model traces still attach the figure on
  // the FIRST question of the section. If we got a per-question image
  // but no section-level image, hoist it up so the new renderer (which
  // only consults section-level imageUrl) still embeds the figure.
  let hoistedImageUrl = sectionImageUrl;
  let hoistedImageCaption = sectionImageCaption;
  if (!hoistedImageUrl && questions) {
    const withImg = questions.find(
      (q) => typeof q.imageUrl === 'string' && q.imageUrl.length > 0,
    );
    if (withImg?.imageUrl) {
      hoistedImageUrl = withImg.imageUrl;
      hoistedImageCaption = hoistedImageCaption ?? withImg.imageCaption;
    }
  }

  const result = addSectionContent({
    draftId,
    sectionId,
    body: body && body.length > MAX_TEXT_CHARS ? body.slice(0, MAX_TEXT_CHARS) + '…' : body,
    questions,
    instruction,
    imageUrl: hoistedImageUrl,
    imageCaption: hoistedImageCaption,
    append: Boolean(args.append),
  });

  if ('error' in result) {
    return {
      contentForModel: JSON.stringify({ error: result.error }),
      summary: `pdf_add_section_content: ${result.error}`,
    };
  }

  return {
    contentForModel: JSON.stringify({
      ok: true,
      draft_id: result.draftId,
      section_heading: result.sectionHeading,
      questions_in_section: result.questionsInSection,
      has_body: result.hasBody,
      sections_remaining: result.sectionsRemaining,
      message:
        result.sectionsRemaining.length === 0
          ? 'All sections filled. Call `pdf_render_draft` now to produce the file.'
          : `Section saved. Continue with the next section_id (${result.sectionsRemaining.length} remaining).`,
    }),
    summary: `Filled "${result.sectionHeading}" (${result.questionsInSection} q, ${result.sectionsRemaining.length} left)`,
    display: {
      sectionHeading: result.sectionHeading,
      questionsInSection: result.questionsInSection,
      sectionsRemaining: result.sectionsRemaining.length,
    },
  };
}

async function runPdfRenderDraft(
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const draftId = typeof args.draft_id === 'string' ? args.draft_id : '';
  if (!draftId) {
    return {
      contentForModel: JSON.stringify({
        error: 'Required: { draft_id }',
      }),
      summary: 'pdf_render_draft: missing draft_id',
    };
  }

  const draft = getDraft(draftId);
  if (!draft) {
    return {
      contentForModel: JSON.stringify({
        error: `Unknown or expired draft_id: ${draftId}. Drafts auto-expire after 30 minutes — recreate with pdf_create_draft.`,
      }),
      summary: `pdf_render_draft: unknown draft ${draftId}`,
    };
  }

  const spec = draftToSpec(draftId);
  if (!spec) {
    return {
      contentForModel: JSON.stringify({ error: 'Draft is empty.' }),
      summary: 'pdf_render_draft: empty draft',
    };
  }

  // Warn if any section is empty — render anyway but tell the model so
  // it can either add the missing section OR proceed if intentional.
  const emptySections = spec.sections.filter(
    (s) => !(s.body || (s.questions && s.questions.length > 0)),
  );

  // Hard validation: if a section's body / question prompts say
  // "Refer to Figure …" or "the figure below" but the section has no
  // figure attached, refuse to render and tell the model EXACTLY which
  // section needs a generate_diagram call. Real-exam layout puts the
  // figure at the SECTION level (above the first question), so we
  // only consult `section.imageUrl` here. The system prompt alone is
  // too easy to ignore on long, multi-tool sequences.
  const figureRefRe =
    /\b(refer to figure|the figure (above|below)|figure \d+ (above|below))\b/i;
  // Map spec section index → original draft plan id so the error
  // payload can return the real `section_id` the model should re-call
  // pdf_add_section_content with. Drafts and specs are 1:1 by index.
  const sectionsMissingFigure = spec.sections
    .map((s, idx) => ({ s, idx }))
    .filter(({ s }) => {
      const haystack = [
        s.body ?? '',
        ...(s.questions ?? []).map((q) => q.prompt ?? ''),
      ].join('\n');
      if (!figureRefRe.test(haystack)) return false;
      const hasFig =
        typeof s.imageUrl === 'string' && s.imageUrl.length > 0;
      return !hasFig;
    });
  if (sectionsMissingFigure.length > 0) {
    const list = sectionsMissingFigure
      .map(({ s }) => `"${s.heading}"`)
      .join(', ');
    return {
      contentForModel: JSON.stringify({
        error: `Cannot render: ${sectionsMissingFigure.length} section(s) reference a figure but have no image attached: ${list}. For EACH of these sections, call generate_diagram (pick a sensible type: network_topology, timeline, sequence_diagram, packet_format, weighted_graph, etc.) → take the returned image_url → call pdf_add_section_content with that section_id and pass image_url + image_caption "Figure N: …" at the SECTION level (NOT inside any question). Then call pdf_render_draft again. If diagram generation keeps failing, instead REMOVE the "Refer to Figure" wording from the body/prompt so the section is self-contained.`,
        sections_missing_figure: sectionsMissingFigure.map(({ s, idx }) => ({
          section_id: draft.plan[idx]?.id,
          heading: s.heading,
        })),
      }),
      summary: `pdf_render_draft blocked: ${sectionsMissingFigure.length} section(s) missing required figure`,
    };
  }

  try {
    const result = await renderPdfFromSpec(spec);
    deleteDraft(draftId);

    return {
      contentForModel: JSON.stringify({
        ok: true,
        url: result.url,
        filename: result.filename,
        title: result.title,
        pages: result.pages,
        size_kb: result.sizeKb,
        empty_sections: emptySections.map((s) => s.heading),
        message:
          "PDF generated successfully. Tell the user it's ready and reference the URL above so the frontend can render a download card.",
      }),
      summary: `Rendered draft "${result.title}" (${result.pages}p · ${result.sizeKb}KB)`,
      display: {
        url: result.url,
        filename: result.filename,
        title: result.title,
        pages: result.pages,
        sizeKb: result.sizeKb,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[agent/pdf_render_draft] render failed:', err);
    return {
      contentForModel: JSON.stringify({
        error: `PDF render failed: ${message}`,
      }),
      summary: `pdf_render_draft failed: ${message}`,
    };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function coerceToPdfSpec(args: Record<string, unknown>): PdfSpec | null {
  const title = typeof args.title === 'string' ? args.title.trim() : '';
  if (!title) return null;
  const sectionsRaw = Array.isArray(args.sections) ? args.sections : null;
  if (!sectionsRaw || sectionsRaw.length === 0) return null;

  const sections = sectionsRaw
    .map((s: unknown) => {
      if (!s || typeof s !== 'object') return null;
      const sec = s as Record<string, unknown>;
      const heading = typeof sec.heading === 'string' ? sec.heading : '';
      if (!heading) return null;
      const body = typeof sec.body === 'string' ? sec.body : undefined;
      const questionsRaw = Array.isArray(sec.questions) ? sec.questions : null;
      const questions = questionsRaw
        ?.map((q: unknown) => {
          if (!q || typeof q !== 'object') return null;
          const qq = q as Record<string, unknown>;
          const prompt = typeof qq.prompt === 'string' ? qq.prompt : '';
          if (!prompt) return null;
          // Accept snake_case (`answer_lines`) and camelCase
          // (`answerLines`). Coerce numeric strings → integer, clamp to
          // [0, 12]. Same logic as the incremental `pdf_add_section_content`
          // path so both code paths produce equivalent PdfQuestion shapes.
          const rawAnswerLines =
            qq.answer_lines !== undefined
              ? qq.answer_lines
              : qq.answerLines !== undefined
                ? qq.answerLines
                : undefined;
          let answerLines: number | undefined;
          if (rawAnswerLines !== undefined && rawAnswerLines !== null) {
            const n =
              typeof rawAnswerLines === 'number'
                ? rawAnswerLines
                : Number(rawAnswerLines);
            if (Number.isFinite(n) && n > 0) {
              answerLines = Math.min(Math.max(Math.round(n), 1), 5);
            }
          }
          return {
            number:
              typeof qq.number === 'string' || typeof qq.number === 'number'
                ? qq.number
                : undefined,
            prompt,
            choices: Array.isArray(qq.choices)
              ? qq.choices
                  .map((c: unknown) => (typeof c === 'string' ? c : null))
                  .filter((c): c is string => Boolean(c))
              : undefined,
            answer: typeof qq.answer === 'string' ? qq.answer : undefined,
            explanation:
              typeof qq.explanation === 'string' ? qq.explanation : undefined,
            answerLines,
          };
        })
        .filter((q): q is NonNullable<typeof q> => Boolean(q));
      return { heading, body, questions };
    })
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  if (sections.length === 0) return null;

  return {
    title,
    subtitle:
      typeof args.subtitle === 'string' ? args.subtitle : undefined,
    sections,
    includeAnswers: Boolean(args.include_answers),
    footer:
      typeof args.footer === 'string' ? args.footer : undefined,
    examMode: typeof args.exam_mode === 'boolean' ? args.exam_mode : undefined,
    examMeta: coerceToExamMeta(args.exam_meta),
  };
}

/**
 * Coerce a model-supplied `exam_meta` object (snake_case keys) to the
 * camelCase `PdfExamMeta` shape consumed by the renderer. Returns
 * undefined for anything that isn't a usable cover-page object.
 */
function coerceToExamMeta(
  raw: unknown,
): import('./pdf-generator').PdfExamMeta | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const m = raw as Record<string, unknown>;
  const courseCode = typeof m.course_code === 'string' ? m.course_code.trim() : '';
  const examTitle = typeof m.exam_title === 'string' ? m.exam_title.trim() : '';
  if (!courseCode || !examTitle) return undefined;

  // Accept either an array of strings or a single string (some models emit
  // `instructions: "Calculator allowed."` instead of a list — normalise to
  // a singleton array so the cover page still renders the content).
  const stringList = (v: unknown): string[] | undefined => {
    if (typeof v === 'string') {
      const t = v.trim();
      return t.length > 0 ? [t.slice(0, 500)] : undefined;
    }
    if (!Array.isArray(v)) return undefined;
    const out = v
      .map((x) => (typeof x === 'string' ? x.trim() : ''))
      .filter((x) => x.length > 0)
      .slice(0, 20)
      .map((x) => x.slice(0, 500));
    return out.length > 0 ? out : undefined;
  };

  return {
    courseCode,
    examTitle,
    dateTime: typeof m.date_time === 'string' ? m.date_time : undefined,
    totalPoints:
      typeof m.total_points === 'number' && Number.isFinite(m.total_points)
        ? Math.max(0, Math.floor(m.total_points))
        : undefined,
    instructions: stringList(m.instructions),
    honorCode: stringList(m.honor_code),
    goodLuck: typeof m.good_luck === 'string' ? m.good_luck : undefined,
    pledgeText:
      m.pledge_text === null
        ? null
        : typeof m.pledge_text === 'string'
          ? m.pledge_text
          : undefined,
  };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function safeParseJson(s: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(s);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function clampInt(
  v: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

// ─── Tool: generate_diagram ─────────────────────────────────────────────────

/**
 * Render a print-quality networking diagram with Python (matplotlib +
 * networkx) by spawning scripts/render_diagram.py. The script reads a
 * JSON spec from stdin and prints the path of the generated PNG to
 * stdout. We then load the PNG, base64-encode it, and stash it under
 * a short handle (img:UUID) — the same flow used by the old AI image
 * tool, so PdfQuestion.imageUrl resolution still works unchanged.
 *
 * Why local Python instead of an AI image bot:
 *   - Print-quality, label-perfect output (every IP / port / protocol
 *     name appears verbatim — no hallucinated text).
 *   - Academic B&W style suitable for a real exam paper.
 *   - Renders in 1-2 seconds, no API timeouts, no rate limits.
 */
async function runGenerateDiagram(
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<ToolExecutionResult> {
  const SUPPORTED = new Set([
    'network_topology',
    'weighted_graph',
    'sequence_diagram',
    'osi_stack',
    'tcp_state',
    'subnet_tree',
    'protocol_stack',
    'packet_format',
    'queueing_diagram',
    'timeline',
    'leaky_bucket',
  ]);

  const dtype = typeof args.type === 'string' ? args.type.trim() : '';
  const title = typeof args.title === 'string' ? args.title.trim() : '';
  const data =
    args.data && typeof args.data === 'object' && !Array.isArray(args.data)
      ? (args.data as Record<string, unknown>)
      : null;

  if (!SUPPORTED.has(dtype)) {
    return {
      contentForModel: JSON.stringify({
        error: `generate_diagram: unsupported type "${dtype}". Supported: ${[...SUPPORTED].join(', ')}.`,
      }),
      summary: `generate_diagram: unsupported type ${dtype || '(missing)'}`,
    };
  }
  if (!title) {
    return {
      contentForModel: JSON.stringify({
        error: 'generate_diagram: missing `title`.',
      }),
      summary: 'generate_diagram: missing title',
    };
  }
  if (!data) {
    return {
      contentForModel: JSON.stringify({
        error: 'generate_diagram: missing `data` object.',
      }),
      summary: 'generate_diagram: missing data',
    };
  }

  const { spawn } = await import('node:child_process');
  const { readFile, unlink } = await import('node:fs/promises');
  const scriptPath = path.join(process.cwd(), 'scripts', 'render_diagram.py');
  const spec = JSON.stringify({ type: dtype, title, data });

  const result = await new Promise<{
    code: number | null;
    stdout: string;
    stderr: string;
  }>((resolve, reject) => {
    const child = spawn('python3', [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (b) => (stdout += b.toString()));
    child.stderr.on('data', (b) => (stderr += b.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));

    if (signal) {
      const onAbort = () => child.kill('SIGTERM');
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }

    // 60s wall-clock cap (renders take ~1-2s; this is just a safety net)
    const timer = setTimeout(() => child.kill('SIGTERM'), 60_000);
    child.on('close', () => clearTimeout(timer));

    child.stdin.write(spec);
    child.stdin.end();
  }).catch((err) => ({ code: -1, stdout: '', stderr: err?.message || String(err) }));

  if (result.code !== 0 || !result.stdout.trim()) {
    return {
      contentForModel: JSON.stringify({
        error: `generate_diagram: python renderer failed (exit ${result.code}). ${result.stderr.slice(0, 400)}`,
        hint: 'Check the `data` shape matches the schema for this `type`. If unsure, try a simpler diagram.',
      }),
      summary: `generate_diagram: render failed (${dtype})`,
    };
  }

  const pngPath = result.stdout.trim().split(/\r?\n/).pop() || '';
  let buf: Buffer;
  try {
    buf = await readFile(pngPath);
  } catch (err) {
    return {
      contentForModel: JSON.stringify({
        error: `generate_diagram: could not read generated PNG at ${pngPath}: ${err instanceof Error ? err.message : 'unknown error'}`,
      }),
      summary: `generate_diagram: read failed`,
    };
  }

  const dataUrl = `data:image/png;base64,${buf.toString('base64')}`;
  const handle = `img:${randomUUID()}`;
  GENERATED_IMAGES.set(handle, dataUrl);
  if (GENERATED_IMAGES.size > 50) {
    const firstKey = GENERATED_IMAGES.keys().next().value;
    if (firstKey) GENERATED_IMAGES.delete(firstKey);
  }

  // Best-effort cleanup of the rendered PNG on disk — bytes are now
  // in memory under the handle, so the file is no longer needed.
  unlink(pngPath).catch(() => {});

  return {
    contentForModel: JSON.stringify({
      image_url: handle,
      type: dtype,
      title,
      bytes: buf.byteLength,
      hint:
        'Pass image_url back AS-IS as the SECTION-level `image_url` arg on pdf_add_section_content (NOT inside any questions[] entry). The PDF tool will embed the actual image bytes.',
    }),
    summary: `Rendered ${dtype} diagram "${title}" (${(buf.byteLength / 1024).toFixed(0)} KB)`,
    display: {
      type: dtype,
      title,
      kbBytes: Math.round(buf.byteLength / 1024),
    },
  };
}


// In-memory store: maps short handle (img:UUID) → base64 data URL.
// Lives for the lifetime of the server process; bounded to ~50 entries
// (~50-100 MB max). Resolved by pdf_add_section_content / pdf_render_draft
// when embedding images into the PDF.
const GENERATED_IMAGES = new Map<string, string>();

export function resolveImageHandle(handle: string | undefined): string | undefined {
  if (!handle) return undefined;
  if (handle.startsWith('img:')) return GENERATED_IMAGES.get(handle) || undefined;
  return handle; // already a URL or data URL — pass through
}
