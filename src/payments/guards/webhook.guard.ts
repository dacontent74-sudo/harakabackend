import { Injectable, CanActivate, ExecutionContext, Logger, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class WebhookGuard implements CanActivate {
  private readonly logger = new Logger(WebhookGuard.name);

  // PawaPay webhook IPs - Configurable via environment variable
  private readonly ALLOWED_IPS = [
    '127.0.0.1', // localhost for testing
    '::1', // IPv6 localhost
    '::ffff:127.0.0.1', // IPv6-mapped IPv4 localhost
    // Add from environment variable: WEBHOOK_ALLOWED_IPS (comma-separated)
    ...(process.env.WEBHOOK_ALLOWED_IPS
      ? process.env.WEBHOOK_ALLOWED_IPS.split(',').map(ip => ip.trim())
      : []
    ),
  ];

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const clientIp = this.getClientIp(request);
    const userAgent = (request.headers['user-agent'] || '').toLowerCase();

    this.logger.log(`🔒 Webhook from IP: ${clientIp}, User-Agent: ${userAgent}`);

    // In development, allow all IPs
    if (process.env.NODE_ENV === 'development') {
      this.logger.warn('⚠️ Development mode - allowing all webhook IPs');
      return true;
    }

    // ✅ PRODUCTION SECURITY: Multi-layer validation

    // Layer 1: Check if from trusted webhook router (Africa Cyber Trust)
    // Africa Cyber Trust uses Python requests library to forward webhooks
    if (userAgent.includes('python-requests')) {
      this.logger.log(`✅ Webhook from trusted router (Africa Cyber Trust)`);
      return true;
    }

    // Layer 2: Check if from PawaPay directly (if they send directly in future)
    // PawaPay may use specific user-agents or IPs
    if (userAgent.includes('pawapay')) {
      this.logger.log(`✅ Webhook from PawaPay`);
      return true;
    }

    // Layer 3: Check if from whitelisted IP (localhost, testing, known IPs)
    if (this.ALLOWED_IPS.includes(clientIp)) {
      this.logger.log(`✅ Webhook from whitelisted IP: ${clientIp}`);
      return true;
    }

    // ❌ REJECT: Unknown source
    this.logger.error(`❌ Unauthorized webhook from IP: ${clientIp}, User-Agent: ${userAgent}`);
    throw new UnauthorizedException('Webhook source not authorized');
  }

  private getClientIp(request: Request): string {
    // Check x-forwarded-for header (for proxies/load balancers like Render)
    const forwardedFor = request.headers['x-forwarded-for'];
    if (forwardedFor) {
      const ips = (forwardedFor as string).split(',');
      return ips[0].trim();
    }

    // Check x-real-ip header
    const realIp = request.headers['x-real-ip'];
    if (realIp) {
      return realIp as string;
    }

    // Fallback to connection remote address
    return request.connection.remoteAddress ||
           request.socket.remoteAddress ||
           request.ip ||
           'unknown';
  }
}
