/**
 * GET /api/agent/pdf/[filename]
 *
 * Streams a previously generated agent PDF back to the client. We
 * cannot serve these files via Next.js's `public/` static handler in
 * production because Replit Autoscale deployments have an ephemeral
 * filesystem and `public/` files are only treated as static assets if
 * they existed at build time. See `src/lib/agent/pdf-storage.ts`.
 *
 * Security:
 *   - The `[filename]` segment is validated to be a single PDF file
 *     name (no slashes, no `..`) before touching disk to prevent path
 *     traversal attacks (e.g. `/api/agent/pdf/..%2F..%2Fetc%2Fpasswd`).
 *   - 404 on miss; 400 on invalid name. Both are JSON to make the
 *     sidebar UI's error handling consistent.
 */

import { NextResponse } from 'next/server';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { getAgentPdfDir } from '@/lib/agent/pdf-storage';

const FILENAME_RE = /^[A-Za-z0-9._\-\u4e00-\u9fff]+\.pdf$/i;

export async function GET(
  _req: Request,
  context: { params: Promise<{ filename: string }> },
): Promise<NextResponse | Response> {
  const { filename: raw } = await context.params;
  // `decodeURIComponent` throws `URIError` on malformed escape sequences
  // (e.g. `/api/agent/pdf/foo%2`). Catch so we return a clean 400
  // instead of crashing into a 500.
  let filename: string;
  try {
    filename = decodeURIComponent(raw ?? '');
  } catch {
    return NextResponse.json(
      { error: 'invalid filename' },
      { status: 400 },
    );
  }

  if (!filename || !FILENAME_RE.test(filename)) {
    return NextResponse.json(
      { error: 'invalid filename' },
      { status: 400 },
    );
  }

  const dir = getAgentPdfDir();
  const full = path.join(dir, filename);

  // Defence in depth — even with the regex above, double-check that the
  // resolved path is still inside the configured directory.
  if (!path.resolve(full).startsWith(path.resolve(dir) + path.sep)) {
    return NextResponse.json({ error: 'invalid path' }, { status: 400 });
  }

  let buf: Buffer;
  let size: number;
  try {
    const s = await stat(full);
    if (!s.isFile()) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    size = s.size;
    buf = await readFile(full);
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(size),
      // `inline` lets the browser preview in a tab; the sidebar's
      // explicit "Download" button uses `download` attribute on the
      // anchor to force a save dialog regardless.
      'Content-Disposition': `inline; filename="${filename}"`,
      // Generated content keyed by unique filename, so cache hard.
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
