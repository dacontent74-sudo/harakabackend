import { Controller, Post, Get, Body, Param, Put } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreatePendingOrderDto } from './dto/create-pending-order.dto';
import { UpdateDeliveryLocationDto } from './dto/update-delivery-location.dto';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

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

  // Update order status (for restaurant app)
  @Put(':id/status')
  async updateOrderStatus(
    @Param('id') id: string,
    @Body() body: { status: string },
  ) {
    try {
      const order = await this.ordersService.getOrderById(id);
      if (!order) {
        return {
          success: false,
          message: 'Order not found',
        };
      }

      order.status = body.status;
      await this.ordersService.updateOrder(order);

      return {
        success: true,
        message: 'Order status updated',
        data: order,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }
}
