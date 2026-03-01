---
name: migration
description: Generate a Drizzle schema migration with validation. Use when user says "/migration" or asks to create a DB migration.
disable-model-invocation: true
---

## Drizzle Migration Workflow

### 1. Read current schema

```bash
cat apps/api/src/db/schema.ts
```

Understand the existing tables, columns, relations, and indexes.

### 2. Apply the requested schema change

Edit `apps/api/src/db/schema.ts` with the requested modification.
Follow conventions:
- Use `pgTable()` for new tables
- Use `text()`, `integer()`, `boolean()`, `timestamp()`, `jsonb()` column helpers
- Add `createdAt` and `updatedAt` to every new table
- Add indexes for foreign keys and frequently queried columns

### 3. Generate migration SQL

```bash
cd apps/api && npx drizzle-kit generate
```

### 4. Review the generated SQL

Read the new migration file in `apps/api/drizzle/` and present it for review.
Check for:
- Destructive operations (DROP COLUMN, DROP TABLE) — flag with warning
- Missing `IF NOT EXISTS` or `IF EXISTS` guards where appropriate
- Large table locks (ALTER TABLE on high-row tables)

### 5. Type-check

```bash
npx turbo run type-check --filter=@playbook/api
```

Ensure schema types propagate correctly to all consumers.

### 6. Present summary

Show:
- Migration file path and name
- SQL operations (CREATE, ALTER, DROP)
- Any warnings about destructive or locking operations
- Confirmation that types are clean
