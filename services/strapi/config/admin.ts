/**
 * FILE PURPOSE: Strapi admin panel configuration
 *
 * WHY: Sets authentication secrets and admin URL for the CMS dashboard.
 */

import crypto from 'crypto';

export default ({ env }: { env: (key: string, fallback?: string) => string }) => ({
  auth: {
    secret: env('ADMIN_JWT_SECRET', crypto.randomBytes(32).toString('hex')),
  },
  apiToken: {
    salt: env('API_TOKEN_SALT', crypto.randomBytes(16).toString('hex')),
  },
  transfer: {
    token: {
      salt: env('TRANSFER_TOKEN_SALT', crypto.randomBytes(16).toString('hex')),
    },
  },
});
