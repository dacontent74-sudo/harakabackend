import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly apiKey: string;
  private readonly username: string;
  private readonly senderId: string;
  private readonly baseUrl = 'https://api.africastalking.com/version1/messaging';

  constructor() {
    this.apiKey = process.env.AFRICASTALKING_API_KEY || '';
    this.username = process.env.AFRICASTALKING_USERNAME || '';
    this.senderId = process.env.AFRICASTALKING_SENDER_ID || 'HARAKA';
  }

  /**
   * Send SMS notification when order is ready
   */
  async sendOrderReadySms(data: {
    phone: string;
    customerName: string;
    orderId: string;
    restaurantName?: string;
  }) {
    try {
      const { phone, customerName, orderId, restaurantName } = data;

      // Format phone number for Rwanda (+250...)
      const formattedPhone = this.formatPhoneNumber(phone);

      const message = `Hi ${customerName}! 🎉 Great news! ${restaurantName || 'Your restaurant'} has finished preparing your order #${orderId.substring(0, 8).toUpperCase()}. A courier is on the way to pick it up and will deliver it to you soon. Estimated delivery: 30-45 mins. - Haraka Delivery`;

      const result = await this.sendSms(formattedPhone, message);

      this.logger.log(`✅ Order ready SMS sent to ${formattedPhone}`);
      return result;
    } catch (error) {
      this.logger.error(`❌ Failed to send order ready SMS: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send SMS when courier picks up the order
   */
  async sendOrderPickedUpSms(data: {
    phone: string;
    customerName: string;
    orderId: string;
    courierName: string;
    courierPhone: string;
  }) {
    try {
      const { phone, customerName, orderId, courierName, courierPhone } = data;

      const formattedPhone = this.formatPhoneNumber(phone);

      const message = `Hi ${customerName}! 🚴 Your order #${orderId.substring(0, 8).toUpperCase()} is out for delivery! Courier: ${courierName} (${courierPhone}). ETA: 15-20 mins. Your food will arrive fresh and hot! - Haraka Delivery`;

      const result = await this.sendSms(formattedPhone, message);

      this.logger.log(`✅ Order picked up SMS sent to ${formattedPhone}`);
      return result;
    } catch (error) {
      this.logger.error(`❌ Failed to send picked up SMS: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send SMS when order is delivered
   */
  async sendOrderDeliveredSms(data: {
    phone: string;
    customerName: string;
    orderId: string;
  }) {
    try {
      const { phone, customerName, orderId } = data;

      const formattedPhone = this.formatPhoneNumber(phone);

      const message = `Hi ${customerName}! ✅ Your order #${orderId.substring(0, 8).toUpperCase()} has been delivered! Thank you for choosing Haraka. Enjoy your meal! 🍽️ - Haraka Delivery`;

      const result = await this.sendSms(formattedPhone, message);

      this.logger.log(`✅ Order delivered SMS sent to ${formattedPhone}`);
      return result;
    } catch (error) {
      this.logger.error(`❌ Failed to send delivered SMS: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Core SMS sending function using Africa's Talking
   */
  private async sendSms(to: string, message: string) {
    try {
      // Check if API credentials are configured
      if (!this.apiKey || !this.username) {
        this.logger.warn('⚠️ Africa\'s Talking credentials not configured - SMS not sent');
        return {
          success: false,
          error: 'SMS service not configured',
          skipped: true,
        };
      }

      const params = new URLSearchParams({
        username: this.username,
        to: to,
        message: message,
        from: this.senderId,
      });

      const response = await axios.post(this.baseUrl, params.toString(), {
        headers: {
          'apiKey': this.apiKey,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
      });

      if (response.data.SMSMessageData?.Recipients?.length > 0) {
        const recipient = response.data.SMSMessageData.Recipients[0];

        if (recipient.status === 'Success') {
          return {
            success: true,
            messageId: recipient.messageId,
            cost: recipient.cost,
          };
        } else {
          this.logger.error(`SMS failed: ${recipient.status}`);
          return {
            success: false,
            error: recipient.status,
          };
        }
      }

      return {
        success: false,
        error: 'No response from SMS gateway',
      };
    } catch (error) {
      this.logger.error(`❌ SMS sending error: ${error.message}`);

      // Don't throw - SMS failure shouldn't block order flow
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Format phone number for Rwanda
   * Accepts: 0788123456, 788123456, +250788123456
   * Returns: +250788123456
   */
  private formatPhoneNumber(phone: string): string {
    // Remove any spaces or dashes
    let cleaned = phone.replace(/[\s-]/g, '');

    // If starts with 0, replace with +250
    if (cleaned.startsWith('0')) {
      return '+250' + cleaned.substring(1);
    }

    // If starts with 250, add +
    if (cleaned.startsWith('250')) {
      return '+' + cleaned;
    }

    // If doesn't start with +, assume it's a local number
    if (!cleaned.startsWith('+')) {
      return '+250' + cleaned;
    }

    return cleaned;
  }

  /**
   * Send custom SMS (for testing or other purposes)
   */
  async sendCustomSms(phone: string, message: string) {
    try {
      const formattedPhone = this.formatPhoneNumber(phone);
      const result = await this.sendSms(formattedPhone, message);

      this.logger.log(`✅ Custom SMS sent to ${formattedPhone}`);
      return result;
    } catch (error) {
      this.logger.error(`❌ Failed to send custom SMS: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}
