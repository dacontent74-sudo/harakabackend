import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Result of one SMS attempt, with an actionable hint when it failed. */
export interface SmsResult {
  success: boolean;
  to?: string;
  sid?: string;
  /** Twilio error code (e.g. 20003, 21608) or an internal code. */
  code?: number | string;
  error?: string;
  /** What to do about the failure, in plain words. */
  hint?: string;
}

export interface SmsFailure {
  to: string;
  code?: number | string;
  error: string;
  hint?: string;
  at: Date;
}

/**
 * Twilio error codes we see in practice, with the fix for each.
 * https://www.twilio.com/docs/api/errors
 */
const TWILIO_HINTS: Record<string, string> = {
  '20003':
    'Twilio authentication failed: TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN are wrong. Copy both again from console.twilio.com (Account Info) and restart.',
  '20404': 'Twilio resource not found: check TWILIO_ACCOUNT_SID.',
  '20429': 'Twilio rate limit reached: too many SMS at once.',
  '21211': 'Recipient phone number is not a valid number.',
  '21212': 'TWILIO_FROM_NUMBER is not a valid phone number.',
  '21408':
    'SMS to this country is blocked: enable it in Twilio Console > Messaging > Settings > Geo permissions (tick Rwanda).',
  '21606': 'TWILIO_FROM_NUMBER is not an SMS-capable number owned by this Twilio account.',
  '21608':
    'Twilio TRIAL account: it can only text VERIFIED numbers. Verify this number in Twilio Console > Phone Numbers > Verified Caller IDs, or upgrade the account.',
  '21610': 'The recipient replied STOP and has unsubscribed from this number.',
  '21612': 'Twilio cannot route SMS from TWILIO_FROM_NUMBER to this country.',
  '21614': 'Recipient number is not a mobile number (cannot receive SMS).',
  '21659': 'TWILIO_FROM_NUMBER does not belong to this Twilio account.',
  '30044': 'Twilio trial message too long.',
};

/**
 * Normalise a phone number to E.164 for Twilio.
 * Rwandan local formats (078..., 78..., 250...) become +250...; numbers already
 * in +E.164 (any country) are kept. Returns null if it cannot be normalised.
 */
export function toE164(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  let s = String(raw).trim().replace(/[\s\-().]/g, '');
  if (!s) return null;
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (s.startsWith('+')) return /^\+\d{8,15}$/.test(s) ? s : null;
  if (!/^\d+$/.test(s)) return null;
  if (s.startsWith('250') && s.length === 12) return '+' + s;
  if (s.startsWith('0') && s.length === 10) return '+250' + s.slice(1);
  if (s.length === 9) return '+250' + s;
  return null;
}

/** +250788123456 -> +250788***456 (for logs/status pages). */
export function maskPhone(phone?: string | null): string {
  if (!phone) return '';
  return phone.length > 7 ? `${phone.slice(0, phone.length - 6)}***${phone.slice(-3)}` : '***';
}

@Injectable()
export class TwilioSmsService implements OnModuleInit {
  private readonly logger = new Logger(TwilioSmsService.name);
  private twilioClient: any;
  private fromNumber: string;
  private accountSid: string;
  private configProblem: string | undefined;

  // Diagnostics
  private sentCount = 0;
  private failedCount = 0;
  private lastSuccessAt: Date | undefined;
  private lastFailure: SmsFailure | undefined;
  private credentialCheck:
    | { ok: boolean; accountType?: string; accountStatus?: string; fromNumberOwned?: boolean; error?: string; hint?: string; checkedAt: Date }
    | undefined;
  private readonly failureListeners: Array<(f: SmsFailure) => void> = [];

