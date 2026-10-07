import { Injectable, CanActivate, ExecutionContext, Logger, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class WebhookGuard implements CanActivate {
  private readonly logger = new Logger(WebhookGuard.name);

  // PawaPay webhook IPs - Update these with actual PawaPay IPs
  private readonly ALLOWED_IPS = [
    '127.0.0.1', // localhost for testing
    '::1', // IPv6 localhost
    '::ffff:127.0.0.1', // IPv6-mapped IPv4 localhost
    // Add PawaPay production IPs here when available
    // Example: '52.18.xxx.xxx', '54.xxx.xxx.xxx'
  ];

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const clientIp = this.getClientIp(request);

    this.logger.log(`🔒 Webhook from IP: ${clientIp}, User-Agent: ${request.headers['user-agent']}`);

    // TEMPORARY: Allow ALL webhooks to diagnose payment confirmation issue
    // TODO: Re-enable IP whitelist after confirming webhook flow works
    this.logger.warn('⚠️ Allowing all webhook sources (temporary diagnostic mode)');
    return true;
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
