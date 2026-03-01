/**
 * FILE PURPOSE: Cloudflare Turnstile bot verification middleware
 *
 * WHY: Playbook §18 Denial-of-Wallet Prevention [HARD GATE]:
 *      "Bot detection: Turnstile/reCAPTCHA on chat endpoints."
 * HOW: Server-side token verification via Cloudflare siteverify API.
 *      Fail-open in dev, fail-closed in prod.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
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
    // FAIL-CLOSED in production: missing secret key is a critical misconfiguration
    process.stderr.write('CRITICAL: TURNSTILE_SECRET_KEY not set in production — blocking request\n');
    return false;
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
    // FAIL-CLOSED in production: network failure to Cloudflare should not let unverified requests through
    process.stderr.write('WARN: Turnstile verification failed (network) — blocking request in production\n');
    return false;
  }
}
