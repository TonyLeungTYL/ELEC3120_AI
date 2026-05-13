/**
 * GET /api/agent/pdfs
 *
 * Lists every PDF the agent has generated and saved into
 * `public/agent-pdfs/`. Used by the sidebar "PDFs" panel so students
 * can find documents from earlier in the session (or earlier sessions)
 * without having to scroll back through chat history.
 *
 * Returns:
 *   { items: Array<{ filename, url, title, sizeKb, mtime }> }
 *
 * Filename convention is `<slug>-<8 hex chars>.pdf` (see
 * `src/lib/agent/pdf-generator.tsx`). We strip the `-<8hex>.pdf`
 * suffix and convert dashes to spaces to recover a readable title.
 */

import { NextResponse } from 'next/server';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { getAgentPdfDir, getAgentPdfUrl } from '@/lib/agent/pdf-storage';

interface AgentPdfItem {
  filename: string;
  url: string;
  title: string;
  sizeKb: number;
  mtime: number;
}

const ID_SUFFIX_RE = /-[0-9a-f]{8}$/i;

function slugToTitle(filenameWithoutExt: string): string {
  // Strip the trailing `-<8 hex>` id, then turn dashes into spaces
  // and capitalise the first letter of each word.
  const slug = filenameWithoutExt.replace(ID_SUFFIX_RE, '');
  if (!slug) return filenameWithoutExt;
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export async function GET(): Promise<NextResponse> {
  const dir = getAgentPdfDir();

  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return NextResponse.json({ items: [] });
  }

  const pdfs = entries.filter((f) => f.toLowerCase().endsWith('.pdf'));

  // `stat` can race with the prune helper in `tools.ts` deleting old
  // files between our `readdir` and `stat`. Tolerate per-file failures
  // by skipping that entry rather than failing the whole listing.
  const settled = await Promise.all(
    pdfs.map(async (filename): Promise<AgentPdfItem | null> => {
      try {
        const full = path.join(dir, filename);
        const s = await stat(full);
        const base = filename.replace(/\.pdf$/i, '');
        return {
          filename,
          url: getAgentPdfUrl(filename),
          title: slugToTitle(base),
          sizeKb: Math.round(s.size / 1024),
          mtime: s.mtimeMs,
        };
      } catch {
        return null;
      }
    }),
  );
  const items: AgentPdfItem[] = settled.filter(
    (x): x is AgentPdfItem => x !== null,
  );

  // Newest first.
  items.sort((a, b) => b.mtime - a.mtime);

  return NextResponse.json(
    { items },
    {
      headers: {
        // Always-fresh — listing is cheap and a stale list is annoying.
        'Cache-Control': 'no-store',
      },
    },
  );
}
