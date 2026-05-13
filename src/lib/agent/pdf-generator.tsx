/**
 * PDF generator for Agent Mode.
 *
 * Renders a structured `PdfSpec` (title + sections + optional questions)
 * into a real PDF file using `@react-pdf/renderer`, saves it under
 * `public/agent-pdfs/` and returns a metadata object the agent can hand
 * back to the user.
 *
 * Chinese characters are supported by registering Noto Sans TC from a
 * public CDN on first use. The font is cached in-memory by react-pdf
 * after the first download (~10MB), so subsequent renders are fast.
 *
 * NOTE: this file uses TSX (JSX inside react-pdf primitives). It is only
 * imported from server code (the `/api/agent` route) – never bundle into
 * the client.
 */

import 'server-only';

import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  Font,
  pdf,
} from '@react-pdf/renderer';
import { randomUUID } from 'node:crypto';
import { writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import React from 'react';
import { getAgentPdfDir, getAgentPdfUrl } from './pdf-storage';

// ─── Fonts ───────────────────────────────────────────────────────────────────
// Register a CJK-capable font once at module load. We deliberately use
// the Sans-TC weight 400 OTF from jsDelivr-mirrored Google Fonts because
// it covers Traditional Chinese, Simplified Chinese and Japanese kana.
// If the font fails to load (e.g. offline), react-pdf falls back to
// Helvetica which renders CJK as missing-glyph boxes – English PDFs
// will still work.
let fontsRegistered = false;
function ensureFontsRegistered() {
  if (fontsRegistered) return;
  fontsRegistered = true;
  try {
    // Noto Sans CJK has no true italic cut, but react-pdf's font matcher
    // throws "Could not resolve font … italic" when any style sets
    // `fontStyle: 'italic'` and no italic variant is registered. We
    // register synthetic italic variants pointing back at the regular /
    // bold OTF so the matcher succeeds; the resulting text simply isn't
    // slanted, which matches typical CJK typographic convention anyway.
    const REG_SRC =
      'https://cdn.jsdelivr.net/gh/googlefonts/noto-cjk@main/Sans/OTF/TraditionalChinese/NotoSansCJKtc-Regular.otf';
    const BOLD_SRC =
      'https://cdn.jsdelivr.net/gh/googlefonts/noto-cjk@main/Sans/OTF/TraditionalChinese/NotoSansCJKtc-Bold.otf';
    Font.register({
      family: 'NotoSansTC',
      fonts: [
        { src: REG_SRC, fontWeight: 400 },
        { src: REG_SRC, fontWeight: 400, fontStyle: 'italic' },
        { src: BOLD_SRC, fontWeight: 700 },
        { src: BOLD_SRC, fontWeight: 700, fontStyle: 'italic' },
      ],
    });
    // Disable hyphenation so CJK lines wrap on character boundaries.
    Font.registerHyphenationCallback((word) => [word]);
  } catch (err) {
    console.error('[pdf-generator] Failed to register CJK font:', err);
  }
}

// ─── Spec types ──────────────────────────────────────────────────────────────

export interface PdfQuestion {
  /** Optional question number, e.g. "1", "Q3", "1a". Auto-numbered if omitted. */
  number?: string | number;
  /** The question prompt (markdown not rendered – plain text only). */
  prompt: string;
  /** Multiple-choice options. Rendered as A./B./C./… */
  choices?: string[];
  /** Answer to display when `includeAnswers` is true. */
  answer?: string;
  /** Optional worked-solution / explanation text. */
  explanation?: string;
  /**
   * Optional inline image rendered between the prompt and the choices.
   * Should be a remote URL (https://…); react-pdf fetches it at render
   * time. Set by the model via the `generate_image` tool which proxies
   * to a Poe image bot (default: Nano-Banana-Pro) and returns a CDN URL.
   */
  imageUrl?: string;
  /** Optional caption rendered under the image (e.g. "Figure 1: …"). */
  imageCaption?: string;
  /**
   * Optional number of blank underscore lines to render BELOW the
   * question (after choices, before the inline answer). Used to give
   * students vertical writing space on prose questions, mirroring the
   * real ELEC 3120 final-exam layout (e.g. "Reason 1: ____" lines).
   * Typical values: 2-3 for a one-liner, 3-4 for a short prose
   * answer, 5 for a longer one (HARD CAP 5 — denser sections crash
   * react-pdf's pdfkit transform).
   * Ignored for MCQ-only questions.
   */
  answerLines?: number;
}

export interface PdfSection {
  /** Section heading, e.g. "Section A — Multiple Choice". */
  heading: string;
  /**
   * Optional one-line italic gray instruction shown directly under the
   * heading, e.g. "Please write the correct answer at the left side of
   * each question." Mirrors the real ELEC 3120 final-exam layout.
   */
  instruction?: string;
  /** Optional body paragraph(s). Newline-separated, plain text. */
  body?: string;
  /**
   * Optional figure rendered at the TOP of the section (between the
   * body and the first question). Replaces the old per-question image
   * — putting the figure at section scope mirrors the real ELEC 3120
   * final exam ("Figure 1: LAN Switch Topology" sits above the
   * Spanning-Tree section, not inside any one question) AND avoids a
   * react-pdf layout bug where an Image inside a question that ALSO
   * has choices/answer-lines computes a -1.7e+22 page-break offset.
   * Pass the `image_url` returned by `generate_diagram` here.
   */
  imageUrl?: string;
  /** Optional caption, e.g. "Figure 1: LAN Switch Topology". */
  imageCaption?: string;
  /** Quiz/exam style questions for this section. */
  questions?: PdfQuestion[];
}

/**
 * Cover page metadata for formal exam-style documents (mock papers).
 * When provided, a dedicated cover page is rendered before the body
 * sections, mirroring the layout of the real ELEC 3120 final exam:
 * course header, exam title, instructions, honor code, name/ID fields
 * and an integrity pledge.
 */
export interface PdfExamMeta {
  /** Course header line, e.g. "ELEC 3120 - Spring 2026". */
  courseCode: string;
  /** Centered exam title, e.g. "Final Exam (Mock)". */
  examTitle: string;
  /** Optional date/time line, e.g. "Practice — 120 minutes". */
  dateTime?: string;
  /** Optional total points (used in the cover-page intro line). */
  totalPoints?: number;
  /** Numbered list of exam-taking instructions. */
  instructions?: string[];
  /** Numbered list of honor-code clauses. */
  honorCode?: string[];
  /** Closing line on the cover, defaults to "Good luck!". */
  goodLuck?: string;
  /** When true (default), render Name / ID Number fields. */
  showNameField?: boolean;
  /**
   * When provided, render Q1 as an integrity-pledge prompt with a
   * signature line. Defaults to a standard pledge if `examMeta` is set
   * and this is omitted. Set to null to suppress.
   */
  pledgeText?: string | null;
}

export interface PdfSpec {
  title: string;
  subtitle?: string;
  sections: PdfSection[];
  /** When true, an "Answer Key" section is appended showing each Q's answer. */
  includeAnswers?: boolean;
  /** Footer text shown on every page (e.g. "Generated by LearningPacer"). */
  footer?: string;
  /**
   * When true the document is formatted as a formal exam paper:
   * "Page X of N · Please go on to the next page…" footer on every
   * page, "End of Exam." marker on the last page.
   */
  examMode?: boolean;
  /**
   * When provided, a cover page is rendered before the body sections.
   * Implies `examMode = true` unless explicitly overridden.
   */
  examMeta?: PdfExamMeta;
}

export interface PdfRenderResult {
  url: string;        // public URL, e.g. /agent-pdfs/abc.pdf
  filename: string;   // basename
  filePath: string;   // absolute path on disk
  sizeKb: number;
  pages: number;      // estimated (we don't pre-parse the PDF)
  title: string;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontFamily: 'NotoSansTC',
    fontSize: 11,
    lineHeight: 1.55,
    color: '#1f2937',
  },
  header: {
    marginBottom: 24,
    borderBottomWidth: 2,
    borderBottomColor: '#10b981',
    paddingBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: '#065f46',
  },
  subtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  sectionWrap: {
    marginTop: 0,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: 700,
    color: '#111827',
    marginTop: 0,
    marginBottom: 8,
  },
  // Italic gray one-liner under a section heading, e.g. real ELEC
  // 3120 final exam: "Please write the correct answer at the left
  // side of each question." (Section A) or "Please answer the
  // following questions." (Section B onwards).
  sectionInstruction: {
    fontSize: 10,
    color: '#4b5563',
    fontStyle: 'italic',
    marginBottom: 10,
  },
  body: {
    fontSize: 11,
    color: '#1f2937',
    marginBottom: 8,
    lineHeight: 1.5,
  },
  // Section-level figure (top of section, real ELEC 3120 exam style).
  // Center-aligned + caption below in italic. Explicit pixel size
  // (width 360, height 220) avoids react-pdf auto-layout underflow.
  sectionFigureWrap: {
    marginTop: 4,
    marginBottom: 12,
    alignItems: 'center',
  },
  sectionFigure: {
    // Width-only: react-pdf preserves the source PNG's intrinsic
    // aspect ratio when only one dimension is given. Forcing both
    // dims squashed every diagram into the same 360×220 box and
    // looked terrible for wide layouts (packet_format ~2.25:1) and
    // tall ones (tcp_state ~1.3:1) alike. 440pt = ~88% of the 499pt
    // content area on A4, mirrors the real-exam figure scale.
    width: 440,
  },
  sectionFigureCaption: {
    fontSize: 10,
    color: '#374151',
    marginTop: 4,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  questionWrap: {
    marginTop: 10,
    marginBottom: 6,
  },
  questionPrompt: {
    fontSize: 11,
    color: '#111827',
    lineHeight: 1.5,
  },
  // (Deprecated: per-question images are no longer rendered. Figures
  // are attached at the SECTION level via section.imageUrl. The styles
  // below remain only so downstream theming/CSS-in-JS doesn't break.)
  questionImageWrap: { marginTop: 0 },
  questionImage: { width: 380, height: 220 },
  questionImageCaption: { fontSize: 9, color: '#6b7280', fontStyle: 'italic' },
  choice: {
    fontSize: 11,
    color: '#374151',
    marginLeft: 22,
    marginTop: 3,
  },
  answerSpace: {
    marginTop: 8,
    marginBottom: 4,
  },
  answerLine: {
    fontSize: 11,
    color: '#111827',
    marginBottom: 14,
    letterSpacing: 0,
  },
  answerKey: {
    marginTop: 6,
    fontSize: 10,
    color: '#047857',
    fontWeight: 700,
  },
  explanation: {
    marginTop: 4,
    fontSize: 10,
    color: '#4b5563',
    fontStyle: 'italic',
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 48,
    right: 48,
    fontSize: 9,
    color: '#9ca3af',
    textAlign: 'center',
  },
  pageNumber: {
    position: 'absolute',
    bottom: 24,
    right: 48,
    fontSize: 9,
    color: '#9ca3af',
  },
  answerKeyHeading: {
    fontSize: 14,
    fontWeight: 700,
    color: '#065f46',
    marginTop: 18,
    marginBottom: 8,
  },
  answerKeyRow: {
    fontSize: 11,
    color: '#1f2937',
    marginBottom: 3,
  },
  // ─── Cover page (exam-style) ───────────────────────────────────────
  coverCourse: {
    fontSize: 12,
    fontWeight: 700,
    textAlign: 'center',
    color: '#111827',
    marginTop: 12,
  },
  coverTitle: {
    fontSize: 22,
    fontWeight: 700,
    textAlign: 'center',
    color: '#111827',
    marginTop: 32,
    // Explicit lineHeight: page-level 1.55 inherits as a multiplier
    // but for big bold heading fonts, react-pdf's wrap algorithm
    // sometimes leaves wrapped lines visually touching their
    // descenders/ascenders. 1.3 keeps a clear gap when a long title
    // like "Final Exam (Mock Practice — 120 min)" wraps to 2 lines.
    lineHeight: 1.3,
  },
  coverDate: {
    fontSize: 12,
    textAlign: 'center',
    color: '#374151',
    marginTop: 12,
  },
  coverIntro: {
    fontSize: 11,
    textAlign: 'center',
    color: '#374151',
    marginTop: 28,
    marginHorizontal: 16,
  },
  coverSubHeading: {
    fontSize: 13,
    fontWeight: 700,
    color: '#111827',
    marginTop: 22,
    marginBottom: 6,
  },
  coverListItem: {
    fontSize: 11,
    color: '#1f2937',
    marginBottom: 6,
    marginLeft: 6,
  },
  coverGoodLuck: {
    fontSize: 13,
    fontWeight: 700,
    textAlign: 'center',
    color: '#111827',
    marginTop: 28,
    marginBottom: 28,
  },
  coverField: {
    fontSize: 11,
    color: '#111827',
    marginTop: 14,
  },
  coverPledge: {
    fontSize: 11,
    color: '#111827',
    marginTop: 18,
  },
  signatureLine: {
    fontSize: 11,
    color: '#111827',
    marginTop: 22,
  },
  examFooterWrap: {
    position: 'absolute',
    bottom: 20,
    left: 48,
    right: 48,
    flexDirection: 'column',
    alignItems: 'center',
  },
  examFooterLine: {
    fontSize: 10,
    color: '#374151',
    textAlign: 'center',
  },
  endOfExam: {
    fontSize: 12,
    fontWeight: 700,
    color: '#065f46',
    textAlign: 'center',
    marginTop: 24,
  },
});

