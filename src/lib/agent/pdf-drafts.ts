/**
 * In-memory store for incremental PDF drafts.
 *
 * Why this exists:
 *   The single-shot `generate_pdf` tool requires the model to emit the
 *   ENTIRE PDF spec — title, every section, every question, every
 *   explanation — as one JSON tool-call argument. For mock-exam-sized
 *   outputs (20-30+ questions) this is slow (3-5 minutes wall-clock,
 *   often hits the timeout) and fragile (model can drift / break JSON
 *   over thousands of tokens, losing all the work).
 *
 * Strategy:
 *   1. The model first calls `pdf_create_draft` with just the OUTLINE —
 *      title + sections list with `target_question_count` hints.
 *   2. The model then calls `pdf_add_section_content` once per section,
 *      generating only that section's content. Each call is small
 *      (~6-10 questions) so it fits comfortably in a fast response.
 *   3. Finally `pdf_render_draft` takes the accumulated spec and runs
 *      it through the existing `renderPdfFromSpec` pipeline.
 *
 * Scope:
 *   Drafts live in process memory keyed by a short ID. They are NOT
 *   persisted across deploys / autoscale instances — and they don't
 *   need to be: the entire build → render flow happens within ONE
 *   HTTP streaming request to /api/agent (one agent-loop turn), and
 *   that request is pinned to a single instance.
 *
 *   Drafts are evicted after 30 min as a safety net (in case the model
 *   crashes mid-build) and we cap the active set at 100 to prevent
 *   memory leaks if many users build PDFs concurrently.
 */

import 'server-only';

import { randomUUID } from 'node:crypto';
import type {
  PdfSpec,
  PdfSection,
  PdfQuestion,
  PdfExamMeta,
} from './pdf-generator';

const DRAFT_TTL_MS = 30 * 60 * 1000;        // 30 min
const MAX_ACTIVE_DRAFTS = 100;

export type DraftSectionKind = 'questions' | 'text' | 'mixed';

export interface DraftSectionPlan {
  /** Stable ID returned from `pdf_create_draft`. */
  id: string;
  heading: string;
  kind: DraftSectionKind;
  /** Hint for the model. Not enforced. */
  targetQuestionCount?: number;
}

interface PdfDraft {
  id: string;
  createdAt: number;
  title: string;
  subtitle?: string;
  footer?: string;
  includeAnswers: boolean;
  /** Formal exam-paper formatting (footer, "End of Exam." marker). */
  examMode?: boolean;
  /** Cover-page metadata. Implies examMode=true when set. */
  examMeta?: PdfExamMeta;
  /** Plan emitted at create-time. Drives the `next_actions` listing. */
  plan: DraftSectionPlan[];
  /**
   * Filled content keyed by section ID. Includes the section-level
   * figure (imageUrl + imageCaption) and the optional italic
   * instruction line under the heading — these match the real
   * ELEC 3120 final-exam layout where the figure sits ABOVE the
   * questions and each section opens with one short instruction.
   */
  filled: Map<
    string,
    {
      body?: string;
      questions: PdfQuestion[];
      instruction?: string;
      imageUrl?: string;
      imageCaption?: string;
    }
  >;
}

const drafts = new Map<string, PdfDraft>();

function sweepExpired(): void {
  const cutoff = Date.now() - DRAFT_TTL_MS;
  for (const [id, d] of drafts) {
    if (d.createdAt < cutoff) drafts.delete(id);
  }
  // Hard cap defence in depth — drop the oldest if we somehow exceed.
  if (drafts.size > MAX_ACTIVE_DRAFTS) {
    const sorted = Array.from(drafts.entries()).sort(
      (a, b) => a[1].createdAt - b[1].createdAt,
    );
    const drop = sorted.slice(0, drafts.size - MAX_ACTIVE_DRAFTS);
    for (const [id] of drop) drafts.delete(id);
  }
}

export interface CreateDraftInput {
  title: string;
  subtitle?: string;
  footer?: string;
  includeAnswers?: boolean;
  examMode?: boolean;
  examMeta?: PdfExamMeta;
  sections: Array<{
    heading: string;
    kind?: DraftSectionKind;
    body?: string;
    targetQuestionCount?: number;
  }>;
}

export function createDraft(input: CreateDraftInput): PdfDraft {
  sweepExpired();

  const plan: DraftSectionPlan[] = input.sections.map((s) => ({
    id: `s_${randomUUID().slice(0, 8)}`,
    heading: s.heading,
    kind: (s.kind as DraftSectionKind) || 'questions',
    targetQuestionCount: s.targetQuestionCount,
  }));

  const filled = new Map<string, { body?: string; questions: PdfQuestion[] }>();
  // Pre-seed bodies the model already supplied at create-time
  // (useful for prose intros that don't need a separate fill call).
  for (let i = 0; i < input.sections.length; i++) {
    const src = input.sections[i];
    const dst = plan[i];
    if (src.body) {
      filled.set(dst.id, { body: src.body, questions: [] });
    }
  }

  const draft: PdfDraft = {
    id: `d_${randomUUID().slice(0, 12)}`,
    createdAt: Date.now(),
    title: input.title,
    subtitle: input.subtitle,
    footer: input.footer,
    includeAnswers: Boolean(input.includeAnswers),
    examMode: input.examMode,
    examMeta: input.examMeta,
    plan,
    filled,
  };
  drafts.set(draft.id, draft);
  return draft;
}

