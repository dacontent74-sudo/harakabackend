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

    // Get order details
    const order = await this.ordersService.getOrderById(dto.orderId);
    if (!order) {
      return {
        success: false,
        message: 'Order not found',
      };
    }

    // Get amount from order
    const amount = order.total || order.pricing?.total || 0;
    if (amount <= 0) {
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
      description: `Payment for Order ${dto.orderId}`,
    });

    // Update order with payment info
    if (result.success) {
      order.paymentStatus = 'pending';
      order.depositId = result.depositId;
      await this.ordersService.updateOrder(order);
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

  // Note: We use polling instead of webhooks since PawaPay callback
  // is shared with africa-cyber-trust app at:
  // https://africa-cyber-trust.onrender.com/api/payments/webhooks/pawapay
}
