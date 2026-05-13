'use client';

/**
 * AgentStepTrail — visualises the steps an Agent Mode reply takes.
 *
 * The `/api/agent` endpoint streams SSE events. The page-level fetch
 * loop accumulates them into an `AgentStep[]` array on the message,
 * which this component then renders as a vertical trail of cards
 * (search → web → pdf → final).
 *
 * Tool results that include PDF metadata are rendered as a special
 * download card so the user can click straight through to the file.
 */

import React from 'react';
import {
  Search,
  Globe,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Download,
  Sparkles,
} from 'lucide-react';

export type AgentStepStatus = 'running' | 'done' | 'error';

export interface AgentStep {
  id: string;
  toolName: string;
  args?: Record<string, unknown>;
  status: AgentStepStatus;
  summary?: string;
  display?: unknown;
}

interface PdfDisplay {
  url: string;
  filename: string;
  title: string;
  pages: number;
  sizeKb: number;
}

interface SearchDisplay {
  query: string;
  results: Array<{ source: string; point: string }>;
}

interface WebDisplay {
  query: string;
  summary: string;
  sources: Array<{ url: string; title: string }>;
}

function isPdfDisplay(d: unknown): d is PdfDisplay {
  return (
    typeof d === 'object' &&
    d !== null &&
    typeof (d as PdfDisplay).url === 'string' &&
    typeof (d as PdfDisplay).filename === 'string'
  );
}

function isSearchDisplay(d: unknown): d is SearchDisplay {
  return (
    typeof d === 'object' &&
    d !== null &&
    Array.isArray((d as SearchDisplay).results)
  );
}

function isWebDisplay(d: unknown): d is WebDisplay {
  return (
    typeof d === 'object' &&
    d !== null &&
    Array.isArray((d as WebDisplay).sources)
  );
}

function toolMeta(toolName: string) {
  switch (toolName) {
    case 'search_course_content':
      return {
        icon: Search,
        label: { en: 'Course search', zh: '課程搜尋' },
        color: 'emerald',
      };
    case 'web_search':
      return {
        icon: Globe,
        label: { en: 'Web search', zh: '網絡搜尋' },
        color: 'sky',
      };
    case 'generate_pdf':
      return {
        icon: FileText,
        label: { en: 'Generate PDF', zh: '生成 PDF' },
        color: 'amber',
      };
    default:
      return {
        icon: Sparkles,
        label: { en: toolName, zh: toolName },
        color: 'gray',
      };
  }
}

const COLOR_CLASSES: Record<string, string> = {
  emerald:
    'border-emerald-200/70 dark:border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-500/10',
  sky:
    'border-sky-200/70 dark:border-sky-500/30 bg-sky-50/60 dark:bg-sky-500/10',
  amber:
    'border-amber-200/70 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/10',
  gray:
    'border-gray-200/70 dark:border-white/10 bg-gray-50/60 dark:bg-white/5',
};

const ICON_COLOR: Record<string, string> = {
  emerald: 'text-emerald-600 dark:text-emerald-400',
  sky: 'text-sky-600 dark:text-sky-400',
  amber: 'text-amber-600 dark:text-amber-400',
  gray: 'text-gray-500 dark:text-gray-400',
};

interface AgentStepTrailProps {
  steps: AgentStep[];
  language: 'en' | 'zh';
  isRunning?: boolean;
}

export function AgentStepTrail({
  steps,
  language,
  isRunning,
}: AgentStepTrailProps) {
  if (steps.length === 0 && !isRunning) return null;

  return (
    <div className="my-3 space-y-2">
      {isRunning && steps.length === 0 && (
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>{language === 'en' ? 'Agent is thinking…' : 'Agent 思考緊…'}</span>
        </div>
      )}

      {steps.map((step) => (
        <AgentStepCard key={step.id} step={step} language={language} />
      ))}

      {isRunning && steps.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 pl-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>{language === 'en' ? 'Continuing…' : '繼續中…'}</span>
        </div>
      )}
    </div>
  );
}

