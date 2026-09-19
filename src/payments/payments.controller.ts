import { Controller, Post, Get, Body, Param, Logger } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { OrdersService } from '../orders/orders.service';

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly ordersService: OrdersService,
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
    const result = await this.paymentsService.checkDepositStatus(depositId);

    // If payment completed, update order
    if (result.success && result.status === 'COMPLETED') {
      const orderId = depositId.split('-')[0];
      const order = await this.ordersService.getOrderById(orderId);

      if (order && order.paymentStatus !== 'paid') {
        order.paymentStatus = 'paid';
        order.status = 'confirmed';
        await this.ordersService.updateOrder(order);
        this.logger.log(`✅ Payment confirmed for order ${orderId}`);
      }
    }

    return result;
  }

  /**
   * Debug endpoint to check payment payload without sending
   */
  @Post('debug')
  async debugPayment(@Body() dto: {
    phoneNumber: string;
    amount: number;
  }) {
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
   * PawaPay webhook endpoint
   */
  @Post('webhooks/pawapay')
  async handleWebhook(@Body() payload: any) {
    this.logger.log('🔔 PawaPay webhook received:', JSON.stringify(payload, null, 2));

    try {
      const depositId = payload.depositId;
      const status = payload.status;

      this.logger.log(`📊 Webhook - depositId: ${depositId}, status: ${status}`);

      if (status === 'COMPLETED') {
        // Find order by depositId (depositId is now a UUID, not orderId-timestamp)
        const order = await this.ordersService.getOrderByDepositId(depositId);

        if (order) {
          this.logger.log(`✅ Found order: ${order.id}, current status: ${order.paymentStatus}`);

          if (order.paymentStatus !== 'paid') {
            order.paymentStatus = 'paid';
            order.status = 'confirmed';
            await this.ordersService.updateOrder(order);
            this.logger.log(`✅ Payment webhook: Order ${order.id} confirmed and marked as paid`);
          } else {
            this.logger.log(`ℹ️ Order ${order.id} already marked as paid`);
          }
        } else {
          this.logger.error(`❌ No order found with depositId: ${depositId}`);
        }
      } else if (status === 'FAILED') {
        this.logger.error(`❌ Payment webhook: Payment failed for ${depositId}`);
      }

      return { success: true };
    } catch (error) {
      this.logger.error('❌ Webhook error:', error);
      return { success: false, error: error.message };
    }
  }

  // Webhook URL for PawaPay dashboard:
  // https://harakabackend.onrender.com/api/v1/payments/webhooks/pawapay

  /**
   * Collect payment from receiver on delivery (for receiver-pays orders)
   */
  @Post('collect-receiver')
  async collectReceiverPayment(
    @Body() dto: { orderId: string; phoneNumber: string; amount: number },
  ) {
    this.logger.log(`💰 Collecting payment from receiver for order ${dto.orderId}`);
    this.logger.log(`📱 Phone: ${dto.phoneNumber}, Amount: ${dto.amount} RWF`);

    try {
      // Initiate payment from receiver
      const result = await this.paymentsService.initiateDeposit({
        orderId: dto.orderId,
        phoneNumber: dto.phoneNumber,
        amount: dto.amount,
        description: 'Haraka Delivery', // Max 22 chars for PawaPay
      });

      // If payment successful, update order payment status
      if (result.success && (result.status === 'ACCEPTED' || result.status === 'COMPLETED')) {
        const order = await this.ordersService.getOrderById(dto.orderId);

        if (order) {
          order.paymentStatus = result.status === 'COMPLETED' ? 'paid' : 'pending';
          order.depositId = result.depositId;
          await this.ordersService.updateOrder(order);
          this.logger.log(`✅ Receiver payment request sent for order ${dto.orderId}`);
        }
      }

      return result;
    } catch (error) {
      this.logger.error('❌ Receiver payment collection error:', error);
      throw error;
    }
  }
}
