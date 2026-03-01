#!/usr/bin/env node
/**
 * FILE PURPOSE: npm audit wrapper with allowlist support
 *
 * WHY: `npm audit` is all-or-nothing — a single unfixable transitive vuln
 *      forces `continue-on-error: true`, which silently swallows new vulns.
 *      This script makes audit a real blocking gate by filtering known exceptions.
 *
 * HOW: Runs `npm audit --json`, filters out allowlisted advisories (with expiry dates),
 *      and exits non-zero only for un-allowlisted high/critical findings.
 *
 * AUTHOR: Claude Opus 4.6
 * LAST UPDATED: 2026-03-01
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

/** Load allowlist from .audit-allowlist.json */
function loadAllowlist() {
  try {
    const raw = readFileSync(join(ROOT, '.audit-allowlist.json'), 'utf-8');
    const entries = JSON.parse(raw);
    const now = new Date();
    const active = {};
    for (const [id, entry] of Object.entries(entries)) {
      if (entry.expires && new Date(entry.expires) < now) {
        process.stdout.write(`WARN: Allowlist entry ${id} expired on ${entry.expires} — removing from allowlist\n`);
        continue;
      }
      active[id] = entry;
    }
    return active;
  } catch {
    return {};
  }
}

/** Run npm audit and parse JSON output. */
function runAudit() {
  try {
    const output = execSync('npm audit --json --audit-level=high --omit=dev', {
      cwd: ROOT,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return JSON.parse(output);
  } catch (err) {
    // npm audit exits non-zero when vulns found — parse stdout anyway
    if (err.stdout) {
      try {
        return JSON.parse(err.stdout);
      } catch {
        process.stderr.write('ERROR: Failed to parse npm audit JSON output\n');
        process.exit(1);
      }
    }
    process.stderr.write(`ERROR: npm audit failed: ${err.message}\n`);
    process.exit(1);
  }
}

const allowlist = loadAllowlist();
const audit = runAudit();

const vulnerabilities = audit.vulnerabilities ?? {};
let blocked = 0;
let allowed = 0;

for (const [name, vuln] of Object.entries(vulnerabilities)) {
  const severity = vuln.severity;
  if (severity !== 'high' && severity !== 'critical') continue;

  // Check if this vuln is allowlisted (by package name or advisory ID)
  const viaIds = (vuln.via ?? [])
    .filter((v) => typeof v === 'object' && v.source)
    .map((v) => String(v.source));

  const isAllowlisted = allowlist[name] || viaIds.some((id) => allowlist[id]);

  if (isAllowlisted) {
    allowed++;
    process.stdout.write(`ALLOWED: ${name} (${severity}) — ${allowlist[name]?.reason ?? 'see allowlist'}\n`);
  } else {
    blocked++;
    process.stderr.write(`BLOCKED: ${name} (${severity}) — not in allowlist\n`);
    for (const v of vuln.via ?? []) {
      if (typeof v === 'object' && v.title) {
        process.stderr.write(`  → ${v.title} (${v.url ?? 'no URL'})\n`);
      }
    }
  }
}

process.stdout.write(`\nAudit summary: ${blocked} blocked, ${allowed} allowed\n`);

if (blocked > 0) {
  process.stderr.write(`\nFAILED: ${blocked} un-allowlisted high/critical vulnerabilities found.\n`);
  process.stderr.write('To allowlist a known unfixable vuln, add it to .audit-allowlist.json with an expiry date.\n');
  process.exit(1);
}

process.stdout.write('PASSED: No un-allowlisted high/critical vulnerabilities.\n');
process.exit(0);
