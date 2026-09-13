import { Injectable } from '@nestjs/common';
import { PricingService } from '../pricing/pricing.service';
import { CreatePendingOrderDto } from './dto/create-pending-order.dto';
import { UpdateDeliveryLocationDto } from './dto/update-delivery-location.dto';

@Injectable()
export class OrdersService {
  constructor(private readonly pricingService: PricingService) {}

  private orders = new Map<string, any>();

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
  createPendingOrder(dto: CreatePendingOrderDto) {
    const orderId = this.generateOrderId();

    const order = {
      id: orderId,
      ...dto,
      status: 'awaiting_recipient_location',
      deliveryLatitude: null,
      deliveryLongitude: null,
      deliveryAddress: null,
      distance: null,
      pricing: null,
      shareableLink: `http://192.168.1.68:3000/select-location/${orderId}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.orders.set(orderId, order);
    return order;
  }

  // Update delivery location (when recipient selects their location)
  updateDeliveryLocation(orderId: string, dto: UpdateDeliveryLocationDto) {
    const order = this.orders.get(orderId);

    if (!order) {
      throw new Error('Order not found');
    }

    // Calculate distance
    const distance = this.calculateDistance(
      order.pickupLatitude,
      order.pickupLongitude,
      dto.deliveryLatitude,
      dto.deliveryLongitude,
    );

    // Calculate pricing
    const pricing = this.pricingService.calculateDeliveryFee(distance, order.vehicleType);

    // Update order
    order.deliveryLatitude = dto.deliveryLatitude;
    order.deliveryLongitude = dto.deliveryLongitude;
    order.deliveryAddress = dto.deliveryAddress;
    order.distance = distance;
    order.pricing = pricing;
    order.status = 'ready_for_confirmation';
    order.updatedAt = new Date().toISOString();

    this.orders.set(orderId, order);
    return order;
  }

  createOrder(orderData: any) {
    const orderId = this.generateOrderId();
    const order = {
      id: orderId,
      ...orderData,
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    };

    this.orders.set(orderId, order);
    return order;
  }

  getOrderById(id: string) {
    return this.orders.get(id);
  }

  getAllOrders() {
    return Array.from(this.orders.values());
  }
}