function AgentStepCard({
  step,
  language,
}: {
  step: AgentStep;
  language: 'en' | 'zh';
}) {
  const meta = toolMeta(step.toolName);
  const Icon = meta.icon;
  const colorWrap = COLOR_CLASSES[meta.color] || COLOR_CLASSES.gray;
  const colorIcon = ICON_COLOR[meta.color] || ICON_COLOR.gray;

  // PDF result: render special download card
  // Both flows produce a downloadable PDF:
  //   - generate_pdf      (one-shot, small PDFs)
  //   - pdf_render_draft  (incremental flow for large mock papers)
  if (
    (step.toolName === 'generate_pdf' || step.toolName === 'pdf_render_draft') &&
    step.status === 'done' &&
    isPdfDisplay(step.display)
  ) {
    return (
      <PdfDownloadCard pdf={step.display} language={language} />
    );
  }

  return (
    <div
      className={`rounded-xl border ${colorWrap} px-3 py-2.5 text-sm transition-all`}
    >
      <div className="flex items-start gap-2.5">
        <div className={`mt-0.5 ${colorIcon}`}>
          {step.status === 'running' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : step.status === 'error' ? (
            <AlertCircle className="h-4 w-4 text-red-500" />
          ) : (
            <Icon className="h-4 w-4" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px] font-semibold text-gray-800 dark:text-gray-200">
              {language === 'en' ? meta.label.en : meta.label.zh}
            </span>
            {step.args && typeof step.args.query === 'string' && (
              <span className="text-[11px] text-gray-500 dark:text-gray-400 font-mono truncate max-w-[360px]">
                "{String(step.args.query)}"
              </span>
            )}
            {step.args && typeof step.args.title === 'string' && (
              <span className="text-[11px] text-gray-500 dark:text-gray-400 truncate max-w-[360px]">
                {String(step.args.title)}
              </span>
            )}
            {step.status === 'done' && (
              <CheckCircle2 className="h-3 w-3 text-emerald-500 ml-auto shrink-0" />
            )}
          </div>
          {step.summary && (
            <div className="mt-1 text-[11px] text-gray-600 dark:text-gray-400 leading-snug">
              {step.summary}
            </div>
          )}

          {/* Course-search result preview */}
          {step.status === 'done' &&
            step.toolName === 'search_course_content' &&
            isSearchDisplay(step.display) &&
            step.display.results.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {step.display.results.slice(0, 4).map((r, i) => (
                  <li
                    key={i}
                    className="text-[11px] text-gray-600 dark:text-gray-400 truncate"
                  >
                    <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                      {r.source}
                    </span>{' '}
                    · {r.point}
                  </li>
                ))}
                {step.display.results.length > 4 && (
                  <li className="text-[11px] text-gray-500">
                    +{step.display.results.length - 4}{' '}
                    {language === 'en' ? 'more' : '個'}
                  </li>
                )}
              </ul>
            )}

          {/* Web-search source preview */}
          {step.status === 'done' &&
            step.toolName === 'web_search' &&
            isWebDisplay(step.display) &&
            step.display.sources.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {step.display.sources.slice(0, 3).map((s, i) => (
                  <li key={i} className="text-[11px] truncate">
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-700 dark:text-sky-400 hover:underline"
                    >
                      {s.title || s.url}
                    </a>
                  </li>
                ))}
              </ul>
            )}
        </div>
      </div>
    </div>
  );
}

function PdfDownloadCard({
  pdf,
  language,
}: {
  pdf: PdfDisplay;
  language: 'en' | 'zh';
}) {
  return (
    <div className="rounded-xl border border-amber-200/80 dark:border-amber-500/30 bg-gradient-to-br from-amber-50 to-orange-50/60 dark:from-amber-500/10 dark:to-orange-500/5 p-3 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="shrink-0 h-12 w-12 rounded-xl bg-amber-500/15 dark:bg-amber-500/20 flex items-center justify-center border border-amber-300/50 dark:border-amber-500/30">
          <FileText className="h-6 w-6 text-amber-700 dark:text-amber-300" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
            {pdf.title}
          </div>
          <div className="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5">
            {pdf.filename} · {pdf.pages}{' '}
            {language === 'en' ? 'page' : '頁'}
            {pdf.pages !== 1 && language === 'en' ? 's' : ''} · {pdf.sizeKb} KB
          </div>
        </div>
        <a
          href={pdf.url}
          download={pdf.filename}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium transition-colors shadow-sm"
        >
          <Download className="h-3.5 w-3.5" />
          {language === 'en' ? 'Download' : '下載'}
        </a>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <a
          href={pdf.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-amber-700 dark:text-amber-400 hover:underline"
        >
          {language === 'en' ? 'Open in new tab →' : '開新分頁預覽 →'}
        </a>
      </div>
    </div>
  );
}
