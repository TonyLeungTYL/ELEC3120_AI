import { createClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase admin client.
 *
 * Uses the service-role key (`SUPABASE_KEY`) which BYPASSES Row-Level
 * Security and can mint magic-link tokens via `auth.admin.generateLink`.
 *
 * NEVER import this from client code or pass its results to the
 * browser. The service-role key in the wrong place would expose every
 * row in every table.
 */
let _admin: ReturnType<typeof createClient> | null = null;

export function getSupabaseAdmin() {
  if (_admin) return _admin;
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_KEY (service role) must be set to use the admin client',
    );
  }
  _admin = createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return _admin;
}
