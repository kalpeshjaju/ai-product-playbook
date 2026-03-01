/**
 * FILE PURPOSE: API utility for authenticated server-component fetches
 *
 * WHY: Server components need to send API_INTERNAL_KEY to the API server.
 *      Centralizes the header construction and API URL resolution.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';

/** Headers for server-component API calls. Includes API_INTERNAL_KEY when set. */
export function getApiHeaders(): HeadersInit {
  const headers: Record<string, string> = {};
  const key = process.env.API_INTERNAL_KEY;
  if (key) {
    headers['x-api-key'] = key;
  }
  return headers;
}
