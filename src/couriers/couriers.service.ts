import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Courier } from './entities/courier.entity';
import { Order } from '../orders/entities/order.entity';
import * as bcrypt from 'bcrypt';

@Injectable()
export class CouriersService {
  constructor(
    @InjectRepository(Courier)
    private courierRepository: Repository<Courier>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
  ) {}

  async register(data: {
    name: string;
    phoneNumber: string;
    password: string;
    vehicleType: string;
    vehicleNumber: string;
  }) {
    const existing = await this.courierRepository.findOne({
      where: { phoneNumber: data.phoneNumber },
    });

    if (existing) {
      throw new ConflictException('Phone number already registered');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const courier = this.courierRepository.create({
      ...data,
      password: hashedPassword,
    });

    await this.courierRepository.save(courier);

    return {
      success: true,
      token: `courier_${courier.id}_${Date.now()}`,
      courier: {
        id: courier.id,
        name: courier.name,
        phoneNumber: courier.phoneNumber,
        vehicleType: courier.vehicleType,
        vehicleNumber: courier.vehicleNumber,
        rating: courier.rating,
        totalDeliveries: courier.totalDeliveries,
      },
    };
  }

  async login(phoneNumber: string, password: string) {
    const courier = await this.courierRepository.findOne({
      where: { phoneNumber },
    });

    if (!courier) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, courier.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      success: true,
      token: `courier_${courier.id}_${Date.now()}`,
      courier: {
        id: courier.id,
        name: courier.name,
        phoneNumber: courier.phoneNumber,
        vehicleType: courier.vehicleType,
        vehicleNumber: courier.vehicleNumber,
        rating: courier.rating,
        totalDeliveries: courier.totalDeliveries,
      },
    };
  }

  async getAvailableJobs() {
    const jobs = await this.orderRepository.find({
      where: { status: 'confirmed' },
      order: { createdAt: 'DESC' },
      take: 20,
    });

    return jobs.map(job => ({
      id: job.id,
      orderId: job.id,
      orderType: job.orderType,
      restaurantName: job.restaurantName,
      description: job.parcelDescription,
      pickupAddress: job.pickupAddress,
      deliveryAddress: job.deliveryAddress,
      pickupLatitude: job.pickupLatitude,
      pickupLongitude: job.pickupLongitude,
      deliveryLatitude: job.deliveryLatitude,
      deliveryLongitude: job.deliveryLongitude,
      distance: job.distance,
      deliveryFee: job.deliveryFee,
      estimatedTime: Math.round(parseFloat(job.distance?.toString() || '0') * 5),
      customerPhone: job.customerPhone,
      recipientPhone: job.recipientPhone,
      senderName: job.senderName,
      recipientName: job.recipientName,
      items: job.items,
    }));
  }

  async acceptJob(orderId: string, courierId: number) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
    });

    if (!order) {
      return { success: false, message: 'Order not found' };
    }

    if (order.status !== 'confirmed') {
      return { success: false, message: 'Order already assigned or completed' };
    }

    order.courierId = courierId;
    order.status = 'assigned';
    await this.orderRepository.save(order);

    const courier = await this.courierRepository.findOne({
      where: { id: courierId },
    });

    if (courier) {
      courier.status = 'busy';
      await this.courierRepository.save(courier);
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

    const statusMap = {
      'heading_to_pickup': 'assigned',
      'arrived_at_pickup': 'assigned',
      'picked_up': 'in_transit',
      'delivered': 'delivered',
    };

    order.status = statusMap[status] || order.status;

    if (location) {
      order.courierLatitude = location.latitude;
      order.courierLongitude = location.longitude;
    }

    await this.orderRepository.save(order);

    if (status === 'delivered') {
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
      where: { courierId, status: 'assigned' },
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

    if (data.name) courier.name = data.name;
    if (data.vehicleType) courier.vehicleType = data.vehicleType;
    if (data.vehicleNumber) courier.vehicleNumber = data.vehicleNumber;

    await this.courierRepository.save(courier);

    return {
      success: true,
      courier: await this.getCourierProfile(courierId),
    };
  }
}