  constructor(private configService: ConfigService) {
    // .trim(): a trailing space/newline pasted into the Render dashboard
    // silently breaks authentication.
    const get = (k: string) => (this.configService.get<string>(k) ?? '').toString().trim();
    this.accountSid = get('TWILIO_ACCOUNT_SID');
    const authToken = get('TWILIO_AUTH_TOKEN');
    // TWILIO_FROM_NUMBER is the documented name; TWILIO_PHONE_NUMBER is accepted too.
    this.fromNumber = get('TWILIO_FROM_NUMBER') || get('TWILIO_PHONE_NUMBER') || get('TWILIO_MESSAGING_SERVICE_SID');

    const missing = [
      !this.accountSid && 'TWILIO_ACCOUNT_SID',
      !authToken && 'TWILIO_AUTH_TOKEN',
      !this.fromNumber && 'TWILIO_FROM_NUMBER',
    ].filter(Boolean);
    if (missing.length) {
      this.configProblem = `Missing env: ${missing.join(', ')}`;
      this.logger.error(`❌ Twilio NOT configured (${this.configProblem}). NO SMS will be sent.`);
      return;
    }

    // Catch copy/paste mistakes before the first customer order fails.
    const formatProblems: string[] = [];
    if (!/^AC[0-9a-f]{32}$/i.test(this.accountSid)) {
      formatProblems.push(`TWILIO_ACCOUNT_SID must be "AC" + 32 hex chars (got ${this.accountSid.length} chars)`);
    }
    if (!/^[0-9a-f]{32}$/i.test(authToken)) {
      formatProblems.push(`TWILIO_AUTH_TOKEN must be 32 hex chars (got ${authToken.length} chars - truncated or wrong value?)`);
    }
    if (!/^(\+\d{8,15}|MG[0-9a-f]{32})$/i.test(this.fromNumber)) {
      formatProblems.push('TWILIO_FROM_NUMBER must be E.164, e.g. +19842301820');
    }
    if (formatProblems.length) {
      this.configProblem = formatProblems.join('; ');
      this.logger.error(`❌ Twilio credentials look wrong: ${this.configProblem}. SMS will most likely fail.`);
    }

    try {
      const twilio = require('twilio');
      this.twilioClient = twilio(this.accountSid, authToken);
      this.logger.log(`Twilio client created (from ${this.fromNumber}). Verifying credentials...`);
    } catch (error) {
      this.configProblem = `Failed to load the twilio package: ${error.message}`;
      this.logger.error(`❌ ${this.configProblem}`);
    }
  }

  /** Check credentials with Twilio at boot (free, read-only) - result shows in the Render logs. */
  onModuleInit() {
    if (!this.twilioClient || process.env.NODE_ENV === 'test') return;
    this.verifyCredentials().catch(() => undefined);
  }

  /**
   * Ask Twilio who we are: proves SID + token are valid, tells whether the
   * account is a trial (can only text verified numbers) and whether
   * TWILIO_FROM_NUMBER belongs to it. Sends no SMS and costs nothing.
   */
  async verifyCredentials() {
    if (!this.twilioClient) {
      this.credentialCheck = { ok: false, error: this.configProblem || 'Twilio not configured', checkedAt: new Date() };
      return this.credentialCheck;
    }
    try {
      const account = await this.twilioClient.api.v2010.accounts(this.accountSid).fetch();
      let fromNumberOwned: boolean | undefined;
      if (this.fromNumber.startsWith('+')) {
        try {
          const owned = await this.twilioClient.incomingPhoneNumbers.list({ phoneNumber: this.fromNumber, limit: 1 });
          fromNumberOwned = owned.length > 0;
        } catch {
          fromNumberOwned = undefined;
        }
      }
      this.credentialCheck = {
        ok: account.status === 'active' && fromNumberOwned !== false,
        accountType: account.type, // 'Trial' | 'Full'
        accountStatus: account.status,
        fromNumberOwned,
        checkedAt: new Date(),
      };
      this.logger.log(
        `✅ Twilio credentials valid: account ${account.status}, type ${account.type}` +
          (fromNumberOwned === false ? ` - ❌ ${this.fromNumber} is NOT a number of this account!` : ''),
      );
      if (account.type === 'Trial') {
        this.logger.warn(
          '⚠️ Twilio TRIAL account: SMS are delivered ONLY to numbers verified in Twilio Console ' +
            '(Phone Numbers > Verified Caller IDs). Customers and restaurants will NOT receive SMS until the account is upgraded.',
        );
      }
    } catch (error) {
      const code = error?.code ?? error?.status;
      this.credentialCheck = {
        ok: false,
        error: error?.message || String(error),
        hint: TWILIO_HINTS[String(code)],
        checkedAt: new Date(),
      };
      this.logger.error(
        `❌ Twilio credential check FAILED (${code}): ${error?.message}. ${TWILIO_HINTS[String(code)] ?? ''} NO SMS will be delivered.`,
      );
    }
    return this.credentialCheck;
  }