export function getDraft(id: string): PdfDraft | undefined {
  sweepExpired();
  return drafts.get(id);
}

export function deleteDraft(id: string): void {
  drafts.delete(id);
}

export interface AddSectionInput {
  draftId: string;
  sectionId: string;
  body?: string;
  questions?: PdfQuestion[];
  /** Italic gray one-liner under the heading (real-exam style). */
  instruction?: string;
  /** Section-level figure URL/handle returned by `generate_diagram`. */
  imageUrl?: string;
  /** Caption for the section-level figure, e.g. "Figure 1: …". */
  imageCaption?: string;
  /** When true, append to existing content instead of replacing. */
  append?: boolean;
}

export interface AddSectionResult {
  ok: true;
  draftId: string;
  sectionHeading: string;
  questionsInSection: number;
  hasBody: boolean;
  sectionsRemaining: Array<{ id: string; heading: string }>;
}

export function addSectionContent(
  input: AddSectionInput,
): AddSectionResult | { error: string } {
  const draft = getDraft(input.draftId);
  if (!draft) return { error: `Unknown draft_id: ${input.draftId}` };

  const planEntry = draft.plan.find((p) => p.id === input.sectionId);
  if (!planEntry) {
    return {
      error: `Unknown section_id "${input.sectionId}" for draft ${draft.id}. Valid section ids: ${draft.plan
        .map((p) => p.id)
        .join(', ')}`,
    };
  }

  const existing = draft.filled.get(planEntry.id) ?? { questions: [] };
  const newBody = input.body
    ? input.append && existing.body
      ? `${existing.body}\n\n${input.body}`
      : input.body
    : existing.body;
  const newQuestions = input.questions
    ? input.append
      ? [...existing.questions, ...input.questions]
      : input.questions
    : existing.questions;
  // Section-level meta (instruction line + figure) is REPLACED on
  // every call (not appended) so the model can correct a typo or swap
  // the figure by re-calling pdf_add_section_content. `undefined`
  // means "leave the previous value alone" so an append-only call
  // that just adds more questions doesn't wipe a previously-attached
  // figure.
  const newInstruction =
    input.instruction !== undefined ? input.instruction : existing.instruction;
  const newImageUrl =
    input.imageUrl !== undefined ? input.imageUrl : existing.imageUrl;
  const newImageCaption =
    input.imageCaption !== undefined
      ? input.imageCaption
      : existing.imageCaption;

  draft.filled.set(planEntry.id, {
    body: newBody,
    questions: newQuestions,
    instruction: newInstruction,
    imageUrl: newImageUrl,
    imageCaption: newImageCaption,
  });

  const remaining = draft.plan.filter((p) => {
    const f = draft.filled.get(p.id);
    if (!f) return true;
    // 'text' sections are complete once a body exists.
    // 'questions' and 'mixed' sections require at least one question
    // (a pre-seeded body alone does NOT make a question section
    // complete, otherwise the model would skip filling questions).
    if (p.kind === 'text') return !f.body;
    return (f.questions?.length ?? 0) === 0;
  });

  return {
    ok: true,
    draftId: draft.id,
    sectionHeading: planEntry.heading,
    questionsInSection: newQuestions.length,
    hasBody: Boolean(newBody),
    sectionsRemaining: remaining.map((r) => ({ id: r.id, heading: r.heading })),
  };
}

/**
 * Materialise the accumulated draft into a `PdfSpec` ready for
 * `renderPdfFromSpec`. Sections that were never filled are still
 * included (with empty content) so the model gets a clear visual cue
 * that something is missing — but in practice the model should always
 * fill every section before calling render.
 */
export function draftToSpec(draftId: string): PdfSpec | null {
  const draft = getDraft(draftId);
  if (!draft) return null;

  const sections: PdfSection[] = draft.plan.map((p) => {
    const f = draft.filled.get(p.id);
    return {
      heading: p.heading,
      body: f?.body,
      questions: f?.questions ?? [],
      instruction: f?.instruction,
      imageUrl: f?.imageUrl,
      imageCaption: f?.imageCaption,
    };
  });

  return {
    title: draft.title,
    subtitle: draft.subtitle,
    sections,
    includeAnswers: draft.includeAnswers,
    footer: draft.footer,
    examMode: draft.examMode,
    examMeta: draft.examMeta,
  };
}
