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
   * Check payment status
   */
  @Get('status/:depositId')
  async checkStatus(@Param('depositId') depositId: string) {
    return await this.paymentsService.checkDepositStatus(depositId);
  }

  /**
   * Webhook endpoint for PawaPay callbacks
   */
  @Post('callback')
  async handleCallback(@Body() payload: any) {
    this.logger.log('📥 PawaPay callback received:', JSON.stringify(payload, null, 2));

    const depositId = payload.depositId;
    const status = payload.status;

    // Extract order ID from deposit ID (format: orderId-timestamp)
    const orderId = depositId.split('-')[0];

    // Update order payment status
    const order = await this.ordersService.getOrderById(orderId);
    if (order) {
      if (status === 'COMPLETED') {
        order.paymentStatus = 'paid';
        order.status = 'confirmed';
        this.logger.log(`✅ Payment confirmed for order ${orderId}`);
      } else if (status === 'FAILED') {
        order.paymentStatus = 'failed';
        this.logger.log(`❌ Payment failed for order ${orderId}`);
      }

      await this.ordersService.updateOrder(order);
    }

    return { success: true };
  }
}
