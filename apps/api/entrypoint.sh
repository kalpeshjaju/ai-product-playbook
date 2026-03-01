#!/bin/sh
# API server entrypoint — pgvector first, then migrations, then server
# All setup steps are non-fatal — server starts regardless

echo "=== Enabling pgvector extension ==="
node -e "
(async () => {
  const postgres = require('postgres');
  const sql = postgres(process.env.DATABASE_URL);
  try {
    await sql\`CREATE EXTENSION IF NOT EXISTS vector\`;
    console.log('pgvector extension enabled');
  } catch (e) {
    console.warn('pgvector:', e.message);
  } finally {
    await sql.end();
  }
})();
" 2>&1 || echo "WARN: pgvector setup skipped"

echo "=== Running database migrations ==="
(cd /app/apps/api && npx drizzle-kit push 2>&1) || echo "WARN: migrations failed — server will start anyway"

echo "=== Starting API server ==="
exec node apps/api/dist/server.js
