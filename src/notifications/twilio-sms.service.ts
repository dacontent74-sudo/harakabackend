import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TwilioSmsService {
  private readonly logger = new Logger(TwilioSmsService.name);
  private twilioClient: any;
  private fromNumber: string;

  constructor(private configService: ConfigService) {
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    this.fromNumber = this.configService.get<string>('TWILIO_FROM_NUMBER');

    if (!accountSid || !authToken || !this.fromNumber) {
      this.logger.warn('⚠️ Twilio credentials not configured. SMS will not be sent.');
      return;
    }

    try {
      // Dynamically import Twilio (since it's not installed yet)
      const twilio = require('twilio');
      this.twilioClient = twilio(accountSid, authToken);
      this.logger.log('✅ Twilio SMS service initialized successfully');
    } catch (error) {
      this.logger.error('❌ Failed to initialize Twilio:', error.message);
    }
  }

  /**
   * Send SMS via Twilio
   */
  async sendSms(to: string, message: string): Promise<boolean> {
    if (!this.twilioClient) {
      this.logger.error('❌ Twilio client not initialized');
      return false;
    }

    try {
      this.logger.log(`📤 Sending SMS to ${to}: ${message.substring(0, 50)}...`);

      const result = await this.twilioClient.messages.create({
        body: message,
        from: this.fromNumber,
        to: to,
      });

      this.logger.log(`✅ SMS sent successfully! SID: ${result.sid}`);
      return true;
    } catch (error) {
      this.logger.error(`❌ Failed to send SMS to ${to}:`, error.message);
      return false;
    }
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
   * Send payment initiated notification
   */
  async sendPaymentInitiated(phone: string, orderId: string, amount: number): Promise<boolean> {
    const message = `Please check your phone for the Mobile Money payment prompt to pay ${amount} RWF for order #${orderId}. - Haraka`;
    return this.sendSms(phone, message);
  }
}
