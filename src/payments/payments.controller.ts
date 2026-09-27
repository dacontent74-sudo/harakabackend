import { Controller, Post, Get, Body, Param, Logger, UseGuards, HttpCode } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { OrdersService } from '../orders/orders.service';
import { WebhookGuard } from './guards/webhook.guard';
import { IdempotencyService } from './services/idempotency.service';
import { SmsService } from '../notifications/sms.service';

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly ordersService: OrdersService,
    private readonly idempotencyService: IdempotencyService,
    private readonly smsService: SmsService,
  ) {}

  /**
   * Initiate payment for an order
   */
  @Post('initiate')
  async initiatePayment(@Body() dto: {
    orderId: string;
    phoneNumber: string;
  }) {
    this.logger.log(`💳 Payment initiation for order: ${dto.orderId}`);
    this.logger.log(`📱 Phone number received: ${dto.phoneNumber}`);

    // Get order details
    const order = await this.ordersService.getOrderById(dto.orderId);
    if (!order) {
      this.logger.error(`❌ Order not found: ${dto.orderId}`);
      return {
        success: false,
        message: 'Order not found',
      };
    }

    // Get amount from order
    const amount = order.total || order.pricing?.total || 0;
    this.logger.log(`💰 Order amount: ${amount} RWF`);

    if (amount <= 0) {
      this.logger.error(`❌ Invalid amount: ${amount}`);
      return {
        success: false,
        message: 'Invalid order amount',
      };
    }

    // Initiate PawaPay deposit
    const result = await this.paymentsService.initiateDeposit({
      orderId: dto.orderId,
      amount,
      phoneNumber: dto.phoneNumber,
      description: 'Haraka Order', // Max 22 chars for PawaPay
    });

    this.logger.log(`📊 PawaPay result:`, JSON.stringify(result, null, 2));

    // Update order with payment info
    if (result.success) {
      order.paymentStatus = 'pending';
      order.depositId = result.depositId;
      await this.ordersService.updateOrder(order);
      this.logger.log(`✅ Order updated with payment info`);

      // 📱 SMS NOTIFICATION: Payment Initiated
      const customerPhone = order.senderPhone || order.recipientPhone || order.customerPhone;
      const customerName = order.senderName || order.recipientName || 'Customer';

      if (customerPhone) {
        this.logger.log(`📱 Sending "payment initiated" SMS to ${customerPhone}`);
        this.smsService.sendCustomSms(
          customerPhone,
          `Hi ${customerName}! Please check your phone for the Mobile Money payment prompt to pay ${Math.round(amount)} RWF for order #${order.id.substring(0, 8).toUpperCase()}. - Haraka Delivery`
        ).catch(err => this.logger.error(`SMS send failed: ${err.message}`));
      }
    } else {
      this.logger.error(`❌ Payment failed:`, result.error);
    }

    return result;
  }

  /**
   * Check payment status (used for polling)
   */
  @Get('status/:depositId')
  async checkStatus(@Param('depositId') depositId: string) {
    this.logger.log(`📊 Checking payment status for depositId: ${depositId}`);
    const result = await this.paymentsService.checkDepositStatus(depositId);

    // If payment completed, update order
    if (result.success && result.status === 'COMPLETED') {
      this.logger.log(`✅ Payment COMPLETED for depositId: ${depositId}`);

      // Find order by depositId (depositId is a UUID, not orderId-timestamp)
      const order = await this.ordersService.getOrderByDepositId(depositId);

      if (order) {
        this.logger.log(`✅ Found order: ${order.id}, current payment status: ${order.paymentStatus}`);

        if (order.paymentStatus !== 'paid') {
          order.paymentStatus = 'paid';
          order.status = 'confirmed';
          order.confirmedAt = new Date(); // Track when payment confirmed
          await this.ordersService.updateOrder(order);
          this.logger.log(`✅ Payment confirmed and order ${order.id} updated via polling`);
        } else {
          this.logger.log(`ℹ️ Order ${order.id} already marked as paid`);
        }
      } else {
        this.logger.error(`❌ No order found with depositId: ${depositId}`);
      }
    } else {
      this.logger.log(`⏳ Payment status: ${result.status || 'unknown'}`);
    }

    return result;
  }

  /**
   * Debug endpoint - ONLY for development/testing
   * SECURITY: Disabled in production
   */
  @Post('debug')
  async debugPayment(@Body() dto: {
    phoneNumber: string;
    amount: number;
  }) {
    // SECURITY: Block in production
    if (process.env.NODE_ENV === 'production') {
      this.logger.warn('⚠️ Debug endpoint called in production - BLOCKED');
      return {
        success: false,
        error: 'Debug endpoint not available in production',
      };
    }

    const testOrderId = 'TEST-' + Date.now();
    const result = await this.paymentsService.debugPayload({
      orderId: testOrderId,
      amount: dto.amount,
      phoneNumber: dto.phoneNumber,
      description: `Test Payment`,
    });

    return result;
  }

  /**
   * PawaPay webhook endpoint - SECURED with IP whitelist and idempotency
   */
  @Post('webhooks/pawapay')
  @UseGuards(WebhookGuard)
  @HttpCode(200)
  async handleWebhook(@Body() payload: any) {
    this.logger.log('🔔 PawaPay webhook received:', JSON.stringify(payload, null, 2));

    try {
      const depositId = payload.depositId;
      const status = payload.status;

      // Validate payload
      if (!depositId || !status) {
        this.logger.error('❌ Invalid webhook payload: missing depositId or status');
        return { success: false, error: 'Invalid payload' };
      }

      this.logger.log(`📊 Webhook - depositId: ${depositId}, status: ${status}`);

      // Check idempotency - prevent duplicate processing
      if (this.idempotencyService.isProcessed(depositId, status)) {
        this.logger.warn(`⚠️ Duplicate webhook ignored: ${depositId}-${status}`);
        return { success: true, message: 'Already processed' };
      }

      // Mark as processed BEFORE updating database
      this.idempotencyService.markProcessed(depositId, status);

      if (status === 'COMPLETED') {
        // Find order by depositId
        const order = await this.ordersService.getOrderByDepositId(depositId);

        if (order) {
          this.logger.log(`✅ Found order: ${order.id}, current payment status: ${order.paymentStatus}`);

          // Double-payment prevention
          if (order.paymentStatus === 'paid') {
            this.logger.warn(`⚠️ Order ${order.id} already marked as paid - potential double payment attempt`);
            return { success: true, message: 'Already paid' };
          }

          // Update order payment status
          order.paymentStatus = 'paid';
          order.status = 'confirmed';
          await this.ordersService.updateOrder(order);
          this.logger.log(`✅ Payment webhook: Order ${order.id} confirmed and marked as paid`);

          // 📱 SMS NOTIFICATION: Payment Confirmed
          const customerPhone = order.senderPhone || order.recipientPhone || order.customerPhone;
          const customerName = order.senderName || order.recipientName || 'Customer';

          if (customerPhone) {
            this.logger.log(`📱 Sending "payment confirmed" SMS to ${customerPhone}`);
            this.smsService.sendCustomSms(
              customerPhone,
              `Hi ${customerName}! Payment confirmed! ✅ Your order #${order.id.substring(0, 8).toUpperCase()} (${Math.round(order.total || 0)} RWF) has been sent to ${order.restaurant || order.restaurantName || 'the restaurant'}. They will start preparing it soon. - Haraka Delivery`
            ).catch(err => this.logger.error(`SMS send failed: ${err.message}`));
          }
        } else {
          this.logger.error(`❌ No order found with depositId: ${depositId}`);
          return { success: false, error: 'Order not found' };
        }
      } else if (status === 'FAILED' || status === 'REJECTED') {
        this.logger.error(`❌ Payment webhook: Payment ${status} for ${depositId}`);

        // Update order payment status to failed
        const order = await this.ordersService.getOrderByDepositId(depositId);
        if (order) {
          order.paymentStatus = 'failed';
          await this.ordersService.updateOrder(order);
          this.logger.log(`📝 Order ${order.id} marked as payment failed`);
        }
      }

      return { success: true };
    } catch (error) {
      this.logger.error('❌ Webhook error:', error);
      return { success: false, error: 'Internal error' }; // Don't expose error details
    }
  }

  // Webhook URL for PawaPay dashboard:
  // https://harakabackend.onrender.com/api/v1/payments/webhooks/pawapay

  /**
   * Collect payment from receiver on delivery (for receiver-pays orders)
   * SECURITY: Amount comes from order in database, NOT from client request
   */
  @Post('collect-receiver')
  async collectReceiverPayment(
    @Body() dto: { orderId: string; phoneNumber: string },
  ) {
    this.logger.log(`💰 Collecting payment from receiver for order ${dto.orderId}`);
    this.logger.log(`📱 Phone: ${dto.phoneNumber}`);

    try {
      // SECURITY: Get order first to validate and get actual amount
      const order = await this.ordersService.getOrderById(dto.orderId);

      if (!order) {
        this.logger.error(`❌ Order not found: ${dto.orderId}`);
        return {
          success: false,
          error: 'Order not found',
        };
      }

      // Verify this is a receiver-pays order
      if (!order.receiverPaysOnDelivery) {
        this.logger.error(`❌ Order ${dto.orderId} is not a receiver-pays order`);
        return {
          success: false,
          error: 'Not a receiver-pays order',
        };
      }

      // Verify order is in correct status (picked_up or delivered)
      if (order.status !== 'picked_up' && order.status !== 'delivered') {
        this.logger.error(`❌ Order ${dto.orderId} not ready for payment collection. Status: ${order.status}`);
        return {
          success: false,
          error: 'Order not ready for payment collection',
        };
      }

      // Get amount from order - NOT from client request (security)
      const amount = order.total || order.pricing?.total || 0;

      if (amount <= 0) {
        this.logger.error(`❌ Invalid order amount: ${amount}`);
        return {
          success: false,
          error: 'Invalid order amount',
        };
      }

      this.logger.log(`💰 Amount from order (secure): ${amount} RWF`);

      // Initiate payment from receiver using ACTUAL order amount
      const result = await this.paymentsService.initiateDeposit({
        orderId: dto.orderId,
        phoneNumber: dto.phoneNumber,
        amount, // From database, not client
        description: 'Haraka Delivery', // Max 22 chars for PawaPay
      });

      // If payment successful, update order payment status
      if (result.success && (result.status === 'ACCEPTED' || result.status === 'COMPLETED')) {
        order.paymentStatus = result.status === 'COMPLETED' ? 'paid' : 'pending';
        order.depositId = result.depositId;
        await this.ordersService.updateOrder(order);
        this.logger.log(`✅ Receiver payment request sent for order ${dto.orderId}`);
      }

      return result;
    } catch (error) {
      this.logger.error('❌ Receiver payment collection error:', error);
      throw error;
    }
  }
}
