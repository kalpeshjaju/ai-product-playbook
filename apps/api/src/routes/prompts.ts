/**
 * FILE PURPOSE: Prompt versioning API routes
 *
 * WHY: Playbook §20 Prompt Versioning + §22 Prompt A/B Testing.
 *      "prompt_versions table + batch promotion" (MOAT-STACK-SETUP §2).
 * HOW: CRUD + weighted traffic allocation for A/B testing.
 *      Promotion flow: 0% → 10% → 50% → 100% (§22).
 *
 * Routes:
 *   GET  /api/prompts/:name/active   — get active version (weighted random)
 *   POST /api/prompts                — create new version (starts at 0% traffic)
 *   PATCH /api/prompts/:id/traffic   — update traffic allocation
 *   POST /api/prompts/:name/promote  — automated promotion ladder
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-02-28
 */

import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { and, eq, gt, sql, sum } from 'drizzle-orm';
import { createUserContext } from '@playbook/shared-llm';
import { db } from '../db/index.js';
import { promptVersions } from '../db/schema.js';
import { resolvePromptWithAB } from '../middleware/prompt-ab.js';

type BodyParser = (req: IncomingMessage) => Promise<Record<string, unknown>>;

/** Weighted random selection from active prompt versions. */
function weightedRandom<T extends { activePct: number }>(items: T[]): T | undefined {
  const total = items.reduce((acc, item) => acc + item.activePct, 0);
  if (total === 0) return items[0];

  let random = Math.random() * total;
  for (const item of items) {
    random -= item.activePct;
    if (random <= 0) return item;
  }
  return items[items.length - 1];
}

/** Derive next semver minor: v1.0.0 → v1.1.0 */
function nextMinorVersion(latest: string | undefined): string {
  if (!latest) return 'v1.0.0';
  const match = latest.match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return 'v1.0.0';
  return `v${match[1]}.${parseInt(match[2]!, 10) + 1}.0`;
}

