/**
 * FILE PURPOSE: Global setup for contract tests — starts API server if not already running
 *
 * WHY: Contract tests need a live API server. In CI, GitHub Actions starts it
 *      externally. Locally, this setup starts it automatically so
 *      `npm run test:contract` is self-orchestrating.
 *
 * HOW: Checks if E2E_API_URL is already reachable. If not, spawns
 *      `node apps/api/dist/server.js` and waits for /api/health.
 *      Tears down the child process after all tests complete.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import { type ChildProcess, spawn } from 'node:child_process';
import { resolve } from 'node:path';

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3002';
const PORT = new URL(API_URL).port || '3002';
const HEALTH_URL = `${API_URL}/api/health`;
const STARTUP_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 500;

let serverProcess: ChildProcess | null = null;

/** Check if the API server is already reachable. */
async function isServerUp(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(HEALTH_URL, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

/** Wait for the server to become healthy. */
async function waitForHealth(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isServerUp()) return;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`API server did not become healthy within ${timeoutMs}ms at ${HEALTH_URL}`);
}

export async function setup(): Promise<void> {
  // If server is already running (CI or manual), skip startup
  if (await isServerUp()) {
    process.stdout.write(`[contract-tests] API server already running at ${API_URL}\n`);
    return;
  }

  // Spawn the API server
  const serverPath = resolve(process.cwd(), 'apps/api/dist/server.js');
  process.stdout.write(`[contract-tests] Starting API server: node ${serverPath}\n`);

  // Use provided API_KEYS or generate a deterministic test key so auth doesn't reject
  const testApiKey = 'e2e-test-key-do-not-use-in-production';
  const apiKeys = process.env.API_KEYS || testApiKey;

  serverProcess = spawn('node', [serverPath], {
    env: {
      ...process.env,
      PORT,
      NODE_ENV: 'test',
      AUTH_MODE: process.env.AUTH_MODE ?? 'open',
      API_KEYS: apiKeys,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stdout?.on('data', (data: Buffer) => {
    process.stdout.write(`[api] ${data.toString()}`);
  });

  serverProcess.stderr?.on('data', (data: Buffer) => {
    process.stderr.write(`[api] ${data.toString()}`);
  });

  serverProcess.on('exit', (code) => {
    if (code !== null && code !== 0) {
      process.stderr.write(`[contract-tests] API server exited with code ${code}\n`);
    }
  });

  await waitForHealth(STARTUP_TIMEOUT_MS);
  process.stdout.write(`[contract-tests] API server healthy at ${API_URL}\n`);
}

export async function teardown(): Promise<void> {
  if (serverProcess) {
    process.stdout.write('[contract-tests] Stopping API server\n');
    serverProcess.kill('SIGTERM');

    // Give it 5s to shut down gracefully
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        serverProcess?.kill('SIGKILL');
        resolve();
      }, 5000);

      serverProcess!.on('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });

    serverProcess = null;
  }
}
