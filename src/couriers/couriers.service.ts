import { Injectable, UnauthorizedException, ConflictException, BadRequestException, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Courier } from './entities/courier.entity';
import { Order } from '../orders/entities/order.entity';
import { TokenService } from '../auth/token.service';
import { TwilioSmsService } from '../notifications/twilio-sms.service';
import { assertStrongPassword, BCRYPT_ROUNDS } from '../auth/auth.service';
import { validateAndNormalizePhone } from '../utils/validation';
import * as bcrypt from 'bcrypt';

const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-real-password', BCRYPT_ROUNDS);

/** Statuses in which an order is "with" the courier. */
const ACTIVE_COURIER_STATUSES = ['assigned', 'picked_up', 'in_transit'];

@Injectable()
export class CouriersService {
  private readonly logger = new Logger(CouriersService.name);

  constructor(
    @InjectRepository(Courier)
    private courierRepository: Repository<Courier>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    private tokenService: TokenService,
    private twilioSmsService: TwilioSmsService,
  ) {}

  private publicCourier(courier: Courier) {
    return {
      id: courier.id,
      name: courier.name,
      phoneNumber: courier.phoneNumber,
      vehicleType: courier.vehicleType,
      vehicleNumber: courier.vehicleNumber,
      rating: parseFloat(courier.rating?.toString() || '5'),
      totalDeliveries: courier.totalDeliveries,
    };
  }

  private normalisePhone(phone: unknown): string {
    if (typeof phone !== 'string' || !phone.trim()) {
      throw new BadRequestException('Phone number is required');
    }
    try {
      return validateAndNormalizePhone(phone);
    } catch (e) {
      throw new BadRequestException(e.message);
    }
  }

  /** Candidate stored formats for a phone (legacy rows may be un-normalised). */
  private phoneVariants(raw: string): string[] {
    const variants = new Set<string>([raw.trim()]);
    try {
      const n = validateAndNormalizePhone(raw); // +2507XXXXXXXX
      variants.add(n);
      variants.add(n.slice(1)); // 2507XXXXXXXX
      variants.add(`0${n.slice(4)}`); // 07XXXXXXXX
      variants.add(n.slice(4)); // 7XXXXXXXX
    } catch {
      /* keep raw only */
    }
    return [...variants];
  }

  async register(data: {
    name: string;
    phoneNumber: string;
    password: string;
    vehicleType: string;
    vehicleNumber: string;
  }) {
    if (!data || typeof data.name !== 'string' || !data.name.trim()) {
      throw new BadRequestException('Name is required');
    }
    if (typeof data.vehicleNumber !== 'string' || !data.vehicleNumber.trim()) {
      throw new BadRequestException('Vehicle number is required');
    }
    assertStrongPassword(data.password, 6);
    const phoneNumber = this.normalisePhone(data.phoneNumber);

    const existing = await this.courierRepository.findOne({
      where: this.phoneVariants(data.phoneNumber).map((p) => ({ phoneNumber: p })),
    });
    if (existing) {
      throw new ConflictException('Phone number already registered');
    }

    const requireApproval = process.env.COURIER_REQUIRE_APPROVAL !== 'false';

    // Only whitelisted fields - never spread the request body into the entity.
    const courier = this.courierRepository.create({
      name: data.name.trim(),
      phoneNumber,
      password: await bcrypt.hash(data.password, BCRYPT_ROUNDS),
      vehicleType: data.vehicleType === 'car' ? 'car' : 'motorcycle',
      vehicleNumber: data.vehicleNumber.trim().toUpperCase(),
      isActive: true,
      isApproved: !requireApproval,
    });
    await this.courierRepository.save(courier);

    this.logger.log(`New courier registered: ${courier.name} (${courier.id}), approved=${courier.isApproved}`);

    if (!courier.isApproved) {
      return {
        success: true,
        pendingApproval: true,
        message: 'Registration received. Haraka will verify your details and approve your account before you can log in.',
        courier: this.publicCourier(courier),
      };
    }

    return {
      success: true,
      token: this.tokenService.issue('courier', courier.id),
      courier: this.publicCourier(courier),
    };
  }

