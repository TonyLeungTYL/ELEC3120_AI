'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser-side Supabase client (singleton).
 *
 * The anon key is exposed to the client — Supabase RLS protects
 * actual data. We expose the URL + key via NEXT_PUBLIC_* injected
 * by the SupabaseEnvScript in layout.tsx so that secrets stay
 * server-side until explicitly forwarded.
 */
let _client: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowser() {
  if (_client) return _client;
  const w = window as unknown as {
    __SUPABASE_URL__?: string;
    __SUPABASE_KEY__?: string;
  };
  const url = w.__SUPABASE_URL__;
  const key = w.__SUPABASE_KEY__;
  if (!url || !key) {
    throw new Error(
      'Supabase env not injected — check <SupabaseEnvScript /> in layout.tsx',
    );
  }
  _client = createBrowserClient(url, key);
  return _client;
}
