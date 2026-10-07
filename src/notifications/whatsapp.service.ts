import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Client, LocalAuth } from 'whatsapp-web.js';
import * as qrcode from 'qrcode-terminal';

@Injectable()
export class WhatsAppService implements OnModuleInit {
  private readonly logger = new Logger(WhatsAppService.name);
  private client: Client;
  private isReady = false;
  private qrCode: string | null = null;

  async onModuleInit() {
    this.logger.log('🚀 Initializing WhatsApp client...');

    this.client = new Client({
      authStrategy: new LocalAuth({
        dataPath: './whatsapp-session', // Session stored here
      }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    });

    // QR Code event - User needs to scan this
    this.client.on('qr', (qr) => {
      this.qrCode = qr;
      this.logger.log('📱 QR CODE RECEIVED - Scan with WhatsApp:');
      qrcode.generate(qr, { small: true });
      this.logger.log('👆 Scan the QR code above with WhatsApp app');
      this.logger.log('Or get QR code via: GET /notifications/whatsapp/qr');
    });

    // Authenticated event
    this.client.on('authenticated', () => {
      this.logger.log('✅ WhatsApp authenticated successfully!');
      this.qrCode = null; // Clear QR after auth
    });

    // Ready event
    this.client.on('ready', () => {
      this.isReady = true;
      this.logger.log('🎉 WhatsApp client is READY! Messages can now be sent.');
    });

    // Disconnected event
    this.client.on('disconnected', (reason) => {
      this.isReady = false;
      this.logger.error(`❌ WhatsApp disconnected: ${reason}`);
    });

    // Initialize the client
    try {
      await this.client.initialize();
    } catch (error) {
      this.logger.error('❌ Failed to initialize WhatsApp:', error.message);
    }
  }

  /**
   * Get current QR code (if available)
   */
  getQRCode(): string | null {
    return this.qrCode;
  }

  /**
   * Check if WhatsApp is ready
   */
  isClientReady(): boolean {
    return this.isReady;
  }

  /**
   * Send WhatsApp message
   * @param phoneNumber - Phone number in format: +250788123456
   * @param message - Message text
   */
  async sendMessage(phoneNumber: string, message: string): Promise<boolean> {
    if (!this.isReady) {
      this.logger.warn('⚠️ WhatsApp not ready yet. Message queued (not implemented).');
      // In production, you could queue messages and retry
      return false;
    }

    try {
      // WhatsApp format: Remove + and add @c.us
      // Example: +250788123456 → 250788123456@c.us
      const chatId = phoneNumber.replace('+', '') + '@c.us';

      this.logger.log(`📤 Sending WhatsApp to ${phoneNumber}: ${message}`);

      await this.client.sendMessage(chatId, message);

      this.logger.log(`✅ WhatsApp sent successfully to ${phoneNumber}`);
      return true;
    } catch (error) {
      this.logger.error(`❌ Failed to send WhatsApp to ${phoneNumber}:`, error.message);
      return false;
    }
  }

  /**
   * Send order ready notification
   */
  async sendOrderReady(phoneNumber: string, orderType: string, orderId: string): Promise<boolean> {
    const message = orderType === 'food'
      ? `🍽️ *Haraka Order Ready*\n\nYour food order #${orderId} is ready!\n\nOur courier is on the way to pick it up.`
      : `📦 *Haraka Parcel Update*\n\nYour parcel #${orderId} is ready for pickup!\n\nOur courier will collect it soon.`;

    return this.sendMessage(phoneNumber, message);
  }

  /**
   * Send order picked up notification
   */
  async sendOrderPickedUp(phoneNumber: string, orderType: string, orderId: string, courierName: string): Promise<boolean> {
    const message = orderType === 'food'
      ? `🚗 *Haraka Delivery Started*\n\nYour food order #${orderId} has been picked up!\n\n👤 Courier: ${courierName}\n\nYour order is on the way! 🎉`
      : `🚗 *Haraka Parcel In Transit*\n\nYour parcel #${orderId} is on the way!\n\n👤 Courier: ${courierName}\n\nDelivery in progress! 📦`;

    return this.sendMessage(phoneNumber, message);
  }

  /**
   * Send order delivered notification
   */
  async sendOrderDelivered(phoneNumber: string, orderType: string, orderId: string): Promise<boolean> {
    const message = orderType === 'food'
      ? `✅ *Haraka Order Delivered*\n\nYour food order #${orderId} has been delivered!\n\nEnjoy your meal! 🍽️\n\nThank you for using Haraka!`
      : `✅ *Haraka Parcel Delivered*\n\nYour parcel #${orderId} has been delivered!\n\nThank you for using Haraka! 📦`;

    return this.sendMessage(phoneNumber, message);
  }

  /**
   * Send payment confirmation
   */
  async sendPaymentConfirmation(phoneNumber: string, amount: number, orderId: string): Promise<boolean> {
    const message = `💰 *Haraka Payment Confirmed*\n\nPayment received: ${amount} RWF\nOrder: #${orderId}\n\nThank you! Your order is being processed. 🎉`;

    return this.sendMessage(phoneNumber, message);
  }

  /**
   * Send courier assigned notification
   */
  async sendCourierAssigned(phoneNumber: string, orderId: string, courierName: string, courierPhone: string): Promise<boolean> {
    const message = `👤 *Haraka Courier Assigned*\n\nOrder: #${orderId}\nCourier: ${courierName}\nPhone: ${courierPhone}\n\nYour order will be delivered soon! 🚀`;

    return this.sendMessage(phoneNumber, message);
  }
}
