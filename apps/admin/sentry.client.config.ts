/**
 * FILE PURPOSE: Client-side Sentry initialization for admin panel.
 *
 * WHY: Captures frontend JS errors in admin panel (separate project from web).
 * HOW: Loaded automatically by @sentry/nextjs. No-op when DSN not set.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-02-28
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.2,
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0,
    sendDefaultPii: false,
  });
}
