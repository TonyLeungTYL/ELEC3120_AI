import { getSupabaseServer } from '@/lib/supabase/server';

/**
 * Returns the Supabase user id for the current request, or null if
 * the caller is a guest. Use in API routes to scope DB reads/writes.
 *
 * - GET / list endpoints: pass null straight through and return
 *   an empty result so guests see "no personal data yet".
 * - POST / write endpoints: 401 when this is null so the client
 *   can prompt the user to sign in (the front-end already falls
 *   back to localStorage for guests).
 */
export async function getCurrentUserId(): Promise<string | null> {
  try {
    const supabase = await getSupabaseServer();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}
