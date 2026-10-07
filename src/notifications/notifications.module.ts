import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { SmsService } from './sms.service';
import { WhatsAppService } from './whatsapp.service';
import { NotificationsController } from './notifications.controller';

@Module({
  controllers: [NotificationsController],
  providers: [EmailService, SmsService, WhatsAppService],
  exports: [EmailService, SmsService, WhatsAppService],
})
export class NotificationsModule {}
