/**
 * Shared helpers for where the agent stores generated PDFs and how the
 * client URL for a given file is constructed.
 *
 * Why this exists:
 *   The deployment target (Replit Autoscale) has an *ephemeral* container
 *   filesystem. Anything we write to `public/` at runtime is NOT served
 *   by Next.js in production — `public/` files are only treated as
 *   static assets if they existed at build time. As a result, before
 *   this helper, every PDF the agent generated in production responded
 *   with 404 when the user clicked Download / Open.
 *
 * Strategy:
 *   - In *development* keep using `public/agent-pdfs/` so the file is
 *     also browsable directly via the dev server (handy for debugging).
 *   - In *production* write to `/tmp/agent-pdfs/`, the only reliably
 *     writable location on Autoscale. Serve files back through the
 *     `/api/agent/pdf/[filename]` route which streams from disk.
 *   - In BOTH environments the public URL is `/api/agent/pdf/<file>`
 *     so the client never has to know which storage backend is in use.
 *
 * Operators can override the directory with `AGENT_PDF_DIR` (e.g. to
 * point at an attached persistent volume on a Reserved VM deploy).
 */

import path from 'node:path';

export function getAgentPdfDir(): string {
  if (process.env.AGENT_PDF_DIR) return process.env.AGENT_PDF_DIR;
  if (process.env.NODE_ENV === 'production') {
    return '/tmp/agent-pdfs';
  }
  return path.join(process.cwd(), 'public', 'agent-pdfs');
}

export function getAgentPdfUrl(filename: string): string {
  // Encode just the filename component — the route segment uses a
  // dynamic `[filename]` so spaces / unicode in slugs need escaping.
  return `/api/agent/pdf/${encodeURIComponent(filename)}`;
}
