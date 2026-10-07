import { Controller, Post, Get, Body, Param, Put, Logger } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreatePendingOrderDto } from './dto/create-pending-order.dto';
import { UpdateDeliveryLocationDto } from './dto/update-delivery-location.dto';
import { StatusValidationService } from './services/status-validation.service';
import { WhatsAppService } from '../notifications/whatsapp.service';
import { Order } from './entities/order.entity';

@Controller('orders')
export class OrdersController {
  private readonly logger = new Logger(OrdersController.name);

  constructor(
    private readonly ordersService: OrdersService,
    private readonly statusValidation: StatusValidationService,
    private readonly whatsappService: WhatsAppService,
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
    const createdOrder = await this.ordersService.createOrder(orderData);

    // 📱 SMS NOTIFICATION: Order Created
    if (createdOrder) {
      const customerPhone = createdOrder.senderPhone || createdOrder.recipientPhone || createdOrder.customerPhone;
      const customerName = createdOrder.senderName || createdOrder.recipientName || 'Customer';
      const isParcel = createdOrder.orderType === 'parcel' || createdOrder.status === 'ready_for_pickup';

      if (customerPhone) {
        this.logger.log(`📱 Sending "order created" WhatsApp to ${customerPhone}`);

        if (isParcel) {
          // 📦 PARCEL: Goes directly to courier
          this.whatsappService.sendMessage(
            customerPhone,
            `Hi *${customerName}*! 👋\n\n📦 Your parcel delivery *#${createdOrder.id.substring(0, 8).toUpperCase()}* has been created.\n\n${createdOrder.paymentMethod === 'Cash on Delivery' ? '💰 Total: *' + Math.round(createdOrder.total || 0) + ' RWF*\n\n' : ''}🚗 A courier will be assigned shortly to pick up from your location.\n\n🚀 Haraka Delivery`
          ).catch(err => this.logger.error(`WhatsApp send failed: ${err.message}`));
        } else {
          // 🍔 FOOD: Goes through restaurant
          this.whatsappService.sendMessage(
            customerPhone,
            `Hi *${customerName}*! 👋\n\n🍽️ Your order *#${createdOrder.id.substring(0, 8).toUpperCase()}* has been created successfully.\n\n${createdOrder.paymentMethod === 'Cash on Delivery' ? '💰 Total: *' + Math.round(createdOrder.total || 0) + ' RWF* (pay on delivery)' : '💳 Please complete payment to confirm your order.'}\n\n🚀 Haraka Delivery`
          ).catch(err => this.logger.error(`WhatsApp send failed: ${err.message}`));
        }
      }
    }

    return {
      success: true,
      message: 'Order created successfully',
      data: createdOrder,
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

      // 📱 SEND WHATSAPP NOTIFICATIONS based on status change
      const customerPhone = order.senderPhone || order.recipientPhone || order.customerPhone;
      const customerName = order.senderName || order.recipientName || 'Customer';
      const orderType = order.orderType || 'food';

      // When order is CONFIRMED (restaurant received it)
      if (body.status === 'confirmed' && customerPhone && oldStatus !== 'confirmed') {
        this.logger.log(`📱 Sending "order confirmed by restaurant" WhatsApp to ${customerPhone}`);
        this.whatsappService.sendMessage(
          customerPhone,
          `Hi *${customerName}*! 👋\n\n✅ *${order.restaurant || order.restaurantName || 'The restaurant'}* has received your order *#${order.id.substring(0, 8).toUpperCase()}*.\n\nThey will start preparing it soon! 👨‍🍳\n\n🚀 Haraka Delivery`
        ).catch(err => this.logger.error(`WhatsApp send failed: ${err.message}`));
      }

      // When restaurant starts PREPARING
      if (body.status === 'preparing' && customerPhone) {
        this.logger.log(`📱 Sending "order preparing" WhatsApp to ${customerPhone}`);
        this.whatsappService.sendMessage(
          customerPhone,
          `Hi *${customerName}*! 👋\n\n👨‍🍳 Good news! *${order.restaurant || order.restaurantName || 'The restaurant'}* is now preparing your order *#${order.id.substring(0, 8).toUpperCase()}*.\n\nIt will be ready soon! 🍽️\n\n🚀 Haraka Delivery`
        ).catch(err => this.logger.error(`WhatsApp send failed: ${err.message}`));
      }

      // When courier is ASSIGNED
      if (body.status === 'assigned' && customerPhone) {
        this.logger.log(`📱 Sending "courier assigned" WhatsApp to ${customerPhone}`);
        this.whatsappService.sendMessage(
          customerPhone,
          `Hi *${customerName}*! 👋\n\n🚗 A courier has been assigned to your order *#${order.id.substring(0, 8).toUpperCase()}*!\n\nThey will pick it up once it's ready. 🏍️\n\n🚀 Haraka Delivery`
        ).catch(err => this.logger.error(`WhatsApp send failed: ${err.message}`));
      }

      // When courier ARRIVES AT PICKUP (at restaurant)
      if (body.status === 'arrived_at_pickup' && customerPhone) {
        this.logger.log(`📱 Sending "courier arrived at pickup" WhatsApp to ${customerPhone}`);
        this.whatsappService.sendMessage(
          customerPhone,
          `Hi *${customerName}*! 👋\n\n🚗 Your courier has arrived at *${order.restaurant || order.restaurantName || 'the restaurant'}* to pick up your order *#${order.id.substring(0, 8).toUpperCase()}*.\n\nYour food will be on its way to you very soon! 🏍️\n\n🚀 Haraka Delivery`
        ).catch(err => this.logger.error(`WhatsApp send failed: ${err.message}`));
      }

      // When restaurant marks order as READY
      if (body.status === 'ready' && customerPhone) {
        this.logger.log(`📱 Sending "order ready" WhatsApp to ${customerPhone}`);
        this.whatsappService.sendOrderReady(
          customerPhone,
          orderType,
          order.id.substring(0, 8).toUpperCase()
        ).catch(err => this.logger.error(`WhatsApp send failed: ${err.message}`));
      }

      // When courier picks up the order
      if (body.status === 'picked_up' && customerPhone && body.courierName) {
        this.logger.log(`📱 Sending "out for delivery" WhatsApp to ${customerPhone}`);
        this.whatsappService.sendOrderPickedUp(
          customerPhone,
          orderType,
          order.id.substring(0, 8).toUpperCase(),
          body.courierName
        ).catch(err => this.logger.error(`WhatsApp send failed: ${err.message}`));
      }

      // When order is delivered
      if (body.status === 'delivered' && customerPhone) {
        this.logger.log(`📱 Sending "order delivered" WhatsApp to ${customerPhone}`);
        this.whatsappService.sendOrderDelivered(
          customerPhone,
          orderType,
          order.id.substring(0, 8).toUpperCase()
        ).catch(err => this.logger.error(`WhatsApp send failed: ${err.message}`));
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
