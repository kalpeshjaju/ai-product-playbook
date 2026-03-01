/**
 * FILE PURPOSE: k6 load testing script for API server
 *
 * WHY: Validate API performance under load — catch latency regressions,
 *      verify rate limiting works, and establish baseline metrics.
 *
 * HOW: Three scenarios (smoke, load, stress) targeting key API endpoints.
 *      Run: k6 run tests/load/api-load.js
 *      With env: k6 run -e API_URL=https://api.example.com tests/load/api-load.js
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ─── Custom metrics ──────────────────────────────────────────────────────────

const errorRate = new Rate('errors');
const healthLatency = new Trend('health_latency', true);
const entriesLatency = new Trend('entries_latency', true);
const documentsLatency = new Trend('documents_latency', true);
const promptsLatency = new Trend('prompts_latency', true);

// ─── Configuration ───────────────────────────────────────────────────────────

const API_URL = __ENV.API_URL || 'http://localhost:3002';
const API_KEY = __ENV.API_KEY || 'test-api-key';
const ADMIN_KEY = __ENV.ADMIN_KEY || 'test-admin-key';

const defaultHeaders = {
  'Content-Type': 'application/json',
  'x-api-key': API_KEY,
};

const adminHeaders = {
  ...defaultHeaders,
  'x-admin-key': ADMIN_KEY,
};

// ─── Scenarios ───────────────────────────────────────────────────────────────

export const options = {
  scenarios: {
    // Smoke: 1 VU, 30s — sanity check that nothing is broken
    smoke: {
      executor: 'constant-vus',
      vus: 1,
      duration: '30s',
      exec: 'smokeTest',
      tags: { scenario: 'smoke' },
    },

    // Load: ramp up to 20 VUs over 2 minutes, sustain, ramp down
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10 },  // ramp up
        { duration: '1m', target: 20 },   // sustain
        { duration: '30s', target: 0 },   // ramp down
      ],
      exec: 'loadTest',
      startTime: '35s', // start after smoke
      tags: { scenario: 'load' },
    },

    // Stress: burst to 50 VUs to find breaking point
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 50 },  // rapid ramp
        { duration: '30s', target: 50 },  // sustain at peak
        { duration: '20s', target: 0 },   // ramp down
      ],
      exec: 'stressTest',
      startTime: '165s', // start after load
      tags: { scenario: 'stress' },
    },
  },

  thresholds: {
    // Global: 95th percentile response time < 500ms
    http_req_duration: ['p(95)<500'],
    // Error rate < 5% (excluding expected 429s under stress)
    errors: ['rate<0.05'],
    // Health endpoint must always be fast
    health_latency: ['p(99)<200'],
    // Entries read should be fast
    entries_latency: ['p(95)<300'],
  },
};

// ─── Smoke test: hit every endpoint once ─────────────────────────────────────

export function smokeTest() {
  // Health
  const health = http.get(`${API_URL}/api/health`);
  healthLatency.add(health.timings.duration);
  check(health, {
    'health: status 200': (r) => r.status === 200,
    'health: body has status ok': (r) => JSON.parse(r.body).status === 'ok',
  }) || errorRate.add(1);

  // CORS preflight
  const cors = http.options(`${API_URL}/api/health`);
  check(cors, {
    'cors: status 204': (r) => r.status === 204,
  }) || errorRate.add(1);

  // Entries list (public)
  const entries = http.get(`${API_URL}/api/entries`, { headers: defaultHeaders });
  entriesLatency.add(entries.timings.duration);
  check(entries, {
    'entries: status 200': (r) => r.status === 200,
    'entries: returns array': (r) => Array.isArray(JSON.parse(r.body)),
  }) || errorRate.add(1);

  // Users list (public)
  const users = http.get(`${API_URL}/api/users`, { headers: defaultHeaders });
  check(users, {
    'users: status 200': (r) => r.status === 200,
  }) || errorRate.add(1);

  // Costs
  const costs = http.get(`${API_URL}/api/costs`, { headers: defaultHeaders });
  check(costs, {
    'costs: status 200': (r) => r.status === 200,
  }) || errorRate.add(1);

  // 404 for unknown route
  const notFound = http.get(`${API_URL}/api/nonexistent`, { headers: defaultHeaders });
  check(notFound, {
    'unknown route: 404': (r) => r.status === 404,
  }) || errorRate.add(1);

  sleep(1);
}

// ─── Load test: mix of read operations ───────────────────────────────────────

export function loadTest() {
  const roll = Math.random();

  if (roll < 0.3) {
    // Health check (30%)
    const r = http.get(`${API_URL}/api/health`);
    healthLatency.add(r.timings.duration);
    check(r, { 'load health: 200': (r) => r.status === 200 }) || errorRate.add(1);
  } else if (roll < 0.6) {
    // Entries list (30%)
    const r = http.get(`${API_URL}/api/entries`, { headers: defaultHeaders });
    entriesLatency.add(r.timings.duration);
    check(r, { 'load entries: 200': (r) => r.status === 200 }) || errorRate.add(1);
  } else if (roll < 0.8) {
    // Documents list (20%)
    const r = http.get(`${API_URL}/api/documents`, { headers: defaultHeaders });
    documentsLatency.add(r.timings.duration);
    check(r, { 'load documents: 200': (r) => r.status === 200 }) || errorRate.add(1);
  } else {
    // Prompt operations (20%)
    const r = http.get(`${API_URL}/api/prompts/nonexistent/active`, { headers: defaultHeaders });
    promptsLatency.add(r.timings.duration);
    check(r, { 'load prompts: 404 expected': (r) => r.status === 404 }) || errorRate.add(1);
  }

  sleep(0.5 + Math.random() * 0.5); // 0.5-1s think time
}

// ─── Stress test: rapid concurrent requests ──────────────────────────────────

export function stressTest() {
  // Rapid health check to verify server stays responsive under pressure
  const r = http.get(`${API_URL}/api/health`);
  healthLatency.add(r.timings.duration);

  // Under stress, 429 or 503 are acceptable (rate limiting / overload)
  const ok = r.status === 200 || r.status === 429 || r.status === 503;
  check(r, { 'stress: acceptable status': () => ok }) || errorRate.add(1);

  sleep(0.1); // minimal think time for stress
}
