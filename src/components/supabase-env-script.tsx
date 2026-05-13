/**
 * Server Component that injects SUPABASE_URL and SUPABASE_KEY into
 * `window` so the browser-side Supabase client can read them
 * without us having to expose them as `NEXT_PUBLIC_*` env vars.
 *
 * SAFETY: only the anon / publishable key is safe to expose to the
 * browser (RLS on the DB enforces auth). If SUPABASE_KEY is the
 * service-role key, exposing it would bypass RLS entirely. We
 * decode the JWT payload (or detect the new sb_secret_ prefix) and
 * throw at render time if the role is not `anon`, so the dev finds
 * out immediately instead of leaking the key to every browser.
 */

let cachedRoleCheck: { ok: true } | { ok: false; reason: string } | null = null;

function assertAnonKey(key: string): void {
  if (cachedRoleCheck) {
    if (cachedRoleCheck.ok) return;
    throw new Error(cachedRoleCheck.reason);
  }
  if (!key) {
    cachedRoleCheck = { ok: false, reason: 'SUPABASE_PUBLISHABLE_KEY is not set' };
    throw new Error(cachedRoleCheck.reason);
  }
  // New-format publishable key — always safe.
  if (key.startsWith('sb_publishable_')) {
    cachedRoleCheck = { ok: true };
    return;
  }
  // New-format secret key — never safe in the browser.
  if (key.startsWith('sb_secret_')) {
    cachedRoleCheck = {
      ok: false,
      reason:
        'SUPABASE_KEY looks like a secret (sb_secret_*) key. Refusing to inject into the browser. Use the publishable / anon key instead.',
    };
    throw new Error(cachedRoleCheck.reason);
  }
  // Legacy JWT format: decode the middle segment to read the role claim.
  const parts = key.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(
        Buffer.from(parts[1], 'base64').toString('utf8')
      );
      if (payload?.role === 'anon') {
        cachedRoleCheck = { ok: true };
        return;
      }
      cachedRoleCheck = {
        ok: false,
        reason: `SUPABASE_KEY has role="${payload?.role}". Only the anon key may be exposed to the browser.`,
      };
      throw new Error(cachedRoleCheck.reason);
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('SUPABASE_KEY')) throw e;
      cachedRoleCheck = {
        ok: false,
        reason: 'SUPABASE_KEY is not a decodable JWT and not a sb_publishable_ key',
      };
      throw new Error(cachedRoleCheck.reason);
    }
  }
  cachedRoleCheck = {
    ok: false,
    reason: 'SUPABASE_KEY is in an unrecognised format',
  };
  throw new Error(cachedRoleCheck.reason);
}

export function SupabaseEnvScript() {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || '';
  assertAnonKey(key);
  // JSON.stringify gives us a safe, properly-escaped string literal.
  const payload = `window.__SUPABASE_URL__=${JSON.stringify(url)};window.__SUPABASE_KEY__=${JSON.stringify(key)};`;
  return (
    <script
      // dangerouslySetInnerHTML is required: we need the values to
      // be available before React hydrates so getSupabaseBrowser()
      // works in the very first client render.
      dangerouslySetInnerHTML={{ __html: payload }}
    />
  );
}
