#!/bin/sh
# API server entrypoint — runs drizzle migrations + pgvector setup before starting
# Migration and extension steps are non-fatal — server starts regardless

echo "=== Running database migrations ==="
(cd /app/apps/api && npx drizzle-kit push 2>&1) || echo "WARN: migrations failed — server will start anyway"

echo "=== Enabling pgvector extension ==="
node -e "
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL);
sql\`CREATE EXTENSION IF NOT EXISTS vector\`
  .then(() => { console.log('pgvector extension enabled'); return sql.end(); })
  .catch(e => { console.warn('pgvector:', e.message); return sql.end(); });
" 2>&1 || echo "WARN: pgvector setup skipped"

echo "=== Starting API server ==="
exec node apps/api/dist/server.js
