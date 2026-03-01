/**
 * FILE PURPOSE: Strapi database configuration
 *
 * WHY: Connect Strapi to PostgreSQL (same instance as API service).
 * HOW: Reads DATABASE_URL or individual connection params from env.
 *      Uses a separate schema ('strapi') to avoid table conflicts with Drizzle.
 */

export default ({ env }: { env: (key: string, fallback?: string) => string }) => ({
  connection: {
    client: 'postgres',
    connection: {
      host: env('DATABASE_HOST', 'postgres'),
      port: parseInt(env('DATABASE_PORT', '5432'), 10),
      database: env('DATABASE_NAME', 'playbook'),
      user: env('DATABASE_USERNAME', 'playbook'),
      password: env('DATABASE_PASSWORD', ''),
      schema: env('DATABASE_SCHEMA', 'strapi'),
      ssl: env('DATABASE_SSL', 'false') === 'true'
        ? { rejectUnauthorized: false }
        : false,
    },
    pool: {
      min: 2,
      max: 10,
    },
  },
});
