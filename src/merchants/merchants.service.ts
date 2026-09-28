import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../orders/entities/order.entity';
import { Merchant } from './entities/merchant.entity';
import { MenuItem } from './entities/menu-item.entity';
import { PaymentsService } from '../payments/payments.service';

@Injectable()
export class MerchantsService {
  private readonly logger = new Logger(MerchantsService.name);

  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(Merchant)
    private merchantRepository: Repository<Merchant>,
    @InjectRepository(MenuItem)
    private menuItemRepository: Repository<MenuItem>,
    private paymentsService: PaymentsService,
  ) {}

  // Helper to check if restaurant is currently open
  private isCurrentlyOpen(hours: any): boolean {
    if (!hours) return false;

    const now = new Date();
    const currentDay = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()];
    const currentTime = now.getHours() * 60 + now.getMinutes(); // minutes since midnight

    const todayHours = hours[currentDay];
    if (!todayHours || !todayHours.open || !todayHours.close) {
      return false;
    }

    const [openHour, openMin] = todayHours.open.split(':').map(Number);
    const [closeHour, closeMin] = todayHours.close.split(':').map(Number);

    const openTime = openHour * 60 + openMin;
    const closeTime = closeHour * 60 + closeMin;

    return currentTime >= openTime && currentTime < closeTime;
  }

  // Helper to get next opening time
  private getNextOpeningTime(hours: any): string {
    if (!hours) return 'Opens soon';

    const now = new Date();
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const currentDay = days[now.getDay()];

    // Check if opens later today
    const todayHours = hours[currentDay];
    if (todayHours && todayHours.open) {
      const currentTime = now.getHours() * 60 + now.getMinutes();
      const [openHour, openMin] = todayHours.open.split(':').map(Number);
      const openTime = openHour * 60 + openMin;

      if (currentTime < openTime) {
        return `Opens at ${todayHours.open}`;
      }
    }

    // Check tomorrow
    const tomorrowIndex = (now.getDay() + 1) % 7;
    const tomorrow = days[tomorrowIndex];
    const tomorrowHours = hours[tomorrow];

    if (tomorrowHours && tomorrowHours.open) {
      return `Opens tomorrow at ${tomorrowHours.open}`;
    }

    return 'Opens soon';
  }

  private getClosingTime(hours: any): string {
    if (!hours) return 'later';

    const now = new Date();
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const currentDay = days[now.getDay()];
    const todayHours = hours[currentDay];

    if (todayHours && todayHours.close) {
      return todayHours.close;
    }

    return 'later';
  }

  /**
   * 📋 GET ALL MERCHANTS (from database, not hardcoded)
   */
  async getAllMerchants() {
    const merchants = await this.merchantRepository.find({
      where: { isActive: true },
      order: { rating: 'DESC' },
    });

    // Add dynamic isOpen and nextOpenTime to each merchant
    return merchants.map(merchant => ({
      id: merchant.id.toString(),
      name: merchant.name,
      category: merchant.category,
      rating: parseFloat(merchant.rating.toString()),
      deliveryTime: merchant.deliveryTime,
      deliveryFee: parseFloat(merchant.deliveryFee.toString()),
      prepTime: merchant.prepTime,
      image: merchant.image,
      cuisine: merchant.cuisine || [],
      location: merchant.location,
      coordinates: merchant.latitude && merchant.longitude
        ? { lat: parseFloat(merchant.latitude.toString()), lng: parseFloat(merchant.longitude.toString()) }
        : null,
      hours: merchant.hours,
      isOpen: this.isCurrentlyOpen(merchant.hours),
      openingStatus: this.isCurrentlyOpen(merchant.hours)
        ? `Open until ${this.getClosingTime(merchant.hours)}`
        : this.getNextOpeningTime(merchant.hours),
      phone: merchant.phone,
      email: merchant.email,
      description: merchant.description,
      isVerified: merchant.isVerified,
    }));
  }

  /**
   * 🔍 GET MERCHANT BY ID
   */
  async getMerchantById(id: string) {
    const merchant = await this.merchantRepository.findOne({
      where: { id: parseInt(id), isActive: true }
    });

    if (!merchant) {
      throw new NotFoundException(`Merchant with ID ${id} not found`);
    }

    return {
      id: merchant.id.toString(),
      name: merchant.name,
      category: merchant.category,
      rating: parseFloat(merchant.rating.toString()),
      deliveryTime: merchant.deliveryTime,
      deliveryFee: parseFloat(merchant.deliveryFee.toString()),
      prepTime: merchant.prepTime,
      image: merchant.image,
      cuisine: merchant.cuisine || [],
      location: merchant.location,
      coordinates: merchant.latitude && merchant.longitude
        ? { lat: parseFloat(merchant.latitude.toString()), lng: parseFloat(merchant.longitude.toString()) }
        : null,
      hours: merchant.hours,
      phone: merchant.phone,
      email: merchant.email,
      description: merchant.description,
      isVerified: merchant.isVerified,
    };
  }

  /**
   * 🍔 GET MENU ITEMS FOR A MERCHANT
   */
  async getMenuItems(merchantId: string) {
    const menuItems = await this.menuItemRepository.find({
      where: { merchantId: parseInt(merchantId) },
      order: { category: 'ASC', name: 'ASC' },
    });

    return menuItems.map(item => ({
      id: item.id.toString(),
      name: item.name,
      price: parseFloat(item.price.toString()),
      category: item.category,
      image: item.image,
      description: item.description,
      isAvailable: item.isAvailable,
      isPopular: item.isPopular,
      isVegetarian: item.isVegetarian,
      isVegan: item.isVegan,
      isSpicy: item.isSpicy,
      preparationTime: item.preparationTime,
      allergens: item.allergens || [],
    }));
  }

  /**
   * ➕ CREATE NEW MERCHANT (Admin only)
   */
  async createMerchant(data: Partial<Merchant>) {
    const merchant = this.merchantRepository.create(data);
    const saved = await this.merchantRepository.save(merchant);

    this.logger.log(`✅ Created merchant: ${saved.name} (ID: ${saved.id})`);
    return saved;
  }

  /**
   * ✏️ UPDATE MERCHANT
   */
  async updateMerchant(id: number, data: Partial<Merchant>) {
    const merchant = await this.merchantRepository.findOne({ where: { id } });

    if (!merchant) {
      throw new NotFoundException(`Merchant with ID ${id} not found`);
    }

    Object.assign(merchant, data);
    const updated = await this.merchantRepository.save(merchant);

    this.logger.log(`✅ Updated merchant: ${updated.name} (ID: ${updated.id})`);
    return updated;
  }

  /**
   * 🗑️ DELETE MERCHANT (soft delete - sets isActive to false)
   */
  async deleteMerchant(id: number) {
    const merchant = await this.merchantRepository.findOne({ where: { id } });

    if (!merchant) {
      throw new NotFoundException(`Merchant with ID ${id} not found`);
    }

    merchant.isActive = false;
    await this.merchantRepository.save(merchant);

    this.logger.log(`🗑️ Deactivated merchant: ${merchant.name} (ID: ${merchant.id})`);
    return { success: true, message: 'Merchant deactivated' };
  }

  /**
   * ➕ CREATE MENU ITEM
   */
  async createMenuItem(data: Partial<MenuItem>) {
    const menuItem = this.menuItemRepository.create(data);
    const saved = await this.menuItemRepository.save(menuItem);

    this.logger.log(`✅ Created menu item: ${saved.name} (ID: ${saved.id})`);
    return saved;
  }

  /**
   * ✏️ UPDATE MENU ITEM
   */
  async updateMenuItem(id: number, data: Partial<MenuItem>) {
    const menuItem = await this.menuItemRepository.findOne({ where: { id } });

    if (!menuItem) {
      throw new NotFoundException(`Menu item with ID ${id} not found`);
    }

    Object.assign(menuItem, data);
    const updated = await this.menuItemRepository.save(menuItem);

    this.logger.log(`✅ Updated menu item: ${updated.name} (ID: ${updated.id})`);
    return updated;
  }

  /**
   * 🗑️ DELETE MENU ITEM
   */
  async deleteMenuItem(id: number) {
    const menuItem = await this.menuItemRepository.findOne({ where: { id } });

    if (!menuItem) {
      throw new NotFoundException(`Menu item with ID ${id} not found`);
    }

    await this.menuItemRepository.remove(menuItem);

    this.logger.log(`🗑️ Deleted menu item: ${menuItem.name} (ID: ${menuItem.id})`);
    return { success: true, message: 'Menu item deleted' };
  }

  /**
   * 📊 Calculate restaurant earnings from completed paid orders
   */
  async calculateEarnings(restaurantName: string) {
    // Get all delivered and paid food orders for this restaurant
    const orders = await this.orderRepository.find({
      where: {
        restaurantName,
        orderType: 'food',
        status: 'delivered',
        paymentStatus: 'paid',
      },
    });

    // Calculate total earnings (food cost, not including delivery fee which goes to platform/courier)
    let totalEarnings = 0;
    let totalOrders = orders.length;
    let pendingWithdrawal = 0; // Amount that can be withdrawn

    orders.forEach(order => {
      // Restaurant gets the food cost (total - delivery fee)
      const orderTotal = parseFloat(order.total?.toString() || '0');
      const deliveryFee = parseFloat(order.deliveryFee?.toString() || '0');
      const foodCost = orderTotal - deliveryFee;

      totalEarnings += foodCost;
      pendingWithdrawal += foodCost; // For now, all earnings are available for withdrawal
    });

    this.logger.log(`📊 Restaurant ${restaurantName} earnings: ${totalEarnings} RWF from ${totalOrders} orders`);

    return {
      restaurantName,
      totalEarnings: Math.round(totalEarnings),
      totalOrders,
      availableForWithdrawal: Math.round(pendingWithdrawal),
      currency: 'RWF',
    };
  }

  /**
   * 💸 Withdraw earnings to Mobile Money via PawaPay
   */
  async withdrawEarnings(restaurantName: string, amount: number, phoneNumber: string) {
    // Validate amount
    if (amount <= 0) {
      throw new Error('Withdrawal amount must be greater than 0');
    }

    // Check if restaurant has sufficient earnings
    const earnings = await this.calculateEarnings(restaurantName);

    if (amount > earnings.availableForWithdrawal) {
      throw new Error(`Insufficient funds. Available: ${earnings.availableForWithdrawal} RWF`);
    }

    this.logger.log(`💸 Processing withdrawal for ${restaurantName}: ${amount} RWF to ${phoneNumber}`);

    // Process withdrawal using PawaPay payout
    try {
      const result = await this.paymentsService.initiateDeposit({
        orderId: `WITHDRAW-${restaurantName}-${Date.now()}`,
        amount,
        phoneNumber,
        description: `Earnings withdrawal`,
      });

      if (result.success) {
        this.logger.log(`✅ Withdrawal initiated successfully`);
        return {
          success: true,
          message: 'Withdrawal initiated. Check your phone for confirmation.',
          depositId: result.depositId,
          amount,
          phoneNumber,
        };
      } else {
        this.logger.error(`❌ Withdrawal failed: ${result.error}`);
        return {
          success: false,
          error: result.error || 'Withdrawal failed',
        };
      }
    } catch (error) {
      this.logger.error(`❌ Withdrawal error: ${error.message}`);
      throw error;
    }
  }
}
