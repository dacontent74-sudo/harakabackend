import { Injectable, Logger } from '@nestjs/common';
import { Twilio } from 'twilio';

/**
 * 💬 WhatsApp Business API Service (via Twilio)
 *
 * Cost: ~$0.008 per message (40x cheaper than SMS!)
 *
 * Requirements:
 * 1. WhatsApp Business verified account
 * 2. Pre-approved message templates
 * 3. Customer opt-in required
 *
 * Setup: https://www.twilio.com/docs/whatsapp/tutorial/connect-number-business-profile
 */
@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private client: Twilio | null = null;
  private fromNumber: string = '';
  private isConfigured: boolean = false;

  constructor() {
    this.initialize();
  }

  private initialize() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER; // Format: whatsapp:+14155238886

    if (!accountSid || !authToken || !whatsappNumber) {
      this.logger.warn(
        '⚠️ WhatsApp NOT configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_NUMBER'
      );
      return;
    }

    // Validate WhatsApp number format
    if (!whatsappNumber.startsWith('whatsapp:+')) {
      this.logger.error(
        `❌ TWILIO_WHATSAPP_NUMBER must start with "whatsapp:+" (got: ${whatsappNumber})`
      );
      return;
    }

    try {
      this.client = new Twilio(accountSid, authToken);
      this.fromNumber = whatsappNumber;
      this.isConfigured = true;
      this.logger.log(`✅ WhatsApp configured (from ${whatsappNumber})`);
    } catch (error) {
      this.logger.error(`❌ WhatsApp initialization failed: ${error.message}`);
    }
  }

  /**
   * Format phone number for WhatsApp
   * Input: +250788123456 or 0788123456
   * Output: whatsapp:+250788123456
   */
  private formatWhatsAppNumber(phone: string): string {
    if (!phone) return '';

    let cleaned = phone.replace(/\s+/g, '').replace(/[^0-9+]/g, '');

    // Rwanda: convert 078... to +2507...
    if (cleaned.startsWith('07')) {
      cleaned = '+25' + cleaned;
    } else if (cleaned.startsWith('25') && !cleaned.startsWith('+')) {
      cleaned = '+' + cleaned;
    }

    return `whatsapp:${cleaned}`;
  }

  /**
   * Send WhatsApp message using approved template
   */
  private async sendMessage(to: string, body: string): Promise<boolean> {
    if (!this.isConfigured || !this.client) {
      this.logger.warn('⚠️ WhatsApp not configured - message not sent');
      return false;
    }

    const toWhatsApp = this.formatWhatsAppNumber(to);

    try {
      this.logger.log(`💬 Sending WhatsApp to ${toWhatsApp}: ${body.substring(0, 50)}...`);

      const message = await this.client.messages.create({
        from: this.fromNumber,
        to: toWhatsApp,
        body,
      });

      this.logger.log(`✅ WhatsApp sent (SID: ${message.sid}, status: ${message.status})`);
      return true;
    } catch (error: any) {
      const errorCode = error?.code;
      const errorMsg = error?.message || String(error);

      this.logger.error(`❌ WhatsApp FAILED to ${toWhatsApp} [${errorCode}]: ${errorMsg}`);

      // Common errors
      if (errorCode === 63016) {
        this.logger.warn('⚠️ Message template not approved. Approve templates in Twilio Console.');
      } else if (errorCode === 21211) {
        this.logger.warn('⚠️ Invalid WhatsApp number format');
      } else if (errorCode === 63007) {
        this.logger.warn('⚠️ Customer has not opted in to receive WhatsApp messages');
      }

      return false;
    }
  }

  /**
   * 💳 Payment confirmed notification
   * Template: payment_confirmed
   */
  async sendPaymentConfirmed(phone: string, orderId: string, amount: number): Promise<boolean> {
    const message = `✅ Payment confirmed!\n\nOrder #${orderId}\nAmount: ${amount.toLocaleString()} RWF\n\nYour order is being prepared. We'll notify you when it's ready for delivery.\n\nHaraka - Fast Delivery`;
    return this.sendMessage(phone, message);
  }

  /**
   * 🍽️ New order notification to restaurant
   * Template: new_order_restaurant
   */
  async sendNewOrderToRestaurant(phone: string, orderId: string, items: any[], total: number): Promise<boolean> {
    const itemsList = items
      .map((item) => `${item.quantity}x ${item.name}`)
      .join('\n');

    const message = `🔔 NEW ORDER!\n\nOrder #${orderId}\n\n${itemsList}\n\nTotal: ${total.toLocaleString()} RWF\n\nPlease prepare this order.\n\nHaraka`;
    return this.sendMessage(phone, message);
  }

  /**
   * 🏍️ Courier on the way
   * Template: courier_on_way
   */
  async sendCourierOnTheWay(phone: string, orderId: string, courierName: string): Promise<boolean> {
    const message = `🏍️ Your order is on the way!\n\nOrder #${orderId}\nCourier: ${courierName}\n\nEstimated arrival: 15-30 minutes\n\nHaraka - Fast Delivery`;
    return this.sendMessage(phone, message);
  }

  /**
   * ✅ Order delivered
   * Template: order_delivered
   */
  async sendOrderDelivered(phone: string, orderId: string, orderType: string): Promise<boolean> {
    const emoji = orderType === 'parcel' ? '📦' : '🍽️';
    const message = `${emoji} Delivered!\n\nOrder #${orderId} has been successfully delivered.\n\nThank you for using Haraka!\n\nRate your experience: [link]\n\nHaraka - Fast Delivery`;
    return this.sendMessage(phone, message);
  }

  /**
   * 📦 Order picked up (for customer)
   * Template: order_picked_up
   */
  async sendOrderPickedUp(phone: string, orderId: string, courierName: string, orderType: string): Promise<boolean> {
    const emoji = orderType === 'parcel' ? '📦' : '🍽️';
    const message = `${emoji} Order picked up!\n\nOrder #${orderId}\nCourier: ${courierName}\n\nYour order is on the way to you now.\n\nHaraka - Fast Delivery`;
    return this.sendMessage(phone, message);
  }

  /**
   * Check if WhatsApp is configured
   */
  isWhatsAppConfigured(): boolean {
    return this.isConfigured;
  }

  /**
   * Get configuration status for health checks
   */
  getStatus() {
    return {
      configured: this.isConfigured,
      fromNumber: this.fromNumber || 'Not set',
      ready: this.isConfigured && !!this.client,
    };
  }
}
