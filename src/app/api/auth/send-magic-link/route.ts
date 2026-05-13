import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getPublicOrigin } from '@/lib/public-origin';

/**
 * POST /api/auth/send-magic-link
 * Body: { email: string }
 *
 * Generates a magic-link token via the Supabase admin API (no email
 * sent by Supabase) and dispatches it through Resend instead. This
 * gives us:
 *   - No Supabase free-tier email rate limit (3-4/hour → unusable)
 *   - Branded email content we control
 *   - Cross-device safe (token_hash flow, no PKCE cookie required)
 */

// Simple in-memory throttle so a single email can't be spammed faster
// than once every 30s (per server instance).
const lastSent = new Map<string, number>();
const THROTTLE_MS = 30_000;

export async function POST(req: NextRequest) {
  let body: { email?: unknown; next?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const rawEmail = typeof body.email === 'string' ? body.email.trim() : '';
  // Minimal email shape check — Supabase will validate properly.
  if (!rawEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rawEmail)) {
    return NextResponse.json(
      { error: 'Please enter a valid email address.' },
      { status: 400 },
    );
  }
  const email = rawEmail.toLowerCase();

  // Sanitize `next`: only same-origin relative paths allowed, defaults
  // to `/chat` (the chat app — `/` is now the marketing landing page).
  // Rejects scheme-relative `//evil.com` and absolute URLs.
  const rawNext = typeof body.next === 'string' ? body.next : '';
  const next =
    rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/chat';

  const now = Date.now();
  const last = lastSent.get(email);
  if (last && now - last < THROTTLE_MS) {
    const wait = Math.ceil((THROTTLE_MS - (now - last)) / 1000);
    return NextResponse.json(
      { error: `Please wait ${wait}s before requesting another link.` },
      { status: 429 },
    );
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.error('[send-magic-link] RESEND_API_KEY is not set');
    return NextResponse.json(
      { error: 'Email service is not configured. Contact the administrator.' },
      { status: 500 },
    );
  }

  // SECURITY: never derive this from request headers — host-header
  // poisoning would let an attacker rewrite the link in the email.
  let origin: string;
  try {
    origin = getPublicOrigin();
  } catch (e) {
    console.error('[send-magic-link] public origin unresolved:', e);
    return NextResponse.json(
      { error: 'Server is misconfigured. Contact the administrator.' },
      { status: 500 },
    );
  }

  let actionLink: string;
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: {
        redirectTo: `${origin}/auth/callback`,
      },
    });
    if (error || !data?.properties) {
      console.error(
        '[send-magic-link] generateLink failed:',
        error?.message || 'no properties',
      );
      return NextResponse.json(
        { error: 'Could not generate sign-in link. Please try again.' },
        { status: 500 },
      );
    }

    // Prefer the SSR-friendly token_hash URL — works cross-device, no
    // PKCE cookie needed. Falls back to the default action_link.
    const { hashed_token, action_link } = data.properties as {
      hashed_token?: string;
      action_link?: string;
    };
    actionLink = hashed_token
      ? `${origin}/auth/callback?token_hash=${hashed_token}&type=magiclink&next=${encodeURIComponent(next)}`
      : (action_link as string);
  } catch (e) {
    console.error(
      '[send-magic-link] admin error:',
      e instanceof Error ? e.message : e,
    );
    return NextResponse.json(
      { error: 'Could not generate sign-in link. Please try again.' },
      { status: 500 },
    );
  }

  const resend = new Resend(resendKey);
  const fromAddress =
    process.env.RESEND_FROM_EMAIL || 'LearningPacer <onboarding@resend.dev>';

  try {
    const { error } = await resend.emails.send({
      from: fromAddress,
      to: email,
      subject: 'Your LearningPacer sign-in link',
      html: renderEmail(actionLink),
      text:
        `Sign in to LearningPacer\n\n` +
        `Click this link to sign in (valid for 60 minutes, single use):\n${actionLink}\n\n` +
        `If you didn't request this, ignore this email.`,
    });
    if (error) {
      console.error('[send-magic-link] resend error:', error);
      return NextResponse.json(
        { error: 'Failed to send email — please try again.' },
        { status: 502 },
      );
    }
  } catch (e) {
    console.error(
      '[send-magic-link] resend threw:',
      e instanceof Error ? e.message : e,
    );
    return NextResponse.json(
      { error: 'Failed to send email — please try again.' },
      { status: 502 },
    );
  }

  lastSent.set(email, now);
  return NextResponse.json({ ok: true });
}

function renderEmail(link: string): string {
  const safe = escapeHtml(link);
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;padding:32px;">
        <tr><td>
          <h1 style="margin:0 0 8px 0;font-size:22px;font-weight:600;color:#0f172a;">Sign in to LearningPacer</h1>
          <p style="margin:0 0 20px 0;color:#475569;font-size:14px;">ELEC3120 Virtual TA · HKUST</p>
          <p style="margin:0 0 24px 0;color:#334155;font-size:15px;line-height:1.55;">
            Click the button below to sign in. The link expires in 60 minutes and can only be used once.
          </p>
          <p style="margin:0 0 24px 0;">
            <a href="${safe}"
               style="display:inline-block;background:#10b981;color:#ffffff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">
              Sign in to LearningPacer
            </a>
          </p>
          <p style="margin:0 0 8px 0;color:#64748b;font-size:13px;">Or copy and paste this URL into your browser:</p>
          <p style="margin:0 0 24px 0;color:#475569;font-size:12px;word-break:break-all;">
            <a href="${safe}" style="color:#10b981;text-decoration:none;">${safe}</a>
          </p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
          <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.5;">
            If you didn't request this email, you can safely ignore it.<br>
            LearningPacer · ELEC3120 Virtual TA · HKUST
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
