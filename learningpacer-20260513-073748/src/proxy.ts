import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Edge proxy (Next.js 16's renamed middleware).
 *
 * The app supports **guest mode** — anonymous users can browse and
 * chat. Sign-in is optional and only unlocks per-account persistence.
 * So we deliberately do NOT gate page routes here.
 *
 * Two responsibilities:
 *
 *  1. **Magic-link rescue.** Supabase occasionally redirects the user
 *     to the project's Site URL (`/`) with `?code=…` / `?error=…`
 *     instead of the `emailRedirectTo` we pass at sign-in time. We
 *     forward those to `/auth/callback` so the existing exchange
 *     handler can finish the sign-in.
 *
 *  2. **Session refresh + signed-in bounce.** On every request we
 *     touch `supabase.auth.getUser()` so the SSR cookies stay fresh
 *     and server components see an up-to-date user. As a small UX
 *     win, an already-signed-in user who lands on `/login` gets
 *     bounced to `/`.
 */

export async function proxy(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // ── 1. Magic-link rescue ────────────────────────────────────────
  if (
    pathname === '/' &&
    (searchParams.has('code') ||
      searchParams.has('error_code') ||
      searchParams.has('error'))
  ) {
    const url = req.nextUrl.clone();
    url.pathname = '/auth/callback';
    return NextResponse.redirect(url);
  }

  // ── 2. Session refresh + signed-in bounce ───────────────────────
  let res = NextResponse.next({ request: req });

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !anonKey) {
    console.warn('[proxy] Supabase env not set, skipping session refresh');
    return res;
  }

  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          req.cookies.set(name, value),
        );
        res = NextResponse.next({ request: req });
        cookiesToSet.forEach(({ name, value, options }) =>
          res.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Already signed in? Bounce away from the login page so users don't
  // get a confusing "sign in again" form. Preserve any cookies the
  // session refresh just wrote (otherwise refreshed tokens are lost).
  if (user && pathname === '/login') {
    const home = req.nextUrl.clone();
    home.pathname = '/';
    home.search = '';
    const r = NextResponse.redirect(home);
    res.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  }

  return res;
}

export const config = {
  matcher: [
    /*
     * Match every path EXCEPT:
     *   - /api/*           (route handlers manage their own auth)
     *   - /_next/static/*  (build assets)
     *   - /_next/image     (next/image optimizer)
     *   - common static files (favicon, logo, robots, sitemap)
     *   - any path with a file extension
     */
    '/((?!api|_next/static|_next/image|favicon\\.ico|logo\\.svg|robots\\.txt|sitemap\\.xml|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|woff|woff2|ttf|otf|map)).*)',
  ],
};
