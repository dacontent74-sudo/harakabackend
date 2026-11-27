import { BadRequestException, Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Auth, CurrentUser } from '../auth/decorators/roles.decorator';
import { AuthPrincipal, STAFF_ADMIN } from '../auth/principal';
import { TwilioSmsService } from './twilio-sms.service';
import { WhatsAppService } from './whatsapp.service';
import { AdminNotificationService } from './admin-notification.service';

/**
 * Notification diagnostics for admins (all routes: super_admin / admin JWT).
 *   GET  /api/v1/notifications/status            Twilio + admin-alert configuration and counters
 *   POST /api/v1/notifications/verify-twilio     re-check Twilio credentials (free, sends nothing)
 *   POST /api/v1/notifications/test-sms          { to, message? } send one real SMS, returns Twilio's error + fix
 *   POST /api/v1/notifications/test-whatsapp     { to, message? } send one real WhatsApp message
 *   POST /api/v1/notifications/test-admin        push a test notification to the admin dashboard
 *
 * Admin alerts themselves live in AdminNotificationsController (/api/v1/admin/notifications).
 */
@Controller('notifications')
@Auth(...STAFF_ADMIN)
export class NotificationsController {
  constructor(
    private readonly sms: TwilioSmsService,
    private readonly whatsapp: WhatsAppService,
    private readonly admin: AdminNotificationService,
  ) {}

  @Get('status')
  status() {
    return { success: true, sms: this.sms.getStatus(), adminAlerts: this.admin.getConfig() };
  }

  @Post('verify-twilio')
  @HttpCode(200)
  async verify() {
    const check = await this.sms.verifyCredentials();
    return { success: check.ok, ...check };
  }

  @Post('test-sms')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async testSms(@Body() body: { to?: string; message?: string }, @CurrentUser() user: AuthPrincipal) {
    if (!body?.to) throw new BadRequestException('"to" is required (e.g. +250788123456)');
    const message = (body.message || `Haraka SMS test from ${user?.name || 'admin'}. If you got this, SMS works.`).slice(0, 300);
    return this.sms.send(body.to, message);
  }

  @Post('test-whatsapp')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async testWhatsApp(@Body() body: { to?: string; message?: string }, @CurrentUser() user: AuthPrincipal) {
    if (!body?.to) throw new BadRequestException('"to" is required (e.g. +250788123456)');

    if (!this.whatsapp.isWhatsAppConfigured()) {
      return {
        success: false,
        error: 'WhatsApp is not configured. Set TWILIO_WHATSAPP_NUMBER in environment variables.',
        status: this.whatsapp.getStatus()
      };
    }

    const message = (body.message || `💬 Haraka WhatsApp test from ${user?.name || 'admin'}. If you got this, WhatsApp works! 🎉`).slice(0, 300);
    const sent = await this.whatsapp.sendPaymentConfirmed(body.to, 'TEST-001', 1000);

    return {
      success: sent,
      message: sent
        ? `✅ WhatsApp message sent to ${body.to}`
        : `❌ Failed to send WhatsApp. Check logs for details.`,
      status: this.whatsapp.getStatus()
    };
  }

  @Post('test-admin')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async testAdmin(@CurrentUser() user: AuthPrincipal) {
    const notification = await this.admin.test(user?.fullName || user?.email || String(user?.id ?? ''));
    return { success: true, notification, config: this.admin.getConfig() };
  }
}
