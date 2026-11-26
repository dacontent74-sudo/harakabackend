import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { lookup } from 'dns/promises';
import { AppModule } from './app.module';
import { AuthService } from './auth/auth.service';
import { getJwtSecret } from './auth/jwt.config';

/** Allowed browser origins: FRONTEND_URL + CORS_ORIGINS (comma separated). */
function corsOrigins(): string[] | true {
  const list = [process.env.FRONTEND_URL, ...(process.env.CORS_ORIGINS || '').split(',')]
    .map((o) => (o || '').trim().replace(/\/+$/, ''))
    .filter(Boolean);
  // Mobile apps don't use CORS. If no browser origin is configured, allow all:
  // auth uses Bearer tokens (no cookies), so this does not enable CSRF.
  return list.length ? list : true;
}

/**
 * Log which database host we are about to use (never the password) and, if its
 * name does not resolve, explain the usual Render causes instead of leaving only
 * TypeORM's bare "getaddrinfo ENOTFOUND" retry loop in the logs.
 */
async function checkDatabaseHost(logger: Logger): Promise<void> {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    logger.error('DATABASE_URL is not set. Set it in Render > haraka-backend > Environment.');
    return;
  }
  let host: string;
  try {
    const url = new URL(raw);
    host = url.hostname;
    logger.log(`🗄️ Database: ${host}:${url.port || 5432}${url.pathname}`);
  } catch {
    logger.error('DATABASE_URL is not a valid postgresql:// URL. Re-copy it from the Render database page.');
    return;
  }
  try {
    await lookup(host);
  } catch {
    const internal = /^dpg-[a-z0-9]+-a$/.test(host);
    logger.error(
      `Database host "${host}" does not resolve (DNS ENOTFOUND). ` +
        (internal
          ? 'This is a Render *internal* hostname: it only resolves if the database still exists AND is in the same ' +
            'region/workspace as this service. The database was most likely deleted (free Render databases expire ' +
            'after 30 days) or lives in another region. Open Render > Databases, then copy the Internal Database URL of an ' +
            'existing database in the same region into DATABASE_URL (or create a new one).'
          : 'Check the hostname in DATABASE_URL, or that the database still exists.'),
    );
  }
}

// Haraka Backend API
// Features: Food ordering, Parcel delivery, Payment integration, Distance-based pricing
async function bootstrap() {
  const logger = new Logger('Bootstrap');
  await checkDatabaseHost(logger);
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Render (and most PaaS) sit behind one proxy hop: use the real client IP
  // for rate limiting and audit logs.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // Security headers. CSP is off because the public location pages load map
  // libraries from CDNs and use inline scripts.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Global prefix for API routes ONLY (not root routes like /select-location)
  app.setGlobalPrefix('api/v1', {
    exclude: ['select-location/:orderId', 'seed', 'health', 'confirm-location'],
  });

  const origins = corsOrigins();
  app.enableCors({
    origin: origins,
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Webhook-Secret'],
    maxAge: 86400,
  });

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // Request body size limit (default 100kb is fine for JSON APIs)
  app.useBodyParser('json', { limit: '200kb' });

  // Fail fast on weak config in production (logs a loud error, see jwt.config.ts)
  getJwtSecret();

  // Create default admin user on startup (only if no super admin exists)
  const authService = app.get(AuthService);
  await authService.createDefaultAdmin();

  app.enableShutdownHooks();

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0'); // Listen on all network interfaces

  logger.log(`🚀 Haraka Backend API started on port ${port} (${process.env.NODE_ENV || 'development'})`);
  logger.log(`📋 API prefix: /api/v1   ❤️ Health: /health`);
  logger.log(`🌐 CORS origins: ${origins === true ? 'any (set FRONTEND_URL / CORS_ORIGINS to restrict)' : origins.join(', ')}`);
}

bootstrap();
