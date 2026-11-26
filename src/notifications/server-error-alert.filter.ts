import { ArgumentsHost, Catch, HttpException, Injectable } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { AdminNotificationService } from './admin-notification.service';

/**
 * Global filter: behaves exactly like Nest's default exception handling, but also
 * raises an admin dashboard "system" alert for unexpected server errors (HTTP 5xx).
 * Each route + error message alerts at most once every 30 minutes.
 */
@Catch()
@Injectable()
export class ServerErrorAlertFilter extends BaseExceptionFilter {
  constructor(private readonly notifications: AdminNotificationService) {
    super();
  }

  catch(exception: unknown, host: ArgumentsHost) {
    try {
      const status = exception instanceof HttpException ? exception.getStatus() : 500;
      if (status >= 500 && host.getType() === 'http') {
        const req = host.switchToHttp().getRequest();
        const route = `${req?.method ?? ''} ${req?.route?.path ?? req?.path ?? ''}`.trim();
        const msg = (exception as any)?.message ? String((exception as any).message).slice(0, 300) : 'Unknown error';
        void this.notifications.systemAlert(`Server error on ${route}`, msg, {
          level: 'error',
          dedupeKey: `5xx:${route}:${msg.slice(0, 80)}`,
          data: { source: 'api', route, status },
        });
      }
    } catch {
      // Alerting must never change how the error is answered.
    }
    super.catch(exception, host);
  }
}
