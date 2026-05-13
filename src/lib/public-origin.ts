/**
 * Resolve the trusted public origin (scheme + host) at which this app
 * is reachable from a real browser.
 *
 * NEVER derive this from request headers (`Host`, `X-Forwarded-Host`)
 * for security-sensitive purposes such as building magic-link URLs or
 * auth redirects — those headers are attacker-controllable and would
 * let an attacker poison sign-in emails to point at their domain.
 *
 * Resolution order:
 *   1. `APP_PUBLIC_URL` — explicit override (e.g. for staging or a
 *      custom domain).
 *   2. `REPLIT_DOMAINS` — Replit-managed deployment domains
 *      (comma-separated). The first entry is used.
 *   3. `REPLIT_DEV_DOMAIN` — Replit dev preview domain.
 *   4. Throws — we refuse to silently fall back to a request-derived
 *      origin in security-sensitive code paths.
 */
export function getPublicOrigin(): string {
  const explicit = process.env.APP_PUBLIC_URL?.trim();
  if (explicit) return stripTrailingSlash(explicit);

  const replitDomains = process.env.REPLIT_DOMAINS?.split(',')
    .map((d) => d.trim())
    .filter(Boolean);
  if (replitDomains && replitDomains.length > 0) {
    return `https://${replitDomains[0]}`;
  }

  const devDomain = process.env.REPLIT_DEV_DOMAIN?.trim();
  if (devDomain) return `https://${devDomain}`;

  throw new Error(
    'Cannot determine public origin: set APP_PUBLIC_URL, or run on Replit (REPLIT_DOMAINS / REPLIT_DEV_DOMAIN auto-set).',
  );
}

function stripTrailingSlash(s: string): string {
  return s.endsWith('/') ? s.slice(0, -1) : s;
}