  /** Subscribe to SMS failures (used by AdminNotificationService). */
  onFailure(listener: (f: SmsFailure) => void) {
    this.failureListeners.push(listener);
  }

  isConfigured(): boolean {
    return !!this.twilioClient;
  }

  getStatus() {
    return {
      configured: !!this.twilioClient,
      configProblem: this.configProblem,
      accountSid: this.accountSid ? `${this.accountSid.slice(0, 6)}...${this.accountSid.slice(-4)}` : undefined,
      fromNumber: this.fromNumber || undefined,
      credentialCheck: this.credentialCheck,
      sent: this.sentCount,
      failed: this.failedCount,
      lastSuccessAt: this.lastSuccessAt,
      lastFailure: this.lastFailure ? { ...this.lastFailure, to: maskPhone(this.lastFailure.to) } : undefined,
    };
  }

  private recordFailure(to: string, error: string, code?: number | string, hint?: string): SmsResult {
    this.failedCount++;
    const failure: SmsFailure = { to, code, error, hint, at: new Date() };
    this.lastFailure = failure;
    this.logger.error(`❌ SMS FAILED to ${to}${code ? ` [Twilio ${code}]` : ''}: ${error}${hint ? ` -> ${hint}` : ''}`);
    for (const l of this.failureListeners) {
      try {
        l(failure);
      } catch {
        /* a listener must never break SMS sending */
      }
    }
    return { success: false, to, code, error, hint };
  }

  /** Send one SMS and return the detailed result (never throws). */
  async send(to: string, message: string): Promise<SmsResult> {
    const phone = toE164(to);
    if (!phone) {
      return this.recordFailure(String(to), `Invalid phone number "${to}" (expected E.164, e.g. +250788123456)`, 'INVALID_NUMBER');
    }
    if (!this.twilioClient) {
      return this.recordFailure(phone, `Twilio not configured: ${this.configProblem || 'unknown reason'}`, 'NOT_CONFIGURED');
    }

    try {
      this.logger.log(`📤 Sending SMS to ${phone}: ${message.substring(0, 50)}...`);
      const params: any = { body: message, to: phone };
      if (this.fromNumber.startsWith('MG')) params.messagingServiceSid = this.fromNumber;
      else params.from = this.fromNumber;

      const result = await this.twilioClient.messages.create(params);
      this.sentCount++;
      this.lastSuccessAt = new Date();
      this.logger.log(`✅ SMS accepted by Twilio for ${phone} (SID ${result.sid}, status ${result.status})`);
      return { success: true, to: phone, sid: result.sid };
    } catch (error) {
      const code = error?.code ?? error?.status;
      return this.recordFailure(phone, error?.message || String(error), code, TWILIO_HINTS[String(code)]);
    }
  }

  /** Send SMS via Twilio. Returns true if Twilio accepted it. */
  async sendSms(to: string, message: string): Promise<boolean> {
    return (await this.send(to, message)).success;
  }

  /**
   * Send order created notification
   */
  async sendOrderCreated(phone: string, orderId: string, orderType: string, amount?: number): Promise<boolean> {
    const message = orderType === 'parcel'
      ? `Hi! Your parcel delivery #${orderId} has been created. ${amount ? `Total: ${amount} RWF. ` : ''}A courier will be assigned shortly. - Haraka`
      : `Hi! Your order #${orderId} has been created. ${amount ? `Total: ${amount} RWF. ` : ''}Please complete payment to confirm. - Haraka`;

    return this.sendSms(phone, message);
  }

