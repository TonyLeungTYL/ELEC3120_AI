'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseBrowser } from '@/lib/supabase/browser';

function LoginForm() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'sending' }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });

  useEffect(() => {
    const err = searchParams.get('error');
    if (err) setStatus({ kind: 'error', message: err });
  }, [searchParams]);

  function safeNext(): string {
    const raw = searchParams.get('next') || '';
    return raw.startsWith('/') && !raw.startsWith('//') ? raw : '/chat';
  }

  async function handleGoogleSignIn() {
    setStatus({ kind: 'sending' });
    try {
      const supabase = getSupabaseBrowser();
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext())}`;
      // skipBrowserRedirect=true so we deterministically navigate ourselves
      // — avoids the "have to press twice" issue some iframe/proxied
      // setups hit when the SDK's internal redirect is swallowed.
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) throw error;
      if (!data?.url) throw new Error('No OAuth URL returned');
      window.location.assign(data.url);
    } catch (err) {
      setStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Google sign-in failed',
      });
    }
  }

  return (
    <div className="bg-card border border-border/60 rounded-2xl shadow-sm p-8">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Sign in to LearningPacer
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          ELEC3120 Virtual TA · HKUST
        </p>
      </div>

      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={status.kind === 'sending'}
        className="w-full inline-flex items-center justify-center gap-2.5 rounded-lg border border-input bg-background py-2.5 text-sm font-medium hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        aria-label="Continue with Google"
      >
        <GoogleLogo className="h-4 w-4" />
        {status.kind === 'sending' ? 'Redirecting…' : 'Continue with Google'}
      </button>

      {status.kind === 'error' ? (
        <p className="text-sm text-destructive text-center break-words mt-4">
          {status.message}
        </p>
      ) : null}

      <p className="text-xs text-muted-foreground text-center mt-6">
        Use your HKUST or Google account. No password needed.
      </p>
    </div>
  );
}

function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/30 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link
            href="/chat"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back to LearningPacer
          </Link>
        </div>

        <Suspense
          fallback={
            <div className="bg-card border border-border/60 rounded-2xl shadow-sm p-8 h-[260px]" />
          }
        >
          <LoginForm />
        </Suspense>

        <p className="text-xs text-center text-muted-foreground mt-6">
          You can also continue as a guest — your chats stay in this browser
          until you sign in.
        </p>
      </div>
    </div>
  );
}
