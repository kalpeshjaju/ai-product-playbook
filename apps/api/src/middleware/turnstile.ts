/**
 * FILE PURPOSE: Cloudflare Turnstile bot verification middleware
 *
 * WHY: Playbook §18 Denial-of-Wallet Prevention [HARD GATE]:
 *      "Bot detection: Turnstile/reCAPTCHA on chat endpoints."
 * HOW: Server-side token verification via Cloudflare siteverify API.
 *      Fail-open in dev, fail-closed in prod.
 *      Network failures to Cloudflare → log warning, fail-open.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-02-28
 */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstileToken(
  token: string,
  ip: string,
): Promise<boolean> {
  // Fail-open in development
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    process.stderr.write('WARN: TURNSTILE_SECRET_KEY not set — skipping verification\n');
    return true;
  }

  if (!token) {
    return false; // Fail-closed in prod: missing token
  }

  try {
    const response = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret,
        response: token,
        remoteip: ip,
      }),
    });

    const result = await response.json() as { success: boolean };
    return result.success;
  } catch {
    // Network failure to Cloudflare — fail-open to avoid blocking users
    process.stderr.write('WARN: Turnstile verification failed (network) — allowing request\n');
    return true;
  }
}
