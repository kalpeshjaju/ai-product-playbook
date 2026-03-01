/**
 * FILE PURPOSE: Verify all API routes are documented in API_CONTRACTS.md
 *
 * WHY: Undocumented endpoints create integration risk. Replaces fragile shell+regex approach.
 * HOW: Reads server.ts and routes/*.ts, extracts /api/ paths, checks against docs/API_CONTRACTS.md.
 *
 * USAGE: npx tsx scripts/check-api-contracts.ts
 * EXIT: 0 = all documented, 1 = gaps found
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const CONTRACTS_DOC = 'docs/API_CONTRACTS.md';
const API_SRC = 'apps/api/src';

function extractRoutes(): Map<string, string[]> {
  const routes = new Map<string, string[]>();

  const files = [join(API_SRC, 'server.ts'), ...getRouteFiles()];

  for (const file of files) {
    if (!existsSync(file)) continue;
    const content = readFileSync(file, 'utf-8');

    // Match string literal routes: '/api/...'
    const literalMatches = content.matchAll(/['"]\/api\/[^'"]*['"]/g);
    for (const m of literalMatches) {
      const route = m[0].replace(/['"]/g, '');
      if (!routes.has(route)) routes.set(route, []);
      routes.get(route)!.push(file);
    }

    // Match regex routes: url.match(/^\/api\/.../)
    const regexMatches = content.matchAll(/match\(\s*\/(.+?)\//g);
    for (const m of regexMatches) {
      const pattern = m[1];
      if (!pattern.includes('/api/') && !pattern.includes('\\/api\\/')) continue;
      const readable = pattern
        .replace(/\\\//g, '/')
        .replace(/^\^/, '')
        .replace(/\$$/, '')
        .replace(/\(\[^\/\]\+\)/g, ':param')
        .replace(/\(\[^\/\]\+?\)/g, ':param');
      if (!routes.has(readable)) routes.set(readable, []);
      routes.get(readable)!.push(file);
    }
  }

  return routes;
}

function getRouteFiles(): string[] {
  const routesDir = join(API_SRC, 'routes');
  if (!existsSync(routesDir)) return [];
  return readdirSync(routesDir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => join(routesDir, f));
}

function checkDocumentation(routes: Map<string, string[]>): number {
  if (!existsSync(CONTRACTS_DOC)) {
    process.stderr.write(`❌ ${CONTRACTS_DOC} does not exist\n`);
    return 1;
  }

  const doc = readFileSync(CONTRACTS_DOC, 'utf-8');
  let undocumented = 0;

  for (const [route, files] of routes) {
    if (!route.startsWith('/api/')) continue;

    // Try exact match
    if (doc.includes(route)) continue;

    // Try base path match
    const basePath = route.replace(/\/:[^/]+/g, '').replace(/\/\([^)]+\)/g, '');
    if (doc.includes(basePath)) continue;

    process.stdout.write(`⚠️  Undocumented: ${route} (in ${files.join(', ')})\n`);
    undocumented++;
  }

  if (undocumented > 0) {
    process.stdout.write(`\n❌ ${undocumented} undocumented route(s)\n`);
    return 1;
  }

  process.stdout.write(`✅ All ${routes.size} routes documented\n`);
  return 0;
}

const routes = extractRoutes();
process.exit(checkDocumentation(routes));
