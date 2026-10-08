import { Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';

const logger = new Logger('JwtConfig');

const INSECURE_DEFAULTS = new Set([
  'haraka-secret-key-change-in-production',
  'secret',
  'changeme',
  'change-me',
]);

let cachedSecret: string | null = null;

/**
 * Returns the secret used to sign and verify every Haraka JWT
 * (staff, courier and restaurant tokens).
 *
 * - JWT_SECRET must be set in production and be at least 32 characters.
 * - If it is missing/weak in production we do NOT fall back to a hard-coded
 *   value (that would let anyone forge admin tokens). Instead a random
 *   per-process secret is generated: the API stays up and secure, but every
 *   token becomes invalid on restart, so set JWT_SECRET on Render.
 */
export function getJwtSecret(): string {
  if (cachedSecret) return cachedSecret;

  const secret = process.env.JWT_SECRET;
  const isProd = process.env.NODE_ENV === 'production';
  const weak = !secret || secret.length < 32 || INSECURE_DEFAULTS.has(secret);

  if (!weak) {
    cachedSecret = secret;
  } else if (isProd) {
    logger.error(
      'JWT_SECRET is missing or weak (<32 chars). Using a random per-process secret; ' +
        'all sessions will be invalidated on every restart. Set JWT_SECRET on Render!',
    );
    cachedSecret = randomBytes(48).toString('hex');
  } else {
    if (!secret) logger.warn('JWT_SECRET not set - using an insecure development secret.');
    cachedSecret = secret || 'haraka-dev-only-secret-do-not-use-in-production';
  }
  return cachedSecret;
}

/** Token lifetimes per principal type. */
export const TOKEN_TTL = {
  staff: process.env.JWT_STAFF_EXPIRES_IN || '12h',
  courier: process.env.JWT_COURIER_EXPIRES_IN || '30d',
  merchant: process.env.JWT_MERCHANT_EXPIRES_IN || '30d',
};
