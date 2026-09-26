import { Controller, Post, Get, Body, Param, Put, Logger } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreatePendingOrderDto } from './dto/create-pending-order.dto';
import { UpdateDeliveryLocationDto } from './dto/update-delivery-location.dto';
import { StatusValidationService } from './services/status-validation.service';
import { SmsService } from '../notifications/sms.service';

@Controller('orders')
export class OrdersController {
  private readonly logger = new Logger(OrdersController.name);

  constructor(
    private readonly ordersService: OrdersService,
    private readonly statusValidation: StatusValidationService,
    private readonly smsService: SmsService,
  ) {}

  // Create pending order (sender fills their info, system sends link to recipient)
  @Post('pending')
  async createPendingOrder(@Body() dto: CreatePendingOrderDto) {
    console.log('🎯 Controller received POST /orders/pending');
    console.log('📨 Request body:', JSON.stringify(dto, null, 2));

    const order = await this.ordersService.createPendingOrder(dto);

    console.log('📤 Controller returning:', JSON.stringify(order, null, 2));

    return {
      success: true,
      message: 'Order created. Share link with recipient to select delivery location.',
      data: order,
    };
  }

  // Update delivery location (recipient clicks link and selects location)
  @Put(':id/delivery-location')
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
  async createOrder(@Body() orderData: any) {
    const order = await this.ordersService.createOrder(orderData);

    // 📱 SMS NOTIFICATION: Order Created (only if order created with 'pending' status)
    if (order && typeof order === 'object' && 'senderPhone' in order) {
      const customerPhone = order.senderPhone || order.recipientPhone || order.customerPhone;
      const customerName = order.senderName || order.recipientName || 'Customer';

      if (customerPhone && order.status === 'pending') {
        this.logger.log(`📱 Sending "order created" SMS to ${customerPhone}`);
        this.smsService.sendCustomSms(
          customerPhone,
          `Hi ${customerName}! Your order #${order.id.substring(0, 8).toUpperCase()} has been created successfully. ${order.paymentMethod === 'Cash on Delivery' ? 'Total: ' + Math.round(order.total || 0) + ' RWF (pay on delivery)' : 'Please complete payment to confirm your order.'} - Haraka Delivery`
        ).catch(err => this.logger.error(`SMS send failed: ${err.message}`));
      }
    }

    return {
      success: true,
      message: 'Order created successfully',
      data: order,
    };
  }

  @Get(':id')
  async getOrder(@Param('id') id: string) {
    const order = await this.ordersService.getOrderById(id);
    return {
      success: true,
      data: order,
    };
  }

  @Get()
  async getAllOrders() {
    const orders = await this.ordersService.getAllOrders();
    return {
      success: true,
      data: orders,
    };
  }

  // Update order status (for restaurant/courier app) with validation
  @Put(':id/status')
  async updateOrderStatus(
    @Param('id') id: string,
    @Body() body: { status: string; courierName?: string; courierPhone?: string },
  ) {
    try {
      const order = await this.ordersService.getOrderById(id);
      if (!order) {
        return {
          success: false,
          message: 'Order not found',
        };
      }

      // SECURITY: Validate status transition
      this.statusValidation.validateTransition(order.status, body.status);

      const oldStatus = order.status;
      order.status = body.status;
      await this.ordersService.updateOrder(order);

      this.logger.log(`✅ Order ${id} status: ${oldStatus} → ${body.status}`);

      // 📱 SEND SMS NOTIFICATIONS based on status change
      const customerPhone = order.senderPhone || order.recipientPhone || order.customerPhone;
      const customerName = order.senderName || order.recipientName || 'Customer';

      // When order is CONFIRMED (restaurant received it)
      if (body.status === 'confirmed' && customerPhone && oldStatus !== 'confirmed') {
        this.logger.log(`📱 Sending "order confirmed by restaurant" SMS to ${customerPhone}`);
        this.smsService.sendCustomSms(
          customerPhone,
          `Hi ${customerName}! ${order.restaurant || order.restaurantName || 'The restaurant'} has received your order #${order.id.substring(0, 8).toUpperCase()}. They will start preparing it soon! - Haraka Delivery`
        ).catch(err => this.logger.error(`SMS send failed: ${err.message}`));
      }

      // When restaurant starts PREPARING
      if (body.status === 'preparing' && customerPhone) {
        this.logger.log(`📱 Sending "order preparing" SMS to ${customerPhone}`);
        this.smsService.sendCustomSms(
          customerPhone,
          `Hi ${customerName}! Good news! ${order.restaurant || order.restaurantName || 'The restaurant'} is now preparing your order #${order.id.substring(0, 8).toUpperCase()}. It will be ready soon! 👨‍🍳 - Haraka Delivery`
        ).catch(err => this.logger.error(`SMS send failed: ${err.message}`));
      }

      // When courier is ASSIGNED
      if (body.status === 'assigned' && customerPhone) {
        this.logger.log(`📱 Sending "courier assigned" SMS to ${customerPhone}`);
        this.smsService.sendCustomSms(
          customerPhone,
          `Hi ${customerName}! A courier has been assigned to your order #${order.id.substring(0, 8).toUpperCase()}! They will pick it up once it's ready. 🏍️ - Haraka Delivery`
        ).catch(err => this.logger.error(`SMS send failed: ${err.message}`));
      }

      // When courier ARRIVES AT PICKUP (at restaurant)
      if (body.status === 'arrived_at_pickup' && customerPhone) {
        this.logger.log(`📱 Sending "courier arrived at pickup" SMS to ${customerPhone}`);
        this.smsService.sendCustomSms(
          customerPhone,
          `Hi ${customerName}! Your courier has arrived at ${order.restaurant || order.restaurantName || 'the restaurant'} to pick up your order #${order.id.substring(0, 8).toUpperCase()}. Your food will be on its way to you very soon! 🏍️ - Haraka Delivery`
        ).catch(err => this.logger.error(`SMS send failed: ${err.message}`));
      }

      // When restaurant marks order as READY
      if (body.status === 'ready' && customerPhone) {
        this.logger.log(`📱 Sending "order ready" SMS to ${customerPhone}`);
        this.smsService.sendOrderReadySms({
          phone: customerPhone,
          customerName: customerName,
          orderId: order.id,
          restaurantName: order.restaurant || order.restaurantName,
        }).catch(err => this.logger.error(`SMS send failed: ${err.message}`));
      }

      // When courier picks up the order
      if (body.status === 'picked_up' && customerPhone && body.courierName) {
        this.logger.log(`📱 Sending "out for delivery" SMS to ${customerPhone}`);
        this.smsService.sendOrderPickedUpSms({
          phone: customerPhone,
          customerName: customerName,
          orderId: order.id,
          courierName: body.courierName,
          courierPhone: body.courierPhone || 'N/A',
        }).catch(err => this.logger.error(`SMS send failed: ${err.message}`));
      }

      // When order is delivered
      if (body.status === 'delivered' && customerPhone) {
        this.logger.log(`📱 Sending "order delivered" SMS to ${customerPhone}`);
        this.smsService.sendOrderDeliveredSms({
          phone: customerPhone,
          customerName: customerName,
          orderId: order.id,
        }).catch(err => this.logger.error(`SMS send failed: ${err.message}`));
      }

      return {
        success: true,
        message: 'Order status updated',
        data: order,
      };
    } catch (error) {
      this.logger.error(`❌ Status update failed: ${error.message}`);
      return {
        success: false,
        message: error.message,
      };
    }
  }
}
