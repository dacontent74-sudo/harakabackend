import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PricingService } from '../pricing/pricing.service';
import { CreatePendingOrderDto } from './dto/create-pending-order.dto';
import { UpdateDeliveryLocationDto } from './dto/update-delivery-location.dto';
import { Order } from './entities/order.entity';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    private readonly pricingService: PricingService,
  ) {}

  // Generate unique order ID
  private generateOrderId(): string {
    return `HRK${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
  }

  // Calculate distance using Haversine formula
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const p = 0.017453292519943295; // Math.PI / 180
    const a = 0.5 - Math.cos((lat2 - lat1) * p) / 2 +
        Math.cos(lat1 * p) *
        Math.cos(lat2 * p) *
        (1 - Math.cos((lon2 - lon1) * p)) / 2;
    return 12742 * Math.asin(Math.sqrt(a)); // 2 * R; R = 6371 km
  }

  // Create pending order (waiting for recipient location)
  async createPendingOrder(dto: CreatePendingOrderDto) {
    const orderId = this.generateOrderId();

    console.log('📦 Creating pending order');
    console.log('📥 Received DTO:', JSON.stringify(dto, null, 2));

    const order = this.orderRepository.create({
      id: orderId,
      ...dto,
      status: 'awaiting_recipient_location',
      shareableLink: `https://harakabackend.onrender.com/select-location/${orderId}`,
    });

    const savedOrder = await this.orderRepository.save(order);

    console.log('✅ Order saved to database');
    console.log('🔍 Saved order:', JSON.stringify(savedOrder, null, 2));

    return savedOrder;
  }

  // Update delivery location (when recipient selects their location)
  async updateDeliveryLocation(orderId: string, dto: UpdateDeliveryLocationDto) {
    const order = await this.orderRepository.findOne({ where: { id: orderId } });

    if (!order) {
      throw new Error('Order not found');
    }

    console.log('📍 Updating delivery location for order:', orderId);
    console.log('📥 Delivery location data:', JSON.stringify(dto, null, 2));

    // Calculate distance
    const distance = this.calculateDistance(
      order.pickupLatitude,
      order.pickupLongitude,
      dto.deliveryLatitude,
      dto.deliveryLongitude,
    );

    console.log('📏 Calculated distance:', distance);

    // Calculate pricing
    const pricing = this.pricingService.calculateDeliveryFee(distance, order.vehicleType as 'motorcycle' | 'car');

    console.log('💰 Calculated pricing:', JSON.stringify(pricing, null, 2));

    // Update order
    order.deliveryLatitude = dto.deliveryLatitude;
    order.deliveryLongitude = dto.deliveryLongitude;
    order.deliveryAddress = dto.deliveryAddress;
    order.distance = distance;
    order.pricing = pricing;
    order.status = 'ready_for_confirmation';

    const updatedOrder = await this.orderRepository.save(order);

    console.log('✅ Order updated in database');

    return updatedOrder;
  }

  async createOrder(orderData: any) {
    const orderId = this.generateOrderId();
    const order = this.orderRepository.create({
      id: orderId,
      ...orderData,
      status: 'confirmed',
    });

    return await this.orderRepository.save(order);
  }

  async getOrderById(id: string) {
    return await this.orderRepository.findOne({ where: { id } });
  }

  async getAllOrders() {
    return await this.orderRepository.find({
      order: { createdAt: 'DESC' }, // Newest first
    });
  }
}
