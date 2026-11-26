import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailService } from './email.service';
import { TwilioSmsService } from './twilio-sms.service';
import { WhatsAppService } from './whatsapp.service';
import { AdminNotificationService } from './admin-notification.service';
import { NotificationsController } from './notifications.controller';
import { AdminNotificationsController } from './admin-notifications.controller';
import { AdminNotification } from './entities/admin-notification.entity';
import { ServerErrorAlertFilter } from './server-error-alert.filter';
import { AuthModule } from '../auth/auth.module';

/**
 * Notifications:
 *   - WhatsApp Business API (primary, 40x cheaper than SMS!)
 *   - Twilio SMS (fallback) and Gmail SMTP email (optional) for restaurants, couriers and customers.
 *   - Admin alerts: stored in `admin_notifications` and pushed live to the admin dashboard
 *     over Server-Sent Events (no SMS/email to admins).
 */
@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([AdminNotification])],
  controllers: [NotificationsController, AdminNotificationsController],
  providers: [
    EmailService,
    TwilioSmsService,
    WhatsAppService,
    AdminNotificationService,
    { provide: APP_FILTER, useClass: ServerErrorAlertFilter },
  ],
  exports: [EmailService, TwilioSmsService, WhatsAppService, AdminNotificationService],
})
export class NotificationsModule {}
