'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LogIn, LogOut, User as UserIcon } from 'lucide-react';
import { getSupabaseBrowser } from '@/lib/supabase/browser';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Top-right user menu.
 *
 * Not signed in → shows a small "Sign in" link.
 * Signed in    → shows avatar + email dropdown with Sign out.
 *
 * Listens to Supabase auth state changes so the UI updates the
 * moment a magic-link callback completes (no full reload needed).
 */
export function UserMenu() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const supabase = getSupabaseBrowser();

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setEmail(data.user?.email ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setEmail(session?.user?.email ?? null);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    const supabase = getSupabaseBrowser();
    await supabase.auth.signOut();
    setEmail(null);
  }

  if (loading) {
    // Render a fixed-size placeholder so layout doesn't jump on hydration
    return <div className="h-8 w-8 rounded-full bg-muted/40 animate-pulse" />;
  }

  if (!email) {
    return (
      <Link
        href="/login"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-accent transition-colors"
      >
        <LogIn className="h-3.5 w-3.5" />
        Sign in
      </Link>
    );
  }

  // Build a friendly initial from the email
  const initial = email[0]?.toUpperCase() || 'U';
  const shortEmail =
    email.length > 22 ? `${email.slice(0, 20)}…` : email;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="inline-flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-accent transition-colors"
          aria-label="User menu"
        >
          <div className="h-7 w-7 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-semibold">
            {initial}
          </div>
          <span className="hidden md:inline text-sm text-muted-foreground">
            {shortEmail}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground font-normal">
              Signed in as
            </span>
            <span className="text-sm truncate">{email}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <UserIcon className="h-4 w-4 mr-2" />
          Profile (coming soon)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
          <LogOut className="h-4 w-4 mr-2" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
