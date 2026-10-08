import { Controller, Post, Get, Body, Param, Logger, UseGuards, HttpCode, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { Auth, CurrentUser } from '../auth/decorators/roles.decorator';
import { AuthPrincipal, COURIER_ROLE, STAFF_ADMIN } from '../auth/principal';
import { AuthService } from '../auth/auth.service';
import { AuditAction } from '../auth/entities/audit-log.entity';
import { PaymentsService } from './payments.service';
import { OrdersService } from '../orders/orders.service';
import { WebhookGuard } from './guards/webhook.guard';
import { IdempotencyService } from './services/idempotency.service';
import { TwilioSmsService } from '../notifications/twilio-sms.service';

/** Amount tolerance (RWF) when comparing PawaPay's amount with the order total. */
const AMOUNT_TOLERANCE = 1;

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly ordersService: OrdersService,
    private readonly idempotencyService: IdempotencyService,
    private readonly twilioSmsService: TwilioSmsService,
    private readonly authService: AuthService,
  ) {}

  /**
   * Single place where an order becomes PAID.
   * Only called after PawaPay's API itself confirmed the deposit as COMPLETED
   * for at least the order amount - never on the word of a webhook payload.
   */
  private async markOrderPaid(order: any, source: string) {
    if (order.paymentStatus === 'paid') return false;
    order.paymentStatus = 'paid';
    // Food orders move to "confirmed" (restaurant sees them). Parcel orders keep
    // their courier-facing status (ready_for_pickup / in_transit / ...).
    if (order.orderType !== 'parcel' && (!order.status || order.status === 'pending')) {
      order.status = 'confirmed';
      order.confirmedAt = order.confirmedAt || new Date();
    }
    await this.ordersService.updateOrder(order);
    this.logger.log(`✅ Order ${order.id} marked PAID via ${source}`);

    const customerPhone = order.senderPhone || order.recipientPhone || order.customerPhone;
    if (customerPhone) {
      this.twilioSmsService
        .sendPaymentConfirmed(customerPhone, order.id.substring(0, 8).toUpperCase(), Math.round(Number(order.total) || 0))
        .catch((err) => this.logger.error(`SMS send failed: ${err.message}`));
    }
    return true;
  }

  /** Ask PawaPay for the authoritative status of a deposit and check the amount. */
  private async verifyDeposit(depositId: string, order: any) {
    const result = await this.paymentsService.checkDepositStatus(depositId);
    if (!result.success) return { verified: false, status: undefined as string | undefined, result };
    const expected = Math.round(Number(order?.total ?? order?.pricing?.total ?? 0));
    const paid = Number((result as any).amount);
    const amountOk = !Number.isFinite(paid) || paid + AMOUNT_TOLERANCE >= expected;
    if (!amountOk) {
      this.logger.error(`❌ Deposit ${depositId} amount ${paid} < order total ${expected} - NOT marking paid`);
    }
    return { verified: result.status === 'COMPLETED' && amountOk, status: result.status, result };
  }

  /**
   * Initiate payment for an order
   */
  @Post('initiate')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
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

    if (order.paymentStatus === 'paid') {
      return { success: false, message: 'This order is already paid' };
    }
    if (order.status === 'cancelled') {
      return { success: false, message: 'This order was cancelled' };
    }

    // Get amount from order (server-computed at order creation)
    const amount = Number(order.total || order.pricing?.total || 0);
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

      if (customerPhone) {
        this.logger.log(`📱 Sending "payment initiated" SMS to ${customerPhone}`);
        this.twilioSmsService.sendPaymentInitiated(
          customerPhone,
          order.id.substring(0, 8).toUpperCase(),
          Math.round(amount)
        ).catch(err => this.logger.error(`SMS send failed: ${err.message}`));
      }
    } else {
      this.logger.error(`❌ Payment failed:`, result.error);
    }

    return result;
  }

  /**
   * Check payment status (used for polling)
   * IMPROVED: Check database first (webhook is faster than API)
   */
  @Get('status/:depositId')
  async checkStatus(@Param('depositId') depositId: string) {
    this.logger.log(`📊 Checking payment status for depositId: ${depositId}`);

    // 🚀 OPTIMIZATION: Check order in database FIRST (webhook updates it immediately)
    const order = await this.ordersService.getOrderByDepositId(depositId);

    if (order) {
      this.logger.log(`📦 Order found: ${order.id}, paymentStatus: ${order.paymentStatus}`);

      // If webhook already updated order to "paid", return COMPLETED immediately
      if (order.paymentStatus === 'paid') {
        this.logger.log(`✅ Order already PAID (via webhook) - returning COMPLETED`);
        return {
          success: true,
          status: 'COMPLETED',
          message: 'Payment confirmed',
        };
      }
    }

    // If not paid yet, check PawaPay API (fallback)
    this.logger.log(`⏳ Order not paid yet - checking PawaPay API...`);
    if (!order) {
      return { success: false, status: 'NOT_FOUND', message: 'Payment not found' };
    }
    const { verified, status, result } = await this.verifyDeposit(depositId, order);

    if (verified) {
      await this.markOrderPaid(order, 'status polling');
      return { success: true, status: 'COMPLETED', message: 'Payment confirmed' };
    }
    if (status === 'FAILED' || status === 'REJECTED') {
      if (order.paymentStatus !== 'paid') {
        order.paymentStatus = 'failed';
        await this.ordersService.updateOrder(order);
      }
    }
    this.logger.log(`⏳ Payment status from PawaPay: ${status || 'unknown'}`);

    return result;
  }

  /**
   * Debug endpoint - ONLY for development/testing
   * SECURITY: Disabled in production
   */
  @Post('debug')
  @Auth(...STAFF_ADMIN)
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
  @SkipThrottle()
  @HttpCode(200)
  async handleWebhook(@Body() payload: any) {
    const depositId = typeof payload?.depositId === 'string' ? payload.depositId : undefined;
    const claimedStatus = typeof payload?.status === 'string' ? payload.status : undefined;
    this.logger.log(`🔔 PawaPay webhook received - depositId: ${depositId}, status: ${claimedStatus}`);

    try {
      if (!depositId || !claimedStatus) {
        this.logger.error('❌ Invalid webhook payload: missing depositId or status');
        return { success: false, error: 'Invalid payload' };
      }

      if (this.idempotencyService.isProcessed(depositId, claimedStatus)) {
        return { success: true, message: 'Already processed' };
      }

      const order = await this.ordersService.getOrderByDepositId(depositId);
      if (!order) {
        this.logger.error(`❌ No order found with depositId: ${depositId}`);
        return { success: false, error: 'Order not found' };
      }

      // SECURITY: never trust the webhook body. Ask PawaPay for the real status
      // (and amount) using our API token. A forged webhook can therefore at most
      // trigger a harmless re-check.
      const { verified, status } = await this.verifyDeposit(depositId, order);

      if (verified) {
        if (await this.markOrderPaid(order, 'webhook')) {
          this.logger.log(`✅ Payment webhook verified: order ${order.id} paid`);
        }
        this.idempotencyService.markProcessed(depositId, claimedStatus);
      } else if (status === 'FAILED' || status === 'REJECTED') {
        if (order.paymentStatus !== 'paid') {
          order.paymentStatus = 'failed';
          await this.ordersService.updateOrder(order);
          this.logger.log(`📝 Order ${order.id} marked as payment failed (verified)`);
        }
        this.idempotencyService.markProcessed(depositId, claimedStatus);
      } else {
        // Still SUBMITTED/ACCEPTED, or PawaPay unreachable: don't mark processed,
        // so a retry (or client polling) can complete it later.
        this.logger.log(`📝 Webhook for ${depositId}: claimed ${claimedStatus}, verified status ${status || 'unknown'}`);
      }

      return { success: true };
    } catch (error) {
      this.logger.error(`❌ Webhook error: ${error.message}`);
      return { success: false, error: 'Internal error' }; // Don't expose error details
    }
  }

  // Webhook URL for PawaPay dashboard:
  // https://harakabackend.onrender.com/api/v1/payments/webhooks/pawapay

  /**
   * MANUAL payment confirmation - bypasses idempotency for stuck payments
   * ADMIN ONLY - Use when webhook was received but order not updated
   */
  @Post('manual-confirm/:depositId')
  @Auth(...STAFF_ADMIN)
  async manualConfirm(
    @Param('depositId') depositId: string,
    @Body() body: { force?: boolean; reason?: string },
    @CurrentUser() user: AuthPrincipal,
  ) {
    this.logger.warn(`⚠️ MANUAL PAYMENT CONFIRMATION for depositId: ${depositId} by staff ${user.id}`);

    try {
      const order = await this.ordersService.getOrderByDepositId(depositId);
      if (!order) {
        return { success: false, error: 'Order not found' };
      }
      if (order.paymentStatus === 'paid') {
        return { success: true, message: 'Payment already confirmed', orderId: order.id };
      }

      // Re-check with PawaPay first. Only a super admin may force-confirm a
      // payment PawaPay does not report as COMPLETED (e.g. paid in cash), and
      // it is written to the audit log.
      const { verified, status } = await this.verifyDeposit(depositId, order);
      if (!verified) {
        if (!(body?.force === true && user.role === 'super_admin')) {
          return {
            success: false,
            error: `PawaPay reports this deposit as ${status || 'unknown'}. Only a super admin can force-confirm it.`,
            pawapayStatus: status,
          };
        }
      }

      await this.markOrderPaid(order, verified ? 'manual confirm (verified)' : 'manual confirm (FORCED)');
      await this.authService.logActivity(user.id, AuditAction.UPDATE, 'payment', order.id, {
        depositId,
        action: 'manual-confirm',
        verifiedWithPawaPay: verified,
        pawapayStatus: status,
        reason: body?.reason,
      });

      return {
        success: true,
        message: verified ? 'Payment confirmed (verified with PawaPay)' : 'Payment force-confirmed',
        orderId: order.id,
        orderStatus: order.status,
        paymentStatus: order.paymentStatus,
      };
    } catch (error) {
      this.logger.error(`❌ Manual confirmation error: ${error.message}`);
      return { success: false, error: 'Manual confirmation failed' };
    }
  }

  /**
   * Collect payment from receiver on delivery (for receiver-pays orders)
   * SECURITY: Amount comes from order in database, NOT from client request
   */
  @Post('collect-receiver')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Auth(COURIER_ROLE)
  async collectReceiverPayment(
    @Body() dto: { orderId: string; phoneNumber: string },
    @CurrentUser() courier: AuthPrincipal,
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

      // SECURITY: only the courier delivering this order can request payment for it
      if (order.courierId !== courier.id) {
        throw new ForbiddenException('This order is not assigned to you');
      }
      if (order.paymentStatus === 'paid') {
        return { success: false, error: 'Order is already paid' };
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
      if (!['picked_up', 'in_transit', 'delivered'].includes(order.status)) {
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
        // Paid status is only set after PawaPay confirms (webhook / polling).
        order.paymentStatus = 'pending';
        order.depositId = result.depositId;
        await this.ordersService.updateOrder(order);
        this.logger.log(`✅ Receiver payment request sent for order ${dto.orderId}`);
      }

      return result;
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      this.logger.error(`❌ Receiver payment collection error: ${error.message}`);
      return { success: false, error: 'Payment collection failed' };
    }
  }
}
