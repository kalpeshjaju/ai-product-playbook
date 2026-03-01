/**
 * FILE PURPOSE: Strapi server configuration
 *
 * WHY: Configure host, port, and admin panel URL for the CMS.
 * HOW: Uses env vars for deployment flexibility. Port 1337 by default.
 */

import crypto from 'crypto';

export default ({ env }: { env: (key: string, fallback?: string) => string }) => ({
  host: env('HOST', '0.0.0.0'),
  port: parseInt(env('PORT', '1337'), 10),
  app: {
    keys: env('APP_KEYS', crypto.randomBytes(32).toString('hex')).split(','),
  },
  url: env('PUBLIC_URL', 'http://localhost:1337'),
});
