import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { TwilioSmsService } from './twilio-sms.service';

/**
 * Notifications: Twilio SMS (primary) and Gmail SMTP email (optional).
 * The old WhatsApp (whatsapp-web.js / headless Chrome) and Africa's Talking
 * integrations were removed - they are replaced by Twilio SMS.
 */
@Module({
  providers: [EmailService, TwilioSmsService],
  exports: [EmailService, TwilioSmsService],
})
export class NotificationsModule {}
