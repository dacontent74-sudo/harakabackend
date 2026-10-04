import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor() {
    // Configure email transporter (Gmail SMTP)
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER, // Your Gmail address
        pass: process.env.EMAIL_PASSWORD, // Gmail app password
      },
    });
  }

  /**
   * Send email notification when order is ready
   */
  async sendOrderReadyEmail(data: {
    to: string;
    customerName: string;
    orderId: string;
    restaurantName?: string;
    estimatedDeliveryTime?: string;
  }) {
    try {
      const { to, customerName, orderId, restaurantName, estimatedDeliveryTime } = data;

      const mailOptions = {
        from: `"Haraka Delivery" <${process.env.EMAIL_USER}>`,
        to: to,
        subject: '🎉 Your Order is Ready & On The Way! - Haraka Delivery',
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f5f5f5;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 20px auto;
      background-color: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    .header {
      background: linear-gradient(135deg, #FF6B00 0%, #FF8C00 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: bold;
    }
    .header p {
      margin: 10px 0 0 0;
      font-size: 16px;
      opacity: 0.95;
    }
    .content {
      padding: 30px;
    }
    .greeting {
      font-size: 18px;
      color: #333;
      margin-bottom: 20px;
    }
    .status-badge {
      display: inline-block;
      background-color: #4CAF50;
      color: white;
      padding: 10px 20px;
      border-radius: 25px;
      font-size: 14px;
      font-weight: bold;
      margin: 15px 0;
    }
    .order-info {
      background-color: #f9f9f9;
      border-left: 4px solid #FF6B00;
      padding: 20px;
      margin: 20px 0;
      border-radius: 6px;
    }
    .order-info h3 {
      margin-top: 0;
      color: #FF6B00;
      font-size: 16px;
    }
    .order-info p {
      margin: 8px 0;
      color: #555;
      line-height: 1.6;
    }
    .order-info strong {
      color: #333;
    }
    .message {
      color: #555;
      line-height: 1.8;
      font-size: 15px;
      margin: 20px 0;
    }
    .timeline {
      margin: 25px 0;
      padding: 20px;
      background-color: #fff8f0;
      border-radius: 8px;
    }
    .timeline h4 {
      color: #FF6B00;
      margin-top: 0;
      font-size: 16px;
    }
    .timeline-step {
      display: flex;
      align-items: center;
      margin: 12px 0;
      padding: 8px 0;
    }
    .timeline-step .icon {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background-color: #4CAF50;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      margin-right: 12px;
      font-weight: bold;
    }
    .timeline-step.pending .icon {
      background-color: #ddd;
      color: #999;
    }
    .timeline-step .text {
      color: #333;
      font-size: 14px;
    }
    .timeline-step.pending .text {
      color: #999;
    }
    .footer {
      background-color: #f9f9f9;
      padding: 25px 30px;
      text-align: center;
      color: #777;
      font-size: 13px;
      border-top: 1px solid #eee;
    }
    .footer p {
      margin: 5px 0;
    }
    .footer a {
      color: #FF6B00;
      text-decoration: none;
    }
    .emoji {
      font-size: 1.3em;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚀 Order Ready!</h1>
      <p>Your delicious food is on its way</p>
    </div>

    <div class="content">
      <div class="greeting">
        Hi <strong>${customerName}</strong>,
      </div>

      <div class="status-badge">
        ✓ Ready for Delivery
      </div>

      <div class="message">
        <p>Great news! ${restaurantName ? `<strong>${restaurantName}</strong>` : 'Your restaurant'} has finished preparing your order, and a courier is on the way to pick it up!</p>
      </div>

      <div class="order-info">
        <h3>📦 Order Details</h3>
        <p><strong>Order ID:</strong> #${orderId.substring(0, 8).toUpperCase()}</p>
        ${restaurantName ? `<p><strong>Restaurant:</strong> ${restaurantName}</p>` : ''}
        ${estimatedDeliveryTime ? `<p><strong>Estimated Delivery:</strong> ${estimatedDeliveryTime}</p>` : '<p><strong>Estimated Delivery:</strong> 30-45 minutes</p>'}
      </div>

      <div class="timeline">
        <h4>📍 Delivery Timeline</h4>
        <div class="timeline-step">
          <div class="icon">✓</div>
          <div class="text">Order confirmed & payment received</div>
        </div>
        <div class="timeline-step">
          <div class="icon">✓</div>
          <div class="text">Restaurant preparing your food</div>
        </div>
        <div class="timeline-step">
          <div class="icon">✓</div>
          <div class="text"><strong>Food ready - Courier dispatched</strong></div>
        </div>
        <div class="timeline-step pending">
          <div class="icon">→</div>
          <div class="text">Courier picking up from restaurant</div>
        </div>
        <div class="timeline-step pending">
          <div class="icon">→</div>
          <div class="text">On the way to you</div>
        </div>
        <div class="timeline-step pending">
          <div class="icon">→</div>
          <div class="text">Delivered!</div>
        </div>
      </div>

      <div class="message">
        <p style="color: #4CAF50; font-weight: 500;">
          <span class="emoji">🎉</span> Your food will arrive fresh and hot!
        </p>
        <p style="font-size: 14px; color: #777; margin-top: 20px;">
          You'll receive another notification once your order is out for delivery with courier details.
        </p>
      </div>
    </div>

    <div class="footer">
      <p><strong>Haraka Delivery</strong></p>
      <p>Fast, Reliable, Delicious</p>
      <p style="margin-top: 15px;">
        Need help? <a href="mailto:${process.env.EMAIL_USER}">Contact Support</a>
      </p>
      <p style="margin-top: 10px; font-size: 12px; color: #999;">
        This is an automated notification. Please do not reply to this email.
      </p>
    </div>
  </div>
</body>
</html>
        `,
      };

      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(`✅ Order ready email sent to ${to}: ${info.messageId}`);

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error) {
      this.logger.error(`❌ Failed to send order ready email: ${error.message}`);
      // Don't throw error - email failure shouldn't block order flow
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Send email when courier picks up the order
   */
  async sendOrderPickedUpEmail(data: {
    to: string;
    customerName: string;
    orderId: string;
    courierName: string;
    courierPhone: string;
    estimatedDeliveryTime?: string;
  }) {
    try {
      const { to, customerName, orderId, courierName, courierPhone, estimatedDeliveryTime } = data;

      const mailOptions = {
        from: `"Haraka Delivery" <${process.env.EMAIL_USER}>`,
        to: to,
        subject: '🚴 Your Order is Out for Delivery! - Haraka Delivery',
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background-color: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #FF6B00 0%, #FF8C00 100%); color: white; padding: 30px; text-align: center; }
    .content { padding: 30px; }
    .courier-info { background-color: #fff8f0; border-left: 4px solid #4CAF50; padding: 20px; margin: 20px 0; border-radius: 6px; }
    .footer { background-color: #f9f9f9; padding: 20px; text-align: center; color: #777; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚴 Out for Delivery!</h1>
    </div>
    <div class="content">
      <p>Hi <strong>${customerName}</strong>,</p>
      <p>Your order <strong>#${orderId.substring(0, 8).toUpperCase()}</strong> has been picked up and is on the way to you!</p>
      <div class="courier-info">
        <h3 style="color: #FF6B00; margin-top: 0;">🏍️ Your Courier</h3>
        <p><strong>Name:</strong> ${courierName}</p>
        <p><strong>Phone:</strong> ${courierPhone}</p>
        ${estimatedDeliveryTime ? `<p><strong>ETA:</strong> ${estimatedDeliveryTime}</p>` : '<p><strong>ETA:</strong> 15-20 minutes</p>'}
      </div>
      <p style="color: #4CAF50; font-weight: 500;">Your food will arrive shortly!</p>
    </div>
    <div class="footer">
      <p><strong>Haraka Delivery</strong> - Fast, Reliable, Delicious</p>
    </div>
  </div>
</body>
</html>
        `,
      };

      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(`✅ Order picked up email sent to ${to}: ${info.messageId}`);

      return { success: true, messageId: info.messageId };
    } catch (error) {
      this.logger.error(`❌ Failed to send picked up email: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send location confirmation link to restaurant owner
   */
  async sendLocationConfirmationEmail(data: {
    to: string;
    restaurantName: string;
    confirmationLink: string;
    expiryHours?: number;
  }) {
    try {
      const { to, restaurantName, confirmationLink, expiryHours = 24 } = data;

      const mailOptions = {
        from: `"Haraka Delivery" <${process.env.EMAIL_USER}>`,
        to: to,
        subject: '📍 Confirm Your Restaurant Location - Haraka Delivery',
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background-color: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #FF6B00 0%, #FF8C00 100%); color: white; padding: 30px; text-align: center; }
    .content { padding: 30px; }
    .button { display: inline-block; background: linear-gradient(135deg, #FF6B00 0%, #FF8C00 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
    .info-box { background-color: #fff8f0; border-left: 4px solid #FF6B00; padding: 20px; margin: 20px 0; border-radius: 6px; }
    .footer { background-color: #f9f9f9; padding: 20px; text-align: center; color: #777; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📍 Confirm Your Location</h1>
    </div>
    <div class="content">
      <p>Dear <strong>${restaurantName}</strong> Team,</p>
      <p>Welcome to Haraka Delivery! To ensure accurate delivery calculations, we need to confirm your restaurant's exact GPS location.</p>

      <div class="info-box">
        <h3 style="color: #FF6B00; margin-top: 0;">🎯 Why This Matters</h3>
        <p style="margin: 8px 0; color: #555;">
          Your GPS coordinates are used to:
        </p>
        <ul style="margin: 8px 0 0 20px; color: #555;">
          <li>Calculate delivery distances accurately</li>
          <li>Determine fair delivery fees</li>
          <li>Match you with nearby couriers</li>
          <li>Show your restaurant to customers in your area</li>
        </ul>
      </div>

      <p><strong>📱 How to Confirm:</strong></p>
      <ol style="line-height: 1.8; color: #555;">
        <li>Go to your restaurant location (must be physically there)</li>
        <li>Click the button below from your phone or computer</li>
        <li>Allow location access when prompted</li>
        <li>Confirm your GPS coordinates</li>
      </ol>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${confirmationLink}" class="button" style="color: white;">
          📍 Confirm My Location
        </a>
      </div>

      <div style="background-color: #FEF2F2; border-left: 4px solid #DC2626; padding: 15px; margin: 20px 0; border-radius: 6px;">
        <p style="margin: 0; color: #991B1B; font-size: 13px;">
          <strong>⚠️ Important:</strong> This link expires in ${expiryHours} hours. You must be physically at your restaurant location when confirming.
        </p>
      </div>

      <p style="color: #777; font-size: 13px; margin-top: 30px;">
        If the button doesn't work, copy and paste this link into your browser:<br/>
        <a href="${confirmationLink}" style="color: #FF6B00; word-break: break-all;">${confirmationLink}</a>
      </p>
    </div>
    <div class="footer">
      <p><strong>Haraka Delivery</strong> - Fast, Reliable, Delicious</p>
      <p style="margin-top: 10px;">Need help? Contact support at ${process.env.EMAIL_USER}</p>
    </div>
  </div>
</body>
</html>
        `,
      };

      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(`✅ Location confirmation email sent to ${to}: ${info.messageId}`);

      return { success: true, messageId: info.messageId };
    } catch (error) {
      this.logger.error(`❌ Failed to send location confirmation email: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}