  /**
   * Tell the restaurant a new PAID order is waiting in its app.
   */
  async sendNewOrderToRestaurant(phone: string, orderId: string, items: Array<{ name: string; quantity: number }> = [], amount?: number): Promise<boolean> {
    const count = items.reduce((n, i) => n + (Number(i?.quantity) || 1), 0);
    let summary = items.map((i) => `${i.quantity}x ${i.name}`).join(', ');
    if (summary.length > 70) summary = summary.slice(0, 67) + '...';
    const message =
      `Haraka: NEW PAID ORDER #${orderId}` +
      (count ? ` - ${count} item${count > 1 ? 's' : ''}${summary ? ` (${summary})` : ''}` : '') +
      (amount ? `, ${amount} RWF` : '') +
      '. Open the Haraka Restaurant app to accept it.';
    return this.sendSms(phone, message);
  }

  /**
   * Send payment confirmation
   */
  async sendPaymentConfirmed(phone: string, orderId: string, amount: number): Promise<boolean> {
    const message = `Payment confirmed! Your order #${orderId} (${amount} RWF) has been received. Thank you! - Haraka`;
    return this.sendSms(phone, message);
  }

  /**
   * Send order confirmed by restaurant
   */
  async sendOrderConfirmed(phone: string, orderId: string, restaurantName: string): Promise<boolean> {
    const message = `${restaurantName} has received your order #${orderId}. They will start preparing it soon! - Haraka`;
    return this.sendSms(phone, message);
  }

  /**
   * Send order preparing
   */
  async sendOrderPreparing(phone: string, orderId: string, restaurantName: string): Promise<boolean> {
    const message = `Good news! ${restaurantName} is now preparing your order #${orderId}. It will be ready soon! - Haraka`;
    return this.sendSms(phone, message);
  }

  /**
   * Send courier assigned
   */
  async sendCourierAssigned(phone: string, orderId: string): Promise<boolean> {
    const message = `A courier has been assigned to your order #${orderId}! They will pick it up once it's ready. - Haraka`;
    return this.sendSms(phone, message);
  }

  /**
   * Send courier arrived at pickup
   */
  async sendCourierArrivedAtPickup(phone: string, orderId: string, restaurantName: string): Promise<boolean> {
    const message = `Your courier has arrived at ${restaurantName} to pick up order #${orderId}. Your food will be on its way soon! - Haraka`;
    return this.sendSms(phone, message);
  }

  /**
   * Send order ready
   */
  async sendOrderReady(phone: string, orderId: string, orderType: string): Promise<boolean> {
    const message = orderType === 'food'
      ? `Your food order #${orderId} is ready! Our courier is on the way to pick it up. - Haraka`
      : `Your parcel #${orderId} is ready for pickup! Our courier will collect it soon. - Haraka`;

    return this.sendSms(phone, message);
  }

  /**
   * Send order picked up
   */
  async sendOrderPickedUp(phone: string, orderId: string, courierName: string, orderType: string): Promise<boolean> {
    const message = orderType === 'food'
      ? `Your order #${orderId} is on the way! Courier: ${courierName}. - Haraka`
      : `Your parcel #${orderId} is on the way! Courier: ${courierName}. - Haraka`;

    return this.sendSms(phone, message);
  }

  /**
   * Send order delivered
   */
  async sendOrderDelivered(phone: string, orderId: string, orderType: string): Promise<boolean> {
    const message = orderType === 'food'
      ? `Your order #${orderId} has been delivered! Enjoy your meal! Thank you for using Haraka!`
      : `Your parcel #${orderId} has been delivered! Thank you for using Haraka!`;

    return this.sendSms(phone, message);
  }

  /**
   * Tell the customer the restaurant could not accept the order.
   */
  async sendOrderCancelled(phone: string, orderId: string, restaurantName: string, reason: string, paid: boolean): Promise<boolean> {
    const why = reason ? ` Reason: ${reason.slice(0, 80)}.` : '';
    const refund = paid ? ' Your payment will be refunded to your Mobile Money account.' : '';
    const message = `Sorry, ${restaurantName} could not accept your order #${orderId}.${why}${refund} - Haraka`;
    return this.sendSms(phone, message);
  }

  async sendPaymentInitiated(phone: string, orderId: string, amount: number): Promise<boolean> {
    const message = `Please check your phone for the Mobile Money payment prompt to pay ${amount} RWF for order #${orderId}. - Haraka`;
    return this.sendSms(phone, message);
  }
}
