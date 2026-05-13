import { NextRequest, NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getPublicOrigin } from '@/lib/public-origin';

/**
 * Magic-link callback handler.
 *
 * Supports BOTH supported Supabase email-link flows so sign-in works
 * even when the user opens the email on a different device than the
 * one they requested it from:
 *
 *   1. PKCE / `?code=...` flow — the default for `signInWithOtp` when
 *      using @supabase/ssr's createBrowserClient. Requires the
 *      original browser's cookie (PKCE verifier). Cross-device →
 *      "PKCE code verifier not found in storage" error.
 *
 *   2. `?token_hash=...&type=...` flow — the SSR-friendly flow.
 *      Stateless: no client-side verifier needed. Works cross-device.
 *      To use this flow, the Supabase Dashboard email template should
 *      link to `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash
 *      }}&type=magiclink&next=/`.
 *
 * If neither parameter is present we fall through to a redirect with
 * a descriptive error rather than silently 200.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const errorParam = url.searchParams.get('error');
  const errorDescription = url.searchParams.get('error_description');

  const rawNext = url.searchParams.get('next') || '/chat';
  // Only allow same-origin relative paths to prevent open-redirect.
  const next =
    rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/chat';

  // SECURITY: resolve from trusted env, not request headers, to prevent
  // open-redirect / phishing via spoofed Host / X-Forwarded-Host. We
  // refuse to fall back to `url.origin` (which is request-derived)
  // because that would reintroduce the host-header trust issue.
  let publicOrigin: string;
  try {
    publicOrigin = getPublicOrigin();
  } catch (e) {
    console.error('[auth/callback] public origin unresolved:', e);
    return new NextResponse(
      'Server misconfiguration: public origin not resolvable.',
      { status: 503 },
    );
  }

  const fail = (message: string) => {
    const errUrl = new URL('/login', publicOrigin);
    errUrl.searchParams.set('error', message);
    return NextResponse.redirect(errUrl);
  };

  // Supabase short-circuited with its own error (expired/invalid link).
  if (errorParam) {
    return fail(errorDescription || errorParam);
  }

  const supabase = await getSupabaseServer();

  // ── Flow 2: token_hash (cross-device safe) ────────────────────────
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (error) return fail(error.message);
    return NextResponse.redirect(new URL(next, publicOrigin));
  }

  // ── Flow 1: PKCE code (same-device only) ──────────────────────────
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      // The classic "different browser/device" failure. Give the user
      // an actionable message instead of the raw SDK error.
      const friendly = /code verifier|pkce/i.test(error.message)
        ? 'This sign-in link was opened in a different browser than the one you requested it from. Please request a new link and click it from the same browser.'
        : error.message;
      return fail(friendly);
    }
    return NextResponse.redirect(new URL(next, publicOrigin));
  }

  // Neither flow's parameter was present.
  return fail('Missing authentication code. Please request a new sign-in link.');
}