export async function handlePromptRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: string,
  parseBody: BodyParser,
): Promise<void> {
  try {
  // GET /api/prompts/:name/active
  const activeMatch = url.match(/^\/api\/prompts\/([^/]+)\/active$/);
  if (activeMatch && req.method === 'GET') {
    const promptName = decodeURIComponent(activeMatch[1]!);
    const rows = await db
      .select()
      .from(promptVersions)
      .where(and(eq(promptVersions.promptName, promptName), gt(promptVersions.activePct, 0)));

    if (rows.length === 0) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: `No active versions for prompt: ${promptName}` }));
      return;
    }

    const userCtx = createUserContext(req);
    const abSelection = await resolvePromptWithAB(userCtx.userId, promptName, rows);
    const selected = abSelection
      ? rows.find((row) => row.version === abSelection.version)
      : weightedRandom(rows);

    if (!selected) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: `No resolvable prompt version for: ${promptName}` }));
      return;
    }

    res.end(JSON.stringify({
      prompt_name: selected.promptName,
      version: selected.version,
      content: selected.content,
      content_hash: selected.contentHash,
      eval_score: selected.evalScore,
      active_pct: selected.activePct,
      variant: abSelection?.variant ?? 'weighted',
      source: abSelection?.source ?? 'weighted-random',
    }));
    return;
  }

  // POST /api/prompts
  if (url === '/api/prompts' && req.method === 'POST') {
    const body = await parseBody(req);
    const promptName = body.prompt_name as string | undefined;
    const content = body.content as string | undefined;
    const author = body.author as string | undefined;

    if (!promptName || !content || !author) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Required: prompt_name, content, author' }));
      return;
    }

    // Get latest version for auto-increment
    const latest = await db
      .select({ version: promptVersions.version })
      .from(promptVersions)
      .where(eq(promptVersions.promptName, promptName))
      .orderBy(sql`${promptVersions.createdAt} DESC`)
      .limit(1);

    const version = nextMinorVersion(latest[0]?.version);
    const contentHash = createHash('sha256').update(content).digest('hex');

    const [created] = await db
      .insert(promptVersions)
      .values({
        promptName,
        version,
        content,
        contentHash,
        activePct: 0, // Safe default — no traffic until promoted
        author,
      })
      .returning();

    res.statusCode = 201;
    res.end(JSON.stringify(created));
    return;
  }

  // PATCH /api/prompts/:id/traffic
  const trafficMatch = url.match(/^\/api\/prompts\/([^/]+)\/traffic$/);
  if (trafficMatch && req.method === 'PATCH') {
    const id = trafficMatch[1]!;
    const body = await parseBody(req);
    const activePct = body.active_pct as number | undefined;

    if (activePct === undefined || activePct < 0 || activePct > 100) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'active_pct must be 0–100' }));
      return;
    }

    // Get current record to find prompt_name
    const [current] = await db
      .select()
      .from(promptVersions)
      .where(eq(promptVersions.id, id))
      .limit(1);

    if (!current) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Prompt version not found' }));
      return;
    }

    // Validate sum of active_pct for same prompt_name ≤ 100
    const [sumResult] = await db
      .select({ total: sum(promptVersions.activePct) })
      .from(promptVersions)
      .where(eq(promptVersions.promptName, current.promptName));

    const currentTotal = Number(sumResult?.total ?? 0);
    const newTotal = currentTotal - current.activePct + activePct;

    if (newTotal > 100) {
      res.statusCode = 400;
      res.end(JSON.stringify({
        error: `Traffic sum would be ${newTotal}% (max 100%). Current total: ${currentTotal}%, this version: ${current.activePct}%.`,
      }));
      return;
    }

    const [updated] = await db
      .update(promptVersions)
      .set({ activePct })
      .where(eq(promptVersions.id, id))
      .returning();

    res.end(JSON.stringify(updated));
    return;
  }

  // POST /api/prompts/:name/promote
  const promoteMatch = url.match(/^\/api\/prompts\/([^/]+)\/promote$/);
  if (promoteMatch && req.method === 'POST') {
    const promptName = decodeURIComponent(promoteMatch[1]!);
    const body = await parseBody(req);
    const version = body.version as string | undefined;

    if (!version) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Required: version' }));
      return;
    }

    // Find the specified version
    const [target] = await db
      .select()
      .from(promptVersions)
      .where(and(eq(promptVersions.promptName, promptName), eq(promptVersions.version, version)))
      .limit(1);

    if (!target) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: `No version ${version} found for prompt: ${promptName}` }));
      return;
    }

    // Promotion ladder: 0 → 10 → 50 → 100
    const ladder = [0, 10, 50, 100];
    const currentIdx = ladder.indexOf(target.activePct);
    const previousPct = target.activePct;

    if (currentIdx === -1) {
      // Non-standard percentage — snap to next ladder step above current
      const nextStep = ladder.find(s => s > target.activePct);
      if (!nextStep) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: `Already at maximum traffic: ${target.activePct}%` }));
        return;
      }
    }

    if (target.activePct >= 100) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Already at 100% — fully promoted' }));
      return;
    }

    // Determine next step
    let newPct: number;
    if (currentIdx !== -1 && currentIdx < ladder.length - 1) {
      newPct = ladder[currentIdx + 1]!;
    } else {
      newPct = ladder.find(s => s > target.activePct) ?? 100;
    }

    // Quality gate: eval_score >= 0.70 required to promote beyond 10%
    if (newPct > 10) {
      const evalScore = target.evalScore ? parseFloat(target.evalScore) : null;
      if (evalScore === null || evalScore < 0.70) {
        res.statusCode = 400;
        res.end(JSON.stringify({
          error: `Quality gate: eval_score ${evalScore?.toFixed(2) ?? 'null'} < 0.70 required for promotion beyond 10%`,
        }));
        return;
      }
    }

    // At 100%: set all other versions of same prompt to 0%
    if (newPct === 100) {
      await db
        .update(promptVersions)
        .set({ activePct: 0 })
        .where(eq(promptVersions.promptName, promptName));
    }

    // Set this version to the new percentage
    await db
      .update(promptVersions)
      .set({ activePct: newPct })
      .where(eq(promptVersions.id, target.id));

    const nextStep = newPct >= 100
      ? 'Fully promoted — all other versions set to 0%'
      : `Promote again to reach ${ladder[ladder.indexOf(newPct) + 1] ?? 100}%`;

    res.end(JSON.stringify({
      promptName,
      version,
      previousPct,
      newPct,
      nextStep,
    }));
    return;
  }

  // Fallback for unmatched /api/prompts routes
  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Not found' }));
  } catch (err) {
    process.stderr.write(`ERROR in prompt routes: ${err}\n`);
    if (!res.writableEnded) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }
}