  async login(phoneNumber: string, password: string) {
    if (typeof phoneNumber !== 'string' || typeof password !== 'string' || !phoneNumber || !password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const courier = await this.courierRepository
      .createQueryBuilder('courier')
      .addSelect('courier.password')
      .where('courier.phoneNumber IN (:...phones)', { phones: this.phoneVariants(phoneNumber) })
      .getOne();

    const isPasswordValid = await bcrypt.compare(password, courier?.password || DUMMY_HASH);
    if (!courier || !isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!courier.isActive) {
      throw new ForbiddenException('Your courier account has been deactivated. Contact Haraka support.');
    }
    if (courier.isApproved === false) {
      throw new ForbiddenException('Your courier account is awaiting approval by Haraka.');
    }

    return {
      success: true,
      token: this.tokenService.issue('courier', courier.id),
      courier: this.publicCourier(courier),
    };
  }

  // ---------------------------------------------------------------- admin

  async listCouriers() {
    const couriers = await this.courierRepository.find({ order: { createdAt: 'DESC' } });
    return couriers.map((c) => ({
      ...this.publicCourier(c),
      totalEarnings: parseFloat(c.totalEarnings?.toString() || '0'),
      status: c.status,
      isActive: c.isActive,
      isApproved: c.isApproved,
      createdAt: c.createdAt,
    }));
  }

  async setCourierFlags(id: number, flags: { isApproved?: boolean; isActive?: boolean }) {
    const courier = await this.courierRepository.findOne({ where: { id } });
    if (!courier) throw new NotFoundException('Courier not found');
    if (typeof flags.isApproved === 'boolean') courier.isApproved = flags.isApproved;
    if (typeof flags.isActive === 'boolean') courier.isActive = flags.isActive;
    await this.courierRepository.save(courier);
    this.logger.log(`Courier ${id} updated: approved=${courier.isApproved}, active=${courier.isActive}`);
    return { success: true, courier: { ...this.publicCourier(courier), isActive: courier.isActive, isApproved: courier.isApproved } };
  }

  async getAvailableJobs() {
    // Show jobs that are ready for courier pickup:
    // - 'ready': Food orders that restaurant marked as ready
    // - 'ready_for_pickup': Parcel orders that skip restaurant and go directly to courier
    const jobs = await this.orderRepository.find({
      where: { status: In(['ready', 'ready_for_pickup']) },
      order: { createdAt: 'DESC' },
      take: 20,
    });

    return jobs.map(job => {
      // Determine order type: if it has items array, it's food, otherwise parcel
      const isFood = job.items && Array.isArray(job.items) && job.items.length > 0;
      const orderType = isFood ? 'food' : 'parcel';

      // Extract delivery fee from pricing if not directly available
      let deliveryFee = job.deliveryFee;
      if (!deliveryFee && job.pricing && typeof job.pricing === 'object') {
        const pricing = job.pricing as any;
        deliveryFee = pricing.breakdown?.delivery || pricing.breakdown?.total || 0;
      }

      // For food orders, pickup is restaurant location (use a default for now)
      // For parcel orders, use the sender's pickup location
      const pickupAddress = isFood
        ? (job.restaurant || 'Restaurant Location')
        : (job.pickupAddress || 'Pickup Location');

      return {
        id: job.id,
        orderId: job.id,
        orderType: orderType,
        restaurantName: isFood ? job.restaurant : null,
        description: !isFood ? (job.packageDescription || job.parcelDescription || 'Parcel') : null,
        pickupAddress: pickupAddress,
        deliveryAddress: job.deliveryAddress || 'Delivery Location',
        pickupLatitude: job.pickupLatitude,
        pickupLongitude: job.pickupLongitude,
        deliveryLatitude: job.deliveryLatitude,
        deliveryLongitude: job.deliveryLongitude,
        distance: parseFloat(job.distance?.toString() || '0'),
        deliveryFee: parseFloat(deliveryFee?.toString() || '0'),
        estimatedTime: Math.round(parseFloat(job.distance?.toString() || '0') * 5),
        customerPhone: job.senderPhone || job.recipientPhone || null,
        recipientPhone: job.recipientPhone,
        senderName: job.senderName,
        recipientName: job.recipientName,
        items: job.items,
      };
    });
  }

  async acceptJob(orderId: string, courierId: number) {
    const courier = await this.courierRepository.findOne({ where: { id: courierId } });
    if (!courier) {
      return { success: false, message: 'Courier not found' };
    }

    // Atomic claim: only succeeds if the job is still open, so two couriers
    // tapping "accept" at the same time can never both get the order.
    const now = new Date();
    const result = await this.orderRepository
      .createQueryBuilder()
      .update(Order)
      .set({
        courierId,
        courierName: courier.name || courier.phoneNumber || 'Courier',
        courierPhone: courier.phoneNumber || '',
        status: 'assigned',
        assignedAt: now,
      })
      .where('id = :orderId', { orderId })
      .andWhere('status IN (:...open)', { open: ['ready', 'ready_for_pickup'] })
      .andWhere('"courierId" IS NULL')
      .execute();

    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order) {
      return { success: false, message: 'Order not found' };
    }
    if (!result.affected) {
      return {
        success: false,
        message: `Order not available for pickup. Current status: ${order.status}`,
      };
    }

    courier.status = 'busy';
    await this.courierRepository.save(courier);

    const customerPhone = order.senderPhone || order.recipientPhone || order.customerPhone;
    if (customerPhone) {
      this.twilioSmsService
        .sendCourierAssigned(customerPhone, order.id.substring(0, 8).toUpperCase())
        .catch((err) => this.logger.error(`SMS send failed: ${err.message}`));
    }

    return { success: true, order };
  }