// ─── Document component ─────────────────────────────────────────────────────

const CHOICE_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

/**
 * Defensive text sanitizer.
 *
 * Some LLM tool-call payloads ship escape characters as their literal
 * 2-character sequence (e.g. `\\n` in the JSON string, which decodes to
 * the two-character string "\n" rather than an actual newline). Other
 * payloads include markdown table syntax that we cannot render natively.
 *
 * This helper:
 *   1. Turns literal `\n`, `\r`, `\t` sequences into real characters.
 *   2. Unwraps escaped quotes / backslashes (`\"`, `\\`).
 *   3. Strips markdown-table separator rows (`|---|---|`) so they don't
 *      appear as raw dashes between table rows.
 *   4. Converts pipe-delimited markdown table rows into a more readable
 *      bullet style (`• col1 | col2 | col3`) since react-pdf has no
 *      built-in table primitive.
 *   5. Collapses runs of 3+ blank lines into 2.
 */
function sanitizeText(input: string | undefined | null): string {
  if (!input) return '';
  let text = String(input);

  // Decode literal escape sequences that survived JSON parsing.
  // Order matters: handle the *double*-escaped variants first
  // (e.g. "\\\\n" decodes to "\\n" after one JSON pass), then the
  // single-escape variants. Run the loop twice to catch any nested
  // sequences that get exposed by the first pass.
  for (let pass = 0; pass < 2; pass++) {
    text = text
      // Double-escaped first: "\\\\n" → "\n", "\\\\t" → spaces, etc.
      .replace(/\\\\r\\\\n/g, '\n')
      .replace(/\\\\n/g, '\n')
      .replace(/\\\\r/g, '\n')
      .replace(/\\\\t/g, '    ')
      .replace(/\\\\"/g, '"')
      // Single-escape variants.
      .replace(/\\r\\n/g, '\n')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\n')
      .replace(/\\t/g, '    ')
      .replace(/\\"/g, '"')
      // Finally collapse "\\\\" → "\" once both passes resolved escapes.
      .replace(/\\\\/g, '\\');
  }

  // ─── Context-aware markdown-table reflow ────────────────────────────
  // We walk the text line-by-line and classify each line as one of:
  //   - SEPARATOR: a row like "|---|---|" (or "---|---")
  //   - PIPE_BORDERED: starts AND ends with `|` (e.g. "| a | b |")
  //   - PIPE_INNER: contains 2+ pipes but is not bordered (e.g. "Col A | Col B")
  //   - OTHER: anything else
  // A PIPE_INNER line is only reflowed into a bullet when it is
  // **structurally part of a table** — i.e. an adjacent line is either
  // SEPARATOR or PIPE_BORDERED. SEPARATOR lines are removed.
  // PIPE_BORDERED lines are always reflowed.
  // This prevents prose like "Answer: A | B | C | D" (PIPE_INNER with no
  // surrounding table context) from being bulleted incorrectly.
  const SEPARATOR_RE = /^[ \t]*\|?[ \t:|-]*-{3,}[ \t:|-]*\|?[ \t]*$/;
  const PIPE_BORDERED_RE = /^[ \t]*\|.*\|[ \t]*$/;
  type LineKind = 'SEPARATOR' | 'PIPE_BORDERED' | 'PIPE_INNER' | 'OTHER';
  function classify(line: string): LineKind {
    if (SEPARATOR_RE.test(line)) return 'SEPARATOR';
    if (PIPE_BORDERED_RE.test(line)) return 'PIPE_BORDERED';
    const pipeCount = (line.match(/\|/g) ?? []).length;
    if (pipeCount >= 2) return 'PIPE_INNER';
    return 'OTHER';
  }
  // We mark table rows with a sentinel prefix `\u0001TBL\u0001` so the
  // downstream MultilineText component can detect contiguous table
  // blocks and render them as proper react-pdf <View> grids (boxed,
  // aligned cells) instead of bullet-prefixed prose. The sentinel is
  // a control character that never appears in real exam text.
  const TBL_PREFIX = '\u0001TBL\u0001';
  function tagRow(line: string): string {
    const cells = line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim());
    if (cells.length === 0) return '';
    // Cell delimiter inside the marker: another control char so we can
    // split safely when rendering.
    return TBL_PREFIX + cells.join('\u0002');
  }

  const lines = text.split('\n');
  const kinds = lines.map(classify);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const k = kinds[i];
    if (k === 'SEPARATOR') {
      // Drop the separator entirely.
      continue;
    }
    if (k === 'PIPE_BORDERED') {
      out.push(tagRow(lines[i]));
      continue;
    }
    if (k === 'PIPE_INNER') {
      // Only reflow if a neighbour is part of a table.
      const prev = i > 0 ? kinds[i - 1] : 'OTHER';
      const next = i < lines.length - 1 ? kinds[i + 1] : 'OTHER';
      const inTable =
        prev === 'SEPARATOR' ||
        prev === 'PIPE_BORDERED' ||
        next === 'SEPARATOR' ||
        next === 'PIPE_BORDERED' ||
        // Two consecutive PIPE_INNER lines also indicate a table.
        prev === 'PIPE_INNER' ||
        next === 'PIPE_INNER';
      out.push(inTable ? tagRow(lines[i]) : lines[i]);
      continue;
    }
    out.push(lines[i]);
  }
  text = out.join('\n');

  // Collapse 3+ consecutive blank lines down to a single blank line.
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

/**
 * Render a multi-line plain-text block as a sequence of <Text> elements
 * so that newlines produce real visual line breaks in the PDF.
 */
const TBL_PREFIX = '\u0001TBL\u0001';
const TBL_CELL_SEP = '\u0002';

/**
 * Render a contiguous block of table rows (already tagged by
 * sanitizeText) as a real react-pdf grid with thin borders, equal
 * column widths and a subtly shaded header row. Looks like a real
 * exam-paper table instead of bullet-prefixed prose.
 */
function TableBlock({
  rows,
  keyPrefix,
}: {
  rows: string[][];
  keyPrefix: string;
}) {
  if (rows.length === 0) return null;
  const colCount = Math.max(...rows.map((r) => r.length));
  return (
    <View style={tableStyles.wrap} wrap={false}>
      {rows.map((cells, rIdx) => {
        const isHeader = rIdx === 0;
        // Pad short rows so every row has the same number of cells.
        const padded = [...cells];
        while (padded.length < colCount) padded.push('');
        return (
          <View
            key={`${keyPrefix}-tr-${rIdx}`}
            style={[
              tableStyles.row,
              isHeader ? tableStyles.headerRow : null,
              rIdx === rows.length - 1 ? tableStyles.lastRow : null,
            ] as any}
          >
            {padded.map((cell, cIdx) => (
              <View
                key={`${keyPrefix}-tr-${rIdx}-c-${cIdx}`}
                style={[
                  tableStyles.cell,
                  cIdx === padded.length - 1 ? tableStyles.lastCell : null,
                ] as any}
              >
                <Text
                  style={[
                    tableStyles.cellText,
                    isHeader ? tableStyles.headerCellText : null,
                  ] as any}
                >
                  {cell || '\u00A0'}
                </Text>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

const tableStyles = StyleSheet.create({
  wrap: {
    marginTop: 6,
    marginBottom: 8,
    borderTopWidth: 0.6,
    borderLeftWidth: 0.6,
    borderColor: '#1f2937',
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 0.6,
    borderColor: '#1f2937',
  },
  lastRow: {},
  headerRow: {
    backgroundColor: '#f3f4f6',
  },
  cell: {
    flex: 1,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRightWidth: 0.6,
    borderColor: '#1f2937',
  },
  lastCell: {},
  cellText: {
    fontSize: 10,
    color: '#1f2937',
  },
  headerCellText: {
    fontWeight: 700,
  },
});

function MultilineText({
  text,
  style,
  keyPrefix,
}: {
  text: string;
  style: any;
  keyPrefix: string;
}) {
  const clean = sanitizeText(text);
  if (!clean) return null;
  const lines = clean.split('\n');

  // Group consecutive table-tagged rows so we can render each block
  // as one TableBlock instead of one Text per row. Anything else
  // renders as a plain <Text>.
  const out: React.ReactNode[] = [];
  let buffer: string[][] = [];
  const flush = () => {
    if (buffer.length === 0) return;
    out.push(
      <TableBlock
        key={`${keyPrefix}-tbl-${out.length}`}
        rows={buffer}
        keyPrefix={`${keyPrefix}-tbl-${out.length}`}
      />,
    );
    buffer = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith(TBL_PREFIX)) {
      const cells = line.slice(TBL_PREFIX.length).split(TBL_CELL_SEP);
      buffer.push(cells);
      continue;
    }
    flush();
    out.push(
      <Text key={`${keyPrefix}-${i}`} style={style}>
        {line.trim().length > 0 ? line : '\u00A0'}
      </Text>,
    );
  }
  flush();
  return <>{out}</>;
}

const DEFAULT_PLEDGE =
  'Please write out the following statement and sign it with your name: "I promise to follow the academic integrity policies in taking this exam."';

function CoverPage({ meta, examMode }: { meta: PdfExamMeta; examMode: boolean }) {
  const showName = meta.showNameField !== false;
  const pledge =
    meta.pledgeText === null
      ? null
      : meta.pledgeText && meta.pledgeText.trim().length > 0
        ? meta.pledgeText
        : DEFAULT_PLEDGE;

  // Build the "The exam consists of N pages…" intro line.
  const introBits: string[] = [];
  if (typeof meta.totalPoints === 'number' && meta.totalPoints > 0) {
    introBits.push(`There are ${meta.totalPoints} points total on this exam.`);
  }
  introBits.push(
    'Please go through your copy to make sure that all pages have been printed.',
  );

  return (
    <Page size="A4" style={styles.page} wrap>
      <Text style={styles.coverCourse}>{meta.courseCode}</Text>
      <Text style={styles.coverTitle}>{meta.examTitle}</Text>
      {meta.dateTime ? (
        <Text style={styles.coverDate}>{meta.dateTime}</Text>
      ) : null}

      <Text style={styles.coverIntro}>{introBits.join(' ')}</Text>

      {meta.instructions && meta.instructions.length > 0 ? (
        <View>
          <Text style={styles.coverSubHeading}>Instructions:</Text>
          {meta.instructions.map((line, i) => (
            <Text key={`ins-${i}`} style={styles.coverListItem}>
              {i + 1}. {line}
            </Text>
          ))}
        </View>
      ) : null}

      {meta.honorCode && meta.honorCode.length > 0 ? (
        <View>
          <Text style={styles.coverSubHeading}>Academic Honor Code:</Text>
          {meta.honorCode.map((line, i) => (
            <Text key={`hc-${i}`} style={styles.coverListItem}>
              {i + 1}. {line}
            </Text>
          ))}
        </View>
      ) : null}

      <Text style={styles.coverGoodLuck}>{meta.goodLuck || 'Good luck!'}</Text>

      {showName ? (
        <Text style={styles.coverField}>
          Name: ________________________________     ID Number: ________________
        </Text>
      ) : null}

      {pledge ? (
        <View>
          <Text style={styles.coverPledge}>1. (1 pt) {pledge}</Text>
          <Text style={styles.signatureLine}>
            ______________________________________________________________________
          </Text>
          <Text style={styles.signatureLine}>
            ______________________________________________________________________
          </Text>
          <Text style={styles.signatureLine}>
            Signature: _____________________________
          </Text>
        </View>
      ) : null}

      {/* Exam-style footer on the cover too — two stacked centred
          lines matching the real ELEC 3120 final exam. We use a
          <View fixed> wrapper with two <Text> children rather than a
          single <Text render> returning "...\n..." because the latter
          confuses react-pdf's coordinate solver when combined with
          position:absolute (it produces a negative scientific-notation
          y-coordinate that the PDF stream writer rejects). */}
      {examMode ? (
        <View style={styles.examFooterWrap} fixed>
          <Text
            style={styles.examFooterLine}
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
          {/* Both Text children use a `render` callback (even though
              the second one is static). Without `render`, react-pdf's
              two-pass layout sometimes draws the static sibling
              TWICE on top of itself with a slight offset, producing
              the visible "ghosting" effect. Using render() forces it
              to participate in both passes consistently. */}
          <Text
            style={styles.examFooterLine}
            render={() => 'Please go on to the next page…'}
          />
        </View>
      ) : null}
    </Page>
  );
}

function PdfDocument({ spec }: { spec: PdfSpec }) {
  const examMode = Boolean(spec.examMode || spec.examMeta);
  const footer =
    spec.footer ||
    (examMode
      ? `${spec.examMeta?.courseCode || 'ELEC 3120'} — ${spec.examMeta?.examTitle || 'Mock Exam'}`
      : 'Generated by LearningPacer · ELEC3120 Virtual TA');

  return (
    <Document
      title={spec.title}
      author="LearningPacer"
      subject={spec.subtitle || spec.title}
    >
      {/* Optional cover page (rendered as its own A4 page). */}
      {spec.examMeta ? (
        <CoverPage meta={spec.examMeta} examMode={examMode} />
      ) : null}

      <Page size="A4" style={styles.page} wrap>
        {/* Header — only when there is no dedicated cover page. */}
        {!spec.examMeta ? (
          <View style={styles.header}>
            <Text style={styles.title}>{spec.title}</Text>
            {spec.subtitle ? (
              <Text style={styles.subtitle}>{spec.subtitle}</Text>
            ) : null}
          </View>
        ) : null}

        {/* Sections — in exam mode each section starts on a new page,
            mirroring the real ELEC 3120 final exam where Section A,
            Section B, Section C … each begin at the top of a fresh
            page. The first section never breaks (otherwise we get a
            blank page right after the cover).

            We put `break` on the section HEADING (the leading <Text>),
            NOT on the wrapper View. Putting `break` on a View that
            also has `wrap` corrupts react-pdf's transform stack and
            crashes with `unsupported number: -1.7e+22` whenever 4+
            broken sections accumulate. Heading-level break is the
            documented react-pdf idiom and works reliably. */}
        {spec.sections.map((section, sIdx) => (
          <View
            key={`s-${sIdx}`}
            style={styles.sectionWrap}
            wrap
          >
            <Text
              style={styles.sectionHeading}
              break={examMode && sIdx > 0}
            >
              {sanitizeText(section.heading)}
            </Text>
            {section.instruction ? (
              <Text style={styles.sectionInstruction}>
                {sanitizeText(section.instruction)}
              </Text>
            ) : null}
            {section.body ? (
              <MultilineText
                text={section.body}
                style={styles.body}
                keyPrefix={`b-${sIdx}`}
              />
            ) : null}
            {/* Section-level figure (real exam: figure sits ABOVE the
                first question, not inside any question). Wrapped in a
                View with explicit pixel size on the Image so react-pdf
                never auto-computes the figure dimensions. */}
            {section.imageUrl ? (
              // No wrap={false} on the figure container: react-pdf's
              // pdfkit transform underflows to -1.7e+22 whenever an
              // unbreakable block sits on a section that ALSO carries
              // 4+ prose questions with answer_lines (each question is
              // ~80-100pt; 4 of them + a 230pt figure won't fit on one
              // page and the unbreakable hint corrupts the layout).
              // The figure itself is small (380×220) so a natural
              // break here is acceptable and almost never triggers.
              <View style={styles.sectionFigureWrap}>
                <Image
                  src={section.imageUrl}
                  style={styles.sectionFigure}
                />
                {section.imageCaption ? (
                  <Text style={styles.sectionFigureCaption}>
                    {sanitizeText(section.imageCaption)}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {section.questions?.map((q, qIdx) => {
              const number = q.number != null ? String(q.number) : `${qIdx + 1}`;
              const cleanPrompt = sanitizeText(q.prompt);
              const promptLines = cleanPrompt.split('\n');
              const firstLine = promptLines[0] ?? '';
              const restLines = promptLines.slice(1);
              return (
                // No wrap={false} on the question container — see the
                // earlier crash investigation: forcing a long question
                // (prompt + 5 underscore lines + choices) to be
                // unbreakable produces a negative y-offset that
                // underflows pdfkit's transform() to -1.7e+22.
                <View key={`q-${sIdx}-${qIdx}`} style={styles.questionWrap}>
                  {/* First line carries the question number; remaining
                      lines render as their own <Text> entries to
                      preserve real newlines. Real-exam style: NOT bold
                      — the number is enough emphasis. */}
                  <Text style={styles.questionPrompt}>
                    {number}. {firstLine.length > 0 ? firstLine : ' '}
                  </Text>
                  {restLines.map((line, lIdx) => (
                    <Text
                      key={`qp-${sIdx}-${qIdx}-${lIdx}`}
                      style={styles.questionPrompt}
                    >
                      {line.length > 0 ? line : ' '}
                    </Text>
                  ))}
                  {q.choices?.map((choice, cIdx) => {
                    // Defensive: model often emits "A. 20 bytes" / "(A) 20
                    // bytes" / "A) 20 bytes" / "A: 20 bytes" already in the
                    // string. Renderer also auto-prepends "A. " from
                    // CHOICE_LETTERS, which produced "A. A. 20 bytes" in the
                    // first generated paper. Strip a leading letter prefix
                    // (case-insensitive, max one char) before rendering.
                    const cleaned = sanitizeText(choice).replace(
                      /^\s*[\(\[]?([A-Ha-h])[\)\].:、]\s+/,
                      '',
                    );
                    return (
                      <Text
                        key={`c-${sIdx}-${qIdx}-${cIdx}`}
                        style={styles.choice}
                      >
                        {CHOICE_LETTERS[cIdx] ?? String(cIdx + 1)}. {cleaned}
                      </Text>
                    );
                  })}
                  {/* Vertical writing space for prose answers — N blank
                      underscore lines, mirroring the real ELEC 3120 final
                      exam where every prose question gets multiple long
                      "____________" lines for the student to write on. */}
                  {q.answerLines && q.answerLines > 0 ? (
                    <View style={styles.answerSpace}>
                      {Array.from({
                        // Hard cap at 5 — empirical max-density tested
                        // against 4 prose sections × 5 questions each.
                        // Higher values trigger react-pdf's pdfkit
                        // transform underflow (-1.7e+22) on dense
                        // sections. The dispatcher already clamps at
                        // 5; this is defence-in-depth for any path
                        // that bypasses it.
                        length: Math.min(Math.max(q.answerLines, 1), 5),
                      }).map((_, i) => (
                        <Text
                          key={`al-${sIdx}-${qIdx}-${i}`}
                          style={styles.answerLine}
                        >
                          {'_'.repeat(82)}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                  {spec.includeAnswers && q.answer ? (
                    <MultilineText
                      text={`Answer: ${q.answer}`}
                      style={styles.answerKey}
                      keyPrefix={`ans-${sIdx}-${qIdx}`}
                    />
                  ) : null}
                  {spec.includeAnswers && q.explanation ? (
                    <MultilineText
                      text={q.explanation}
                      style={styles.explanation}
                      keyPrefix={`exp-${sIdx}-${qIdx}`}
                    />
                  ) : null}
                </View>
              );
            })}
          </View>
        ))}

        {/* "End of Exam." marker for exam papers. */}
        {examMode ? <Text style={styles.endOfExam}>End of Exam.</Text> : null}

        {/* Optional answer key (when answers are hidden inline) */}
        {!spec.includeAnswers && hasAnyAnswers(spec) ? (
          <View style={styles.sectionWrap} wrap break={examMode}>
            <Text style={styles.answerKeyHeading}>Answer Key</Text>
            {spec.sections.flatMap((section, sIdx) =>
              (section.questions ?? []).map((q, qIdx) => {
                if (!q.answer) return null;
                const number = q.number != null ? String(q.number) : `${qIdx + 1}`;
                const combined = q.explanation
                  ? `${number}. ${q.answer}\n   ${q.explanation}`
                  : `${number}. ${q.answer}`;
                return (
                  <MultilineText
                    key={`ak-${sIdx}-${qIdx}`}
                    text={combined}
                    style={styles.answerKeyRow}
                    keyPrefix={`ak-${sIdx}-${qIdx}`}
                  />
                );
              }),
            )}
          </View>
        ) : null}

        {/* Footer — exam mode mirrors the real ELEC 3120 final exam:
            "Page X of N" on the first line, "Please go on to the next
            page…" on the second line, both centred. Two stacked
            <Text> children inside a <View fixed> rather than one
            <Text render> with "...\n..." (the latter underflows the
            absolute-position y coordinate and crashes PDF stream
            writing with "unsupported number"). */}
        {examMode ? (
          <View style={styles.examFooterWrap} fixed>
            <Text
              style={styles.examFooterLine}
              render={({ pageNumber, totalPages }) =>
                `Page ${pageNumber} of ${totalPages}`
              }
            />
            <Text style={styles.examFooterLine}>
              Please go on to the next page…
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.footer} fixed>
              {footer}
            </Text>
            <Text
              style={styles.pageNumber}
              render={({ pageNumber, totalPages }) =>
                `${pageNumber} / ${totalPages}`
              }
              fixed
            />
          </>
        )}
      </Page>
    </Document>
  );
}

function hasAnyAnswers(spec: PdfSpec): boolean {
  return spec.sections.some((s) =>
    (s.questions ?? []).some((q) => q.answer && q.answer.trim().length > 0),
  );
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Render a `PdfSpec` to a PDF file under `public/agent-pdfs/` and return
 * the public URL + metadata. Throws on render or write failure so the
 * caller (the agent tool dispatcher) can surface a clear error.
 */
export async function renderPdfFromSpec(
  spec: PdfSpec,
): Promise<PdfRenderResult> {
  ensureFontsRegistered();

  // Sanitise/derive a friendly filename: lowercase, ascii word chars,
  // dashes for spaces, plus a uuid to guarantee uniqueness.
  const slug =
    (spec.title || 'document')
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'document';
  const id = randomUUID().slice(0, 8);
  const filename = `${slug}-${id}.pdf`;

  // Storage location is environment-aware: in dev we keep using
  // public/agent-pdfs/ (handy for direct browsing), in production we
  // write to /tmp/agent-pdfs/ which is the only reliably writable
  // path on Replit Autoscale. See `pdf-storage.ts` for details.
  const outDir = getAgentPdfDir();
  await mkdir(outDir, { recursive: true });
  const filePath = path.join(outDir, filename);

  // Render to a Node Buffer. `pdf().toBuffer()` returns a Node stream in
  // older versions and a Buffer-promise in newer ones – handle both.
  const instance = pdf(<PdfDocument spec={spec} />);
  const out = await instance.toBuffer();
  const buffer: Buffer = Buffer.isBuffer(out)
    ? out
    : await streamToBuffer(out as NodeJS.ReadableStream);

  await writeFile(filePath, buffer);
  const stats = await stat(filePath);

  // Rough page-count estimate: react-pdf doesn't expose totals from the
  // buffer, but we can scan for `/Type /Page` markers in the PDF.
  const pages = estimatePageCount(buffer);

  return {
    url: getAgentPdfUrl(filename),
    filename,
    filePath,
    sizeKb: Math.max(1, Math.round(stats.size / 1024)),
    pages,
    title: spec.title,
  };
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

function estimatePageCount(buffer: Buffer): number {
  // Count `/Type /Page` (not `/Pages`). Falls back to 1 on any oddness.
  try {
    const text = buffer.toString('latin1');
    const matches = text.match(/\/Type\s*\/Page[^s]/g);
    return matches?.length || 1;
  } catch {
    return 1;
  }
}
