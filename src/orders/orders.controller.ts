import { Controller, Post, Get, Body, Param, Put, Logger, HttpCode, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OrdersService } from './orders.service';
import { Auth, CurrentUser } from '../auth/decorators/roles.decorator';
import { AuthPrincipal, MERCHANT_ROLE, STAFF_ALL, STAFF_WRITE } from '../auth/principal';
import { CreatePendingOrderDto } from './dto/create-pending-order.dto';
import { UpdateDeliveryLocationDto } from './dto/update-delivery-location.dto';
import { StatusValidationService } from './services/status-validation.service';
import { TwilioSmsService } from '../notifications/twilio-sms.service';
import { Order } from './entities/order.entity';

/** Statuses a restaurant may set on its own food orders. */
const MERCHANT_SETTABLE_STATUSES = ['confirmed', 'preparing', 'ready', 'cancelled'];
/** A restaurant may only cancel before the food is handed to a courier. */
const MERCHANT_CANCELLABLE_FROM = ['pending', 'confirmed', 'preparing'];

/**
 * Orders.
 * Public (customer app, no login): create order, create pending parcel,
 *   recipient sets delivery location, get one order by id, lookup own orders by ids.
 * Restaurant JWT: list own orders, update status of own orders.
 * Staff JWT: list all orders, update any order status.
 */
@Controller('orders')
export class OrdersController {
  private readonly logger = new Logger(OrdersController.name);

  constructor(
    private readonly ordersService: OrdersService,
    private readonly statusValidation: StatusValidationService,
    private readonly twilioSmsService: TwilioSmsService,
  ) {}

  // Create pending order (sender fills their info, system sends link to recipient)
  @Post('pending')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async createPendingOrder(@Body() dto: CreatePendingOrderDto) {
    const order = await this.ordersService.createPendingOrder(dto);

    return {
      success: true,
      message: 'Order created. Share link with recipient to select delivery location.',
      data: order,
    };
  }

