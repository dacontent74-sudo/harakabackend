import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { SmsService } from './sms.service';
import { WhatsAppService } from './whatsapp.service';
import { TwilioSmsService } from './twilio-sms.service';
import { NotificationsController } from './notifications.controller';

@Module({
  controllers: [NotificationsController],
  providers: [EmailService, SmsService, WhatsAppService, TwilioSmsService],
  exports: [EmailService, SmsService, WhatsAppService, TwilioSmsService],
})
export class NotificationsModule {}