  async updateJobStatus(orderId: string, status: string, courierId: number, location?: { latitude: number; longitude: number }) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
    });

    if (!order) {
      return { success: false, message: 'Order not found' };
    }

    // SECURITY: a courier may only update jobs assigned to them.
    if (order.courierId !== courierId) {
      throw new ForbiddenException('This job is not assigned to you');
    }

    const statusMap: Record<string, string> = {
      heading_to_pickup: 'assigned',
      arrived_at_pickup: 'assigned',
      picked_up: 'in_transit',
      in_transit: 'in_transit',
      delivered: 'delivered',
    };

    const newStatus = statusMap[status];
    if (!newStatus) {
      throw new BadRequestException(`Invalid courier status: ${status}`);
    }

    // Allowed courier transitions (prevents re-delivering / double-counting earnings)
    const allowedFrom: Record<string, string[]> = {
      assigned: ['assigned'],
      in_transit: ['assigned', 'picked_up', 'in_transit'],
      delivered: ['picked_up', 'in_transit'],
    };
    if (!allowedFrom[newStatus].includes(order.status)) {
      throw new BadRequestException(`Cannot change job from "${order.status}" to "${newStatus}"`);
    }

    const previousStatus = order.status;
    const now = new Date();
    order.status = newStatus;
    if (newStatus === 'in_transit' && !order.pickedUpAt) order.pickedUpAt = now;
    if (newStatus === 'delivered' && !order.deliveredAt) order.deliveredAt = now;

    if (location && Number.isFinite(Number(location.latitude)) && Number.isFinite(Number(location.longitude))) {
      order.courierLatitude = Number(location.latitude);
      order.courierLongitude = Number(location.longitude);
    }

    await this.orderRepository.save(order);

    // SMS notifications for the customer
    const customerPhone = order.senderPhone || order.recipientPhone || order.customerPhone;
    const shortId = order.id.substring(0, 8).toUpperCase();
    const orderType = order.orderType || 'food';
    const sms = (p: Promise<boolean>) => p.catch((err) => this.logger.error(`SMS send failed: ${err.message}`));
    if (customerPhone) {
      if (status === 'arrived_at_pickup') {
        sms(this.twilioSmsService.sendCourierArrivedAtPickup(customerPhone, shortId, order.restaurant || order.restaurantName || 'the restaurant'));
      } else if (newStatus === 'in_transit' && previousStatus === 'assigned') {
        sms(this.twilioSmsService.sendOrderPickedUp(customerPhone, shortId, order.courierName || 'Your courier', orderType));
      } else if (newStatus === 'delivered' && previousStatus !== 'delivered') {
        sms(this.twilioSmsService.sendOrderDelivered(customerPhone, shortId, orderType));
      }
    }

    if (newStatus === 'delivered' && previousStatus !== 'delivered') {
      const courier = await this.courierRepository.findOne({
        where: { id: courierId },
      });

      if (courier) {
        courier.totalDeliveries += 1;
        const deliveryFee = parseFloat(order.deliveryFee?.toString() || '0');
        const currentEarnings = parseFloat(courier.totalEarnings?.toString() || '0');
        courier.totalEarnings = currentEarnings + deliveryFee;
        courier.status = 'online';
        await this.courierRepository.save(courier);
      }
    }

    return { success: true, order };
  }

  async getActiveJobs(courierId: number) {
    const jobs = await this.orderRepository.find({
      where: { courierId, status: In(ACTIVE_COURIER_STATUSES) },
      order: { assignedAt: 'DESC' },
    });

    return jobs;
  }

  async getJobHistory(courierId: number) {
    const jobs = await this.orderRepository.find({
      where: { courierId, status: 'delivered' },
      order: { createdAt: 'DESC' },
      take: 50,
    });

    return jobs.map(job => ({
      id: job.id,
      orderId: job.id,
      orderType: job.orderType,
      restaurantName: job.restaurantName,
      description: job.parcelDescription,
      pickupAddress: job.pickupAddress,
      deliveryAddress: job.deliveryAddress,
      distance: job.distance,
      deliveryFee: job.deliveryFee,
      completedAt: job.updatedAt,
    }));
  }

  async getEarnings(courierId: number) {
    const courier = await this.courierRepository.findOne({
      where: { id: courierId },
    });

    if (!courier) {
      return {
        totalEarnings: 0,
        todayEarnings: 0,
        weekEarnings: 0,
        monthEarnings: 0,
        totalDeliveries: 0,
        foodDeliveryEarnings: 0,
        parcelDeliveryEarnings: 0,
      };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    const todayJobs = await this.orderRepository
      .createQueryBuilder('order')
      .where('order.courierId = :courierId', { courierId })
      .andWhere('order.status = :status', { status: 'delivered' })
      .andWhere('order.updatedAt >= :today', { today })
      .getMany();

    const weekJobs = await this.orderRepository
      .createQueryBuilder('order')
      .where('order.courierId = :courierId', { courierId })
      .andWhere('order.status = :status', { status: 'delivered' })
      .andWhere('order.updatedAt >= :weekAgo', { weekAgo })
      .getMany();

    const monthJobs = await this.orderRepository
      .createQueryBuilder('order')
      .where('order.courierId = :courierId', { courierId })
      .andWhere('order.status = :status', { status: 'delivered' })
      .andWhere('order.updatedAt >= :monthAgo', { monthAgo })
      .getMany();

    const allJobs = await this.orderRepository.find({
      where: { courierId, status: 'delivered' },
    });

    const todayEarnings = todayJobs.reduce((sum, job) => sum + parseFloat(job.deliveryFee?.toString() || '0'), 0);
    const weekEarnings = weekJobs.reduce((sum, job) => sum + parseFloat(job.deliveryFee?.toString() || '0'), 0);
    const monthEarnings = monthJobs.reduce((sum, job) => sum + parseFloat(job.deliveryFee?.toString() || '0'), 0);

    const foodEarnings = allJobs.filter(j => j.orderType === 'food').reduce((sum, job) => sum + parseFloat(job.deliveryFee?.toString() || '0'), 0);
    const parcelEarnings = allJobs.filter(j => j.orderType === 'parcel').reduce((sum, job) => sum + parseFloat(job.deliveryFee?.toString() || '0'), 0);

    return {
      totalEarnings: parseFloat(courier.totalEarnings?.toString() || '0'),
      todayEarnings,
      weekEarnings,
      monthEarnings,
      totalDeliveries: courier.totalDeliveries,
      foodDeliveryEarnings: foodEarnings,
      parcelDeliveryEarnings: parcelEarnings,
    };
  }

  async updateLocation(courierId: number, latitude: number, longitude: number) {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      throw new BadRequestException('Invalid coordinates');
    }
    const courier = await this.courierRepository.findOne({
      where: { id: courierId },
    });

    if (courier) {
      courier.currentLatitude = latitude;
      courier.currentLongitude = longitude;
      await this.courierRepository.save(courier);
    }

    return { success: true };
  }

  async getCourierProfile(courierId: number) {
    const courier = await this.courierRepository.findOne({
      where: { id: courierId },
    });

    if (!courier) {
      return null;
    }

    return {
      id: courier.id,
      name: courier.name,
      phoneNumber: courier.phoneNumber,
      vehicleType: courier.vehicleType,
      vehicleNumber: courier.vehicleNumber,
      rating: parseFloat(courier.rating?.toString() || '5.0'),
      totalDeliveries: courier.totalDeliveries,
      totalEarnings: parseFloat(courier.totalEarnings?.toString() || '0'),
      status: courier.status,
    };
  }

  async updateCourierProfile(courierId: number, data: any) {
    const courier = await this.courierRepository.findOne({
      where: { id: courierId },
    });

    if (!courier) {
      return { success: false, message: 'Courier not found' };
    }

    if (data.name) courier.name = String(data.name).trim();
    if (data.vehicleType) courier.vehicleType = data.vehicleType === 'car' ? 'car' : 'motorcycle';
    if (data.vehicleNumber) courier.vehicleNumber = String(data.vehicleNumber).trim().toUpperCase();

    await this.courierRepository.save(courier);

    return {
      success: true,
      courier: await this.getCourierProfile(courierId),
    };
  }
}
