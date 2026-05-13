import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Server-side Supabase client.
 *
 * Reads/writes the auth session via Next.js cookies so that
 * Server Components, Route Handlers and Server Actions all see
 * the same logged-in user.
 *
 * Usage (Server Component / Route Handler):
 *   const supabase = await getSupabaseServer();
 *   const { data: { user } } = await supabase.auth.getUser();
 */
export async function getSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.SUPABASE_URL!,
    // Use the publishable (anon) key here — this client follows the
    // logged-in user and must respect Row-Level Security. The
    // service-role key (SUPABASE_KEY) bypasses RLS and should only
    // ever be used in clearly-marked server-only admin code paths.
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll is called from a Server Component — Next.js
            // disallows mutating cookies there. The middleware /
            // route handler that initiated this request will have
            // already refreshed the session, so this is safe to
            // ignore.
          }
        },
      },
    },
  );
}
