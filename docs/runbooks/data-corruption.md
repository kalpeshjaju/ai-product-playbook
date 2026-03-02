# Runbook: Data Corruption

> When data is missing, garbled, or violating constraints.

## Symptoms

- Missing records that previously existed
- Foreign key constraint violations in logs
- User reports of incorrect or garbled data
- `ai_generations` or `documents` tables return unexpected nulls
- Health check passes but data routes return inconsistent results

## Immediate: Stop Writes

1. Set `AUTH_MODE=strict` + temporarily revoke `API_KEYS` to block all writes
2. Or: Deploy a maintenance-mode flag if available
3. **Do NOT restart services** — preserve state for diagnosis

## Diagnose

1. Identify corruption scope:
   - Which tables? (`ai_cost_events`, `documents`, `document_embeddings`, etc.)
   - Which rows? (check timestamps, IDs)
   - When did it start? (correlate with deploy timestamps)
2. Check recent deploys: `git log --oneline -10` + Railway deploy history
3. Check recent migrations: `ls -la apps/api/drizzle/`
4. Check for destructive SQL: search logs for DROP, TRUNCATE, DELETE

## Restore

**Option A — Railway Point-in-Time Recovery (if available on plan)**:
1. Railway dashboard → Postgres → Backups → Select point before corruption
2. Restore to new instance
3. Verify restored data integrity

**Option B — Manual backup restore**:
1. Railway dashboard → Postgres → Backups → Download latest daily backup
2. Create new Postgres instance on Railway
3. Restore backup: `pg_restore --clean --no-owner -d $NEW_DATABASE_URL backup.dump`
4. Point API to new instance: update `DATABASE_URL` in Railway env vars

## Verify

1. Run integrity checks:
   - Row counts match expected (compare with pre-corruption if known)
   - No orphaned foreign keys: `SELECT ... WHERE fk NOT IN (SELECT id FROM parent)`
   - API health check passes: `GET /api/health`
2. Spot-check key tables via Railway data browser
3. Run test suite against restored DB if possible

## Resume

1. Re-enable API keys / auth
2. Monitor Sentry for 30 minutes for any new errors
3. Verify write path works: create a test document via API

## Post-Mortem

- Log in `docs/INCIDENTS.md` with full timeline
- If caused by migration: add rollback migration and guard against destructive SQL
- If caused by LLM: add eval case to Braintrust dataset
- Measure actual RTO and compare to target (≤ 4h current, ≤ 2h target)
