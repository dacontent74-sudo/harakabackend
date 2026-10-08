import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { randomBytes } from 'crypto';
import { PricingService } from '../pricing/pricing.service';
import { CreatePendingOrderDto } from './dto/create-pending-order.dto';
import { UpdateDeliveryLocationDto } from './dto/update-delivery-location.dto';
import { Order } from './entities/order.entity';
import { Merchant } from '../merchants/entities/merchant.entity';
import { MenuItem } from '../merchants/entities/menu-item.entity';
import { validateAndNormalizePhone, validateGPSCoordinates } from '../utils/validation';

/**
 * Pickup point used for food orders when the restaurant has no confirmed GPS
 * location yet. Must match the customer app fallback so prices agree.
 */
export const FALLBACK_RESTAURANT_LOCATION = { lat: -1.9403, lng: 29.8739 };

/** Flat service fee added to food orders (RWF). */
export const FOOD_SERVICE_FEE = Number(process.env.FOOD_SERVICE_FEE ?? 100);

const MAX_ITEMS_PER_ORDER = 50;
const MAX_QTY_PER_ITEM = 50;

function str(v: unknown, max = 500): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s ? s.slice(0, max) : undefined;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(Merchant)
    private readonly merchantRepository: Repository<Merchant>,
    @InjectRepository(MenuItem)
    private readonly menuItemRepository: Repository<MenuItem>,
    private readonly pricingService: PricingService,
  ) {}

  // Generate unique, unguessable order ID (order IDs double as tracking links)
  private generateOrderId(): string {
    const rand = parseInt(randomBytes(6).toString('hex'), 16).toString(36).toUpperCase().padStart(8, '0').slice(-8);
    return `HRK${Date.now()}${rand}`;
  }

  private phoneOrThrow(phone: unknown, field: string, required = true): string | undefined {
    if (phone === undefined || phone === null || phone === '') {
      if (required) throw new BadRequestException(`${field} is required`);
      return undefined;
    }
    try {
      return validateAndNormalizePhone(String(phone));
    } catch (e) {
      throw new BadRequestException(`${field}: ${e.message}`);
    }
  }

  private coordsOrThrow(lat: unknown, lng: unknown, label: string): { lat: number; lng: number } {
    if (lat === undefined || lat === null || lng === undefined || lng === null || lat === '' || lng === '') {
      throw new BadRequestException(`${label} GPS location is required`);
    }
    try {
      return validateGPSCoordinates(lat as any, lng as any, false);
    } catch (e) {
      throw new BadRequestException(`${label}: ${e.message}`);
    }
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

    // Note: Pickup coordinates are optional for pending orders
    // They will be added when sender selects pickup location later
    // For now, we just need sender/recipient info to generate the link

    const order = this.orderRepository.create({
      id: orderId,
      ...dto,
      status: 'awaiting_recipient_location',
      shareableLink: `https://harakabackend.onrender.com/select-location/${orderId}`,
      orderType: 'parcel', // Ensure it's marked as parcel
    });

    const savedOrder = await this.orderRepository.save(order);

    console.log('✅ Pending order created successfully');
    console.log('🔗 Shareable link:', savedOrder.shareableLink);
    console.log('📋 Order ID:', savedOrder.id);

    return savedOrder;
  }

  // Update delivery location (when recipient selects their location)
  async updateDeliveryLocation(orderId: string, dto: UpdateDeliveryLocationDto) {
    const order = await this.orderRepository.findOne({ where: { id: orderId } });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // The public recipient link may only set the location before the order is confirmed.
    if (!['awaiting_recipient_location', 'ready_for_confirmation'].includes(order.status)) {
      throw new BadRequestException('Delivery location can no longer be changed for this order');
    }
    const v = this.coordsOrThrow(dto.deliveryLatitude, dto.deliveryLongitude, 'Delivery');
    dto.deliveryLatitude = v.lat;
    dto.deliveryLongitude = v.lng;

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
    order.total = pricing.total; // Save top-level total for easy access
    order.status = 'ready_for_confirmation';

    const updatedOrder = await this.orderRepository.save(order);

    console.log('✅ Order updated in database');

    return updatedOrder;
  }

  /**
   * Create a food or parcel order from the customer app.
   *
   * SECURITY: the request body is never spread into the entity. Only
   * whitelisted contact/location fields are copied, and every amount
   * (item prices, distance, delivery fee, total) is recomputed on the server
   * from the database and GPS coordinates - so a tampered client cannot
   * choose its own price, status or payment status.
   */
  async createOrder(orderData: any): Promise<Order> {
    if (!orderData || typeof orderData !== 'object') {
      throw new BadRequestException('Invalid order');
    }

    const isFood = Array.isArray(orderData.items) && orderData.items.length > 0;
    const orderId = this.generateOrderId();

    const delivery = this.coordsOrThrow(orderData.deliveryLatitude, orderData.deliveryLongitude, 'Delivery');
    const senderPhone = this.phoneOrThrow(orderData.senderPhone ?? orderData.customerPhone, 'Phone number');
    const recipientPhone = this.phoneOrThrow(orderData.recipientPhone, 'Recipient phone', !isFood);

    const base: Partial<Order> = {
      id: orderId,
      senderName: str(orderData.senderName, 120),
      senderPhone,
      senderEmail: str(orderData.senderEmail, 200),
      recipientName: str(orderData.recipientName, 120),
      recipientPhone,
      customerPhone: senderPhone,
      deliveryLatitude: delivery.lat,
      deliveryLongitude: delivery.lng,
      deliveryAddress: str(orderData.deliveryAddress, 300),
      notes: str(orderData.notes, 1000),
      paymentMethod: str(orderData.paymentMethod, 50),
    };

    let order: Order;

    if (isFood) {
      const restaurantName = str(orderData.restaurantName ?? orderData.restaurant, 200);
      const merchantId = Number(orderData.merchantId ?? orderData.restaurantId);
      const merchant = await this.merchantRepository.findOne({
        where: Number.isInteger(merchantId) && merchantId > 0 ? { id: merchantId, isActive: true } : { name: restaurantName, isActive: true },
      });
      if (!merchant) {
        throw new BadRequestException('This restaurant is not available');
      }

      if (orderData.items.length > MAX_ITEMS_PER_ORDER) {
        throw new BadRequestException('Too many items in one order');
      }

      const menu = await this.menuItemRepository.find({ where: { merchantId: merchant.id } });
      const byId = new Map(menu.map((m) => [String(m.id), m]));
      const byName = new Map(menu.map((m) => [m.name.trim().toLowerCase(), m]));

      let subtotal = 0;
      const items = orderData.items.map((raw: any) => {
        const menuItem =
          (raw?.id != null && byId.get(String(raw.id))) ||
          (raw?.menuItemId != null && byId.get(String(raw.menuItemId))) ||
          byName.get(String(raw?.name ?? '').trim().toLowerCase());
        if (!menuItem) {
          throw new BadRequestException(`"${raw?.name ?? 'Item'}" is not on ${merchant.name}'s menu`);
        }
        if (menuItem.isAvailable === false) {
          throw new BadRequestException(`"${menuItem.name}" is currently unavailable`);
        }
        const quantity = Math.floor(Number(raw?.quantity ?? 1));
        if (!Number.isFinite(quantity) || quantity < 1 || quantity > MAX_QTY_PER_ITEM) {
          throw new BadRequestException(`Invalid quantity for "${menuItem.name}"`);
        }
        const price = parseFloat(menuItem.price.toString());
        subtotal += price * quantity;
        return { id: menuItem.id, name: menuItem.name, quantity, price };
      });

      const pickup =
        merchant.latitude != null && merchant.longitude != null
          ? { lat: parseFloat(merchant.latitude.toString()), lng: parseFloat(merchant.longitude.toString()) }
          : FALLBACK_RESTAURANT_LOCATION;

      const distance = this.calculateDistance(pickup.lat, pickup.lng, delivery.lat, delivery.lng);
      const deliveryFee = Math.round(this.pricingService.calculateDeliveryFee(distance, 'motorcycle').total);
      const total = Math.round(subtotal + deliveryFee + FOOD_SERVICE_FEE);

      const clientTotal = Number(orderData.total);
      if (Number.isFinite(clientTotal) && Math.abs(clientTotal - total) > 1) {
        this.logger.warn(`Order ${orderId}: client total ${clientTotal} != server total ${total} (server value used)`);
      }

      order = this.orderRepository.create({
        ...base,
        orderType: 'food',
        status: 'pending',

        restaurant: merchant.name,
        restaurantName: merchant.name,
        items,
        pickupLatitude: pickup.lat,
        pickupLongitude: pickup.lng,
        pickupAddress: merchant.location ? `${merchant.name}, ${merchant.location}` : merchant.name,
        vehicleType: 'motorcycle',
        distance: Math.round(distance * 100) / 100,
        deliveryFee,
        total,
        pricing: { total, breakdown: { subtotal, delivery: deliveryFee, service: FOOD_SERVICE_FEE } },
      });
    } else {
      // 📦 PARCEL: pickup GPS is mandatory, price is distance based
      const pickup = this.coordsOrThrow(orderData.pickupLatitude, orderData.pickupLongitude, 'Pickup');
      const vehicleType: 'motorcycle' | 'car' = orderData.vehicleType === 'car' ? 'car' : 'motorcycle';
      const distance = this.calculateDistance(pickup.lat, pickup.lng, delivery.lat, delivery.lng);
      const pricing = this.pricingService.calculateDeliveryFee(distance, vehicleType);
      const total = Math.round(pricing.total);
      const receiverPays = orderData.paidBy === 'receiver' || orderData.receiverPaysOnDelivery === true;

      order = this.orderRepository.create({
        ...base,
        orderType: 'parcel',
        // Parcel orders skip the restaurant and go straight to couriers
        status: 'ready_for_pickup',

        pickupLatitude: pickup.lat,
        pickupLongitude: pickup.lng,
        pickupAddress: str(orderData.pickupAddress, 300),
        packageSize: str(orderData.packageSize, 50),
        packageDescription: str(orderData.packageDescription ?? orderData.parcelDescription, 500),
        parcelDescription: str(orderData.parcelDescription ?? orderData.packageDescription, 500),
        vehicleType,
        distance: Math.round(distance * 100) / 100,
        deliveryFee: total,
        total,
        pricing,
        receiverPaysOnDelivery: receiverPays,
      });
    }

    const savedOrder = await this.orderRepository.save(order);
    return savedOrder as unknown as Order;
  }

  /** Public lookup of a customer's own orders by the IDs stored on their device. */
  async getOrdersByIds(ids: string[]) {
    const clean = [...new Set((ids || []).filter((id) => typeof id === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(id)))].slice(0, 100);
    if (!clean.length) return [];
    return this.orderRepository.find({ where: { id: In(clean) }, order: { createdAt: 'DESC' } });
  }

  async getOrdersForRestaurant(restaurantName: string) {
    return this.orderRepository.find({
      where: { restaurantName, orderType: 'food' },
      order: { createdAt: 'DESC' },
      take: 500,
    });
  }

  async getOrderById(id: string) {
    return await this.orderRepository.findOne({ where: { id } });
  }

  async getOrderByDepositId(depositId: string) {
    return await this.orderRepository.findOne({ where: { depositId } });
  }

  async getAllOrders() {
    return await this.orderRepository.find({
      order: { createdAt: 'DESC' }, // Newest first
    });
  }

  async updateOrder(order: any) {
    return await this.orderRepository.save(order);
  }
}