  // Update delivery location (recipient clicks link and selects location)
  @Put(':id/delivery-location')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async updateDeliveryLocation(
    @Param('id') id: string,
    @Body() dto: UpdateDeliveryLocationDto,
  ) {
    try {
      const order = await this.ordersService.updateDeliveryLocation(id, dto);
      return {
        success: true,
        message: 'Delivery location updated successfully',
        data: order,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  // Confirm order (after recipient selects location and sender confirms)
  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async createOrder(@Body() orderData: any) {
    const createdOrder = await this.ordersService.createOrder(orderData);

    // 📱 SMS NOTIFICATION: Order Created
    if (createdOrder) {
      const customerPhone = createdOrder.senderPhone || createdOrder.recipientPhone || createdOrder.customerPhone;
      const customerName = createdOrder.senderName || createdOrder.recipientName || 'Customer';
      const isParcel = createdOrder.orderType === 'parcel' || createdOrder.status === 'ready_for_pickup';

      if (customerPhone) {
        this.logger.log(`📱 Sending "order created" SMS to ${customerPhone}`);

        this.twilioSmsService.sendOrderCreated(
          customerPhone,
          createdOrder.id.substring(0, 8).toUpperCase(),
          isParcel ? 'parcel' : 'food',
          Math.round(createdOrder.total || 0)
        ).catch(err => this.logger.error(`SMS send failed: ${err.message}`));
      }
    }

    return {
      success: true,
      message: 'Order created successfully',
      data: createdOrder,
    };
  }

  /**
   * Customer order history: the app stores the IDs of orders it created and
   * looks them up here. body: { ids: string[] } (max 100)
   */
  @Post('lookup')
  @HttpCode(200)
  async lookupOrders(@Body() body: { ids: string[] }) {
    return {
      success: true,
      data: await this.ordersService.getOrdersByIds(Array.isArray(body?.ids) ? body.ids : []),
    };
  }

  @Get(':id')
  async getOrder(@Param('id') id: string) {
    const order = await this.ordersService.getOrderById(id);
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return {
      success: true,
      data: order,
    };
  }

  /** Staff see every order; a restaurant only sees its own food orders. */
  @Get()
  @Auth(MERCHANT_ROLE, ...STAFF_ALL)
  async getAllOrders(@CurrentUser() user: AuthPrincipal) {
    const orders =
      user.type === 'merchant'
        ? await this.ordersService.getOrdersForRestaurant(user.name)
        : await this.ordersService.getAllOrders();
    return {
      success: true,
      data: orders,
    };
  }

  // Update order status (for restaurant/courier app) with validation
  @Put(':id/status')
  @Auth(MERCHANT_ROLE, ...STAFF_WRITE)
  async updateOrderStatus(
    @Param('id') id: string,
    @Body() body: { status: string; courierName?: string; courierPhone?: string },
    @CurrentUser() user: AuthPrincipal,
  ) {
    try {
      const order = await this.ordersService.getOrderById(id);
      if (!order) {
        return {
          success: false,
          message: 'Order not found',
        };
      }

      // SECURITY: restaurants may only move their own food orders through the kitchen states.
      if (user.type === 'merchant') {
        if (order.orderType !== 'food' || order.restaurantName !== user.name) {
          throw new ForbiddenException('This order does not belong to your restaurant');
        }
        if (!MERCHANT_SETTABLE_STATUSES.includes(body?.status)) {
          throw new ForbiddenException(`Restaurants cannot set status "${body?.status}"`);
        }
        if (body.status === 'cancelled' && !MERCHANT_CANCELLABLE_FROM.includes(order.status)) {
          throw new ForbiddenException('Order can no longer be cancelled by the restaurant');
        }
      }

      // SECURITY: Validate status transition
      this.statusValidation.validateTransition(order.status, body.status);

      const oldStatus = order.status;
      order.status = body.status;

      // ⏰ SET TIMESTAMPS for order lifecycle tracking
      const now = new Date();
      switch (body.status) {
        case 'confirmed':
          if (!order.confirmedAt) order.confirmedAt = now;
          break;
        case 'preparing':
          if (!order.preparingAt) order.preparingAt = now;
          break;
        case 'ready':
        case 'ready_for_pickup':
          if (!order.readyAt) order.readyAt = now;
          break;
        case 'assigned':
          if (!order.assignedAt) order.assignedAt = now;
          break;
        case 'picked_up':
        case 'in_transit':
          if (!order.pickedUpAt) order.pickedUpAt = now;
          break;
        case 'delivered':
          if (!order.deliveredAt) order.deliveredAt = now;
          break;
        case 'cancelled':
          if (!order.cancelledAt) order.cancelledAt = now;
          break;
      }

      await this.ordersService.updateOrder(order);

      this.logger.log(`✅ Order ${id} status: ${oldStatus} → ${body.status}`);

      // 📱 SEND SMS NOTIFICATIONS based on status change
      const customerPhone = order.senderPhone || order.recipientPhone || order.customerPhone;
      const orderType = order.orderType || 'food';

      // When order is CONFIRMED (restaurant received it)
      if (body.status === 'confirmed' && customerPhone && oldStatus !== 'confirmed') {
        this.logger.log(`📱 Sending "order confirmed" SMS to ${customerPhone}`);
        this.twilioSmsService.sendOrderConfirmed(
          customerPhone,
          order.id.substring(0, 8).toUpperCase(),
          order.restaurant || order.restaurantName || 'The restaurant'
        ).catch(err => this.logger.error(`SMS send failed: ${err.message}`));
      }

      // When restaurant starts PREPARING
      if (body.status === 'preparing' && customerPhone) {
        this.logger.log(`📱 Sending "order preparing" SMS to ${customerPhone}`);
        this.twilioSmsService.sendOrderPreparing(
          customerPhone,
          order.id.substring(0, 8).toUpperCase(),
          order.restaurant || order.restaurantName || 'The restaurant'
        ).catch(err => this.logger.error(`SMS send failed: ${err.message}`));
      }

      // When courier is ASSIGNED
      if (body.status === 'assigned' && customerPhone) {
        this.logger.log(`📱 Sending "courier assigned" SMS to ${customerPhone}`);
        this.twilioSmsService.sendCourierAssigned(
          customerPhone,
          order.id.substring(0, 8).toUpperCase()
        ).catch(err => this.logger.error(`SMS send failed: ${err.message}`));
      }

      // When courier ARRIVES AT PICKUP (at restaurant)
      if (body.status === 'arrived_at_pickup' && customerPhone) {
        this.logger.log(`📱 Sending "courier arrived at pickup" SMS to ${customerPhone}`);
        this.twilioSmsService.sendCourierArrivedAtPickup(
          customerPhone,
          order.id.substring(0, 8).toUpperCase(),
          order.restaurant || order.restaurantName || 'the restaurant'
        ).catch(err => this.logger.error(`SMS send failed: ${err.message}`));
      }

      // When restaurant marks order as READY
      if (body.status === 'ready' && customerPhone) {
        this.logger.log(`📱 Sending "order ready" SMS to ${customerPhone}`);
        this.twilioSmsService.sendOrderReady(
          customerPhone,
          order.id.substring(0, 8).toUpperCase(),
          orderType
        ).catch(err => this.logger.error(`SMS send failed: ${err.message}`));
      }

      // When courier picks up the order
      if (body.status === 'picked_up' && customerPhone && body.courierName) {
        this.logger.log(`📱 Sending "out for delivery" SMS to ${customerPhone}`);
        this.twilioSmsService.sendOrderPickedUp(
          customerPhone,
          order.id.substring(0, 8).toUpperCase(),
          body.courierName,
          orderType
        ).catch(err => this.logger.error(`SMS send failed: ${err.message}`));
      }

      // When order is delivered
      if (body.status === 'delivered' && customerPhone) {
        this.logger.log(`📱 Sending "order delivered" SMS to ${customerPhone}`);
        this.twilioSmsService.sendOrderDelivered(
          customerPhone,
          order.id.substring(0, 8).toUpperCase(),
          orderType
        ).catch(err => this.logger.error(`SMS send failed: ${err.message}`));
      }

      return {
        success: true,
        message: 'Order status updated',
        data: order,
      };
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      this.logger.error(`❌ Status update failed: ${error.message}`);
      return {
        success: false,
        message: error.message,
      };
    }
  }
}
