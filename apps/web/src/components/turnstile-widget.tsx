/**
 * FILE PURPOSE: Cloudflare Turnstile invisible widget for bot protection
 *
 * WHY: Playbook §18 Denial-of-Wallet [HARD GATE]:
 *      "Bot detection: Turnstile/reCAPTCHA on chat endpoints."
 * HOW: Loads Turnstile script, runs invisible challenge, passes token
 *      to parent via onVerify callback. Token sent as x-turnstile-token header.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-02-28
 */

'use client';

import { useEffect, useRef, useCallback } from 'react';

interface TurnstileWidgetProps {
  siteKey?: string;
  onVerify: (token: string) => void;
  onError?: () => void;
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          'error-callback': () => void;
          size: string;
        },
      ) => string;
      reset: (widgetId: string) => void;
    };
  }
}

export function TurnstileWidget({
  siteKey,
  onVerify,
  onError,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const key = siteKey ?? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

  const handleError = useCallback(() => {
    onError?.();
  }, [onError]);

  useEffect(() => {
    if (!key || typeof window === 'undefined') return;

    // Load Turnstile script if not already present
    const scriptId = 'cf-turnstile-script';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      script.async = true;
      document.head.appendChild(script);
    }

    // Render widget once script is loaded
    const renderWidget = () => {
      if (!window.turnstile || !containerRef.current) return;
      if (widgetIdRef.current) return; // Already rendered

      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: key,
        callback: onVerify,
        'error-callback': handleError,
        size: 'invisible',
      });
    };

    // Poll for script load (simple approach for invisible widget)
    const interval = setInterval(() => {
      if (window.turnstile) {
        renderWidget();
        clearInterval(interval);
      }
    }, 100);

    return () => {
      clearInterval(interval);
    };
  }, [key, onVerify, handleError]);

  if (!key) return null;

  return <div ref={containerRef} />;
}
