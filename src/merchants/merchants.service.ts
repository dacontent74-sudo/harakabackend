import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { Order } from '../orders/entities/order.entity';
import { Merchant } from './entities/merchant.entity';
import { MenuItem } from './entities/menu-item.entity';
import { Withdrawal } from './entities/withdrawal.entity';
import { PaymentsService } from '../payments/payments.service';
import { TokenService } from '../auth/token.service';
import { assertStrongPassword, BCRYPT_ROUNDS } from '../auth/auth.service';
import { validateAndNormalizePhone, validateGPSCoordinates } from '../utils/validation';

const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-real-password', BCRYPT_ROUNDS);

/** Fields an admin may set on a restaurant. Anything else in the body is ignored. */
const MERCHANT_FIELDS = [
  'name', 'category', 'rating', 'deliveryTime', 'deliveryFee', 'prepTime', 'image', 'cuisine',
  'location', 'latitude', 'longitude', 'hours', 'isActive', 'isVerified', 'phone', 'email', 'description',
] as const;

/** Fields an admin may set on a menu item. */
const MENU_ITEM_FIELDS = [
  'name', 'price', 'category', 'image', 'description', 'isAvailable', 'isPopular',
  'isVegetarian', 'isVegan', 'isSpicy', 'preparationTime', 'allergens',
] as const;

/** Withdrawal statuses that reserve part of the restaurant balance. */
const RESERVING_WITHDRAWAL_STATUSES = ['requested', 'processing', 'paid'];

function pick<T extends object>(src: any, keys: readonly string[]): Partial<T> {
  const out: any = {};
  if (!src || typeof src !== 'object') return out;
  for (const k of keys) if (src[k] !== undefined) out[k] = src[k];
  return out;
}

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
    @InjectRepository(Withdrawal)
    private withdrawalRepository: Repository<Withdrawal>,
    private paymentsService: PaymentsService,
    private tokenService: TokenService,
    private dataSource: DataSource,
  ) {}

  /**
   * Current wall-clock time in the business time zone (Kigali by default).
   * Opening hours are entered in local time, but Render servers run in UTC.
   */
  private businessNow(): Date {
    const tz = process.env.BUSINESS_TIMEZONE || 'Africa/Kigali';
    try {
      return new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
    } catch {
      return new Date();
    }
  }

  // Helper to check if restaurant is currently open
  private isCurrentlyOpen(hours: any): boolean {
    if (!hours) return false;

    const now = this.businessNow();
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

    const now = this.businessNow();
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

    const now = this.businessNow();
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const currentDay = days[now.getDay()];
    const todayHours = hours[currentDay];

    if (todayHours && todayHours.close) {
      return todayHours.close;
    }

    return 'later';
  }

  /**
   * 📋 GET ALL MERCHANTS (from database with hardcoded fallback)
   */
  async getAllMerchants() {
    try {
      const merchants = await this.merchantRepository.find({
        where: { isActive: true },
        order: { rating: 'DESC' },
      });

      if (merchants.length > 0) {
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
    } catch (error) {
      this.logger.error(`Failed to load merchants: ${error.message}`);
      throw error;
    }

    // No restaurants yet - never serve fake restaurants customers could order from.
    return [];
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

  /** Validates & normalises an admin-supplied restaurant payload. */
  private sanitizeMerchantInput(data: any, isCreate: boolean): Partial<Merchant> {
    const clean = pick<Merchant>(data, MERCHANT_FIELDS);

    if (isCreate) {
      if (typeof clean.name !== 'string' || !clean.name.trim()) throw new BadRequestException('Restaurant name is required');
      if (typeof clean.category !== 'string' || !clean.category.trim()) throw new BadRequestException('Category is required');
      if (clean.deliveryFee === undefined) clean.deliveryFee = 0;
    }
    if (typeof clean.name === 'string') clean.name = clean.name.trim();

    if (clean.latitude !== undefined || clean.longitude !== undefined) {
      if (clean.latitude == null || clean.longitude == null || (clean.latitude as any) === '' || (clean.longitude as any) === '') {
        clean.latitude = null;
        clean.longitude = null;
      } else {
        try {
          const v = validateGPSCoordinates(clean.latitude, clean.longitude, false);
          clean.latitude = v.lat;
          clean.longitude = v.lng;
        } catch (e) {
          throw new BadRequestException(e.message);
        }
      }
    }

    if (clean.phone) {
      try {
        clean.phone = validateAndNormalizePhone(clean.phone);
      } catch (e) {
        throw new BadRequestException(e.message);
      }
    }

    if (clean.email !== undefined && clean.email !== null && clean.email !== '') {
      if (typeof clean.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email.trim())) {
        throw new BadRequestException('Invalid email address');
      }
      clean.email = clean.email.trim();
    }

    for (const numeric of ['deliveryFee', 'rating', 'prepTime'] as const) {
      if (clean[numeric] !== undefined && clean[numeric] !== null) {
        const n = Number(clean[numeric]);
        if (!Number.isFinite(n) || n < 0) throw new BadRequestException(`Invalid ${numeric}`);
        (clean as any)[numeric] = n;
      }
    }
    if (clean.rating !== undefined && (clean.rating < 0 || clean.rating > 5)) throw new BadRequestException('Rating must be 0-5');

    return clean;
  }

  /**
   * ➕ CREATE NEW MERCHANT (Admin only)
   * Optional `password` sets the restaurant app login password.
   */
  async createMerchant(data: any) {
    const clean = this.sanitizeMerchantInput(data, true);
    const merchant = this.merchantRepository.create(clean);
    if (data?.password) {
      merchant.passwordHash = await bcrypt.hash(assertStrongPassword(data.password), BCRYPT_ROUNDS);
    }
    const saved = await this.merchantRepository.save(merchant);

    this.logger.log(`✅ Created merchant: ${saved.name} (ID: ${saved.id})`);
    const { passwordHash, locationToken, locationTokenExpiry, ...publicFields } = saved as any;
    return { ...publicFields, hasPassword: !!passwordHash };
  }

  /**
   * ✏️ UPDATE MERCHANT
   */
  async updateMerchant(id: number, data: any) {
    const merchant = await this.merchantRepository.findOne({ where: { id } });

    if (!merchant) {
      throw new NotFoundException(`Merchant with ID ${id} not found`);
    }

    const clean = this.sanitizeMerchantInput(data, false);
    // Coordinates edited by hand are no longer "confirmed on site".
    if (clean.latitude !== undefined && Number(clean.latitude) !== Number(merchant.latitude)) {
      merchant.locationConfirmed = false;
    }
    Object.assign(merchant, clean);
    const updated = await this.merchantRepository.save(merchant);

    this.logger.log(`✅ Updated merchant: ${updated.name} (ID: ${updated.id})`);
    const { passwordHash, locationToken, locationTokenExpiry, ...publicFields } = updated as any;
    return publicFields;
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

  // ------------------------------------------------------------------
  // 🔐 Restaurant app authentication
  // ------------------------------------------------------------------

  /** Admin sets / resets the restaurant app password. */
  async setMerchantPassword(id: number, password: string) {
    const merchant = await this.merchantRepository.findOne({ where: { id } });
    if (!merchant) throw new NotFoundException(`Merchant with ID ${id} not found`);
    merchant.passwordHash = await bcrypt.hash(assertStrongPassword(password), BCRYPT_ROUNDS);
    await this.merchantRepository.save(merchant);
    this.logger.log(`🔐 Restaurant app password set for ${merchant.name} (ID: ${id})`);
    return { success: true, message: `Password set for ${merchant.name}` };
  }

  /**
   * Restaurant app login with restaurant ID (or phone) + password.
   * Returns a merchant JWT scoped to this restaurant only.
   */
  async merchantLogin(identifier: string, password: string) {
    if (!identifier || typeof password !== 'string' || !password) {
      throw new UnauthorizedException('Invalid restaurant ID or password');
    }
    const ident = String(identifier).trim();

    const qb = this.merchantRepository.createQueryBuilder('m').addSelect('m.passwordHash');
    if (/^\d+$/.test(ident) && ident.length < 10) {
      qb.where('m.id = :id', { id: parseInt(ident, 10) });
    } else {
      let phone = ident;
      try {
        phone = validateAndNormalizePhone(ident);
      } catch {
        /* fall through with raw value */
      }
      qb.where('m.phone = :phone', { phone });
    }
    const merchant = await qb.getOne();

    const ok = await bcrypt.compare(password, merchant?.passwordHash || DUMMY_HASH);
    if (!merchant || !merchant.passwordHash || !ok) {
      throw new UnauthorizedException('Invalid restaurant ID or password');
    }
    if (!merchant.isActive) {
      throw new ForbiddenException('This restaurant account is deactivated. Contact Haraka support.');
    }

    return {
      success: true,
      token: this.tokenService.issue('merchant', merchant.id, { name: merchant.name }),
      data: await this.getMerchantById(merchant.id.toString()),
    };
  }

  /** Resolve a merchant by numeric id or exact name (legacy restaurant app passes the name). */
  async resolveMerchant(idOrName: string): Promise<Merchant> {
    const key = String(idOrName || '').trim();
    const merchant = /^\d+$/.test(key)
      ? await this.merchantRepository.findOne({ where: { id: parseInt(key, 10) } })
      : await this.merchantRepository.findOne({ where: { name: key } });
    if (!merchant) throw new NotFoundException('Restaurant not found');
    return merchant;
  }

  // ------------------------------------------------------------------
  // 🍔 Menu items
  // ------------------------------------------------------------------

  private sanitizeMenuItemInput(data: any, isCreate: boolean): Partial<MenuItem> {
    const clean = pick<MenuItem>(data, MENU_ITEM_FIELDS);
    if (isCreate) {
      if (typeof clean.name !== 'string' || !clean.name.trim()) throw new BadRequestException('Item name is required');
      if (typeof clean.category !== 'string' || !clean.category.trim()) throw new BadRequestException('Category is required');
    }
    if (typeof clean.name === 'string') clean.name = clean.name.trim();
    if (clean.price !== undefined || isCreate) {
      const price = Number(clean.price);
      if (!Number.isFinite(price) || price <= 0 || price > 10_000_000) throw new BadRequestException('Price must be a positive number');
      clean.price = price;
    }
    return clean;
  }

  /**
   * ➕ CREATE MENU ITEM
   */
  async createMenuItem(merchantId: number, data: any) {
    const merchant = await this.merchantRepository.findOne({ where: { id: merchantId } });
    if (!merchant) throw new NotFoundException(`Merchant with ID ${merchantId} not found`);

    const menuItem = this.menuItemRepository.create({ ...this.sanitizeMenuItemInput(data, true), merchantId });
    const saved = await this.menuItemRepository.save(menuItem);

    this.logger.log(`✅ Created menu item: ${saved.name} (ID: ${saved.id})`);
    return saved;
  }

  /**
   * ✏️ UPDATE MENU ITEM
   */
  async updateMenuItem(id: number, data: any) {
    const menuItem = await this.menuItemRepository.findOne({ where: { id } });

    if (!menuItem) {
      throw new NotFoundException(`Menu item with ID ${id} not found`);
    }

    Object.assign(menuItem, this.sanitizeMenuItemInput(data, false));
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

  // ------------------------------------------------------------------
  // 💰 Earnings & withdrawals
  // ------------------------------------------------------------------

  /** Restaurant's share of an order: the food subtotal (delivery + service fees go to Haraka/courier). */
  private foodShare(order: Order): number {
    const subtotal = Number((order.pricing as any)?.breakdown?.subtotal);
    if (Number.isFinite(subtotal) && subtotal > 0) return subtotal;
    const orderTotal = parseFloat(order.total?.toString() || '0');
    const deliveryFee = parseFloat(order.deliveryFee?.toString() || '0');
    return Math.max(orderTotal - deliveryFee, 0);
  }

  /**
   * 📊 Calculate restaurant earnings from completed paid orders
   */
  async calculateEarnings(merchant: Merchant) {
    const orders = await this.orderRepository.find({
      where: {
        restaurantName: merchant.name,
        orderType: 'food',
        status: 'delivered',
        paymentStatus: 'paid',
      },
    });

    const totalEarnings = orders.reduce((sum, o) => sum + this.foodShare(o), 0);

    const withdrawals = await this.withdrawalRepository.find({
      where: { merchantId: merchant.id, status: In(RESERVING_WITHDRAWAL_STATUSES) },
    });
    const withdrawn = withdrawals.reduce((sum, w) => sum + parseFloat(w.amount.toString()), 0);
    const pending = withdrawals
      .filter((w) => w.status !== 'paid')
      .reduce((sum, w) => sum + parseFloat(w.amount.toString()), 0);

    return {
      restaurantId: merchant.id,
      restaurantName: merchant.name,
      totalEarnings: Math.round(totalEarnings),
      totalOrders: orders.length,
      totalWithdrawn: Math.round(withdrawn - pending),
      pendingWithdrawals: Math.round(pending),
      availableForWithdrawal: Math.max(Math.round(totalEarnings - withdrawn), 0),
      currency: 'RWF',
    };
  }

  /**
   * 💸 Request a withdrawal. Creates a pending request that an admin pays out.
   * Runs in a transaction with a row lock so two concurrent requests can't
   * both spend the same balance.
   */
  async requestWithdrawal(merchant: Merchant, amount: number, phoneNumber: string) {
    const value = Math.round(Number(amount));
    if (!Number.isFinite(value) || value < 100) {
      throw new BadRequestException('Minimum withdrawal is 100 RWF');
    }
    let phone: string;
    try {
      phone = validateAndNormalizePhone(phoneNumber);
    } catch (e) {
      throw new BadRequestException(e.message);
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      // Serialise withdrawals per restaurant
      await manager.getRepository(Merchant).findOne({ where: { id: merchant.id }, lock: { mode: 'pessimistic_write' } });

      const earnings = await this.calculateEarningsWith(manager, merchant);
      if (value > earnings.available) {
        throw new BadRequestException(`Insufficient funds. Available: ${earnings.available} RWF`);
      }

      const w = manager.getRepository(Withdrawal).create({
        merchantId: merchant.id,
        restaurantName: merchant.name,
        amount: value,
        phoneNumber: phone,
        status: 'requested',
      });
      return manager.getRepository(Withdrawal).save(w);
    });

    this.logger.log(`💸 Withdrawal #${saved.id} requested by ${merchant.name}: ${value} RWF to ${phone}`);

    return {
      success: true,
      message: 'Withdrawal requested. Haraka will send the money to your Mobile Money account shortly.',
      withdrawalId: saved.id,
      amount: value,
      phoneNumber: phone,
      status: saved.status,
    };
  }

  /** Balance computation inside a transaction. */
  private async calculateEarningsWith(manager: any, merchant: Merchant) {
    const orders: Order[] = await manager.getRepository(Order).find({
      where: { restaurantName: merchant.name, orderType: 'food', status: 'delivered', paymentStatus: 'paid' },
    });
    const total = orders.reduce((sum, o) => sum + this.foodShare(o), 0);
    const withdrawals: Withdrawal[] = await manager.getRepository(Withdrawal).find({
      where: { merchantId: merchant.id, status: In(RESERVING_WITHDRAWAL_STATUSES) },
    });
    const reserved = withdrawals.reduce((sum, w) => sum + parseFloat(w.amount.toString()), 0);
    return { total: Math.round(total), available: Math.max(Math.round(total - reserved), 0) };
  }

  async listWithdrawals(merchantId?: number) {
    return this.withdrawalRepository.find({
      where: merchantId ? { merchantId } : {},
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  /**
   * Admin processes a withdrawal:
   *  - payout     -> send via PawaPay payouts API (status: processing)
   *  - mark_paid  -> paid manually outside Haraka (requires a reference)
   *  - reject     -> release the reserved balance
   *  - refresh    -> poll PawaPay for a processing payout
   */
  async processWithdrawal(id: number, action: string, staffId: number, opts: { reference?: string; note?: string } = {}) {
    const w = await this.withdrawalRepository.findOne({ where: { id } });
    if (!w) throw new NotFoundException('Withdrawal not found');

    const finish = async (status: Withdrawal['status'], extra: Partial<Withdrawal> = {}) => {
      Object.assign(w, extra, { status, processedBy: staffId, processedAt: new Date() });
      if (opts.note) w.note = opts.note;
      return this.withdrawalRepository.save(w);
    };

    switch (action) {
      case 'payout': {
        if (w.status !== 'requested') throw new BadRequestException(`Withdrawal is already ${w.status}`);
        const result = await this.paymentsService.initiatePayout({
          amount: parseFloat(w.amount.toString()),
          phoneNumber: w.phoneNumber,
          description: 'Haraka earnings',
        });
        if (!result.success) {
          await finish('failed', { payoutId: result.payoutId, note: result.error });
          return { success: false, error: result.error, withdrawal: w };
        }
        await finish(result.status === 'COMPLETED' ? 'paid' : 'processing', { payoutId: result.payoutId });
        return { success: true, withdrawal: w };
      }
      case 'mark_paid': {
        if (!['requested', 'processing', 'failed'].includes(w.status)) throw new BadRequestException(`Withdrawal is already ${w.status}`);
        if (!opts.reference) throw new BadRequestException('A payment reference is required');
        await finish('paid', { reference: String(opts.reference).slice(0, 120) });
        return { success: true, withdrawal: w };
      }
      case 'reject': {
        if (!['requested', 'failed'].includes(w.status)) throw new BadRequestException(`Cannot reject a ${w.status} withdrawal`);
        await finish('rejected');
        return { success: true, withdrawal: w };
      }
      case 'refresh': {
        if (w.status !== 'processing' || !w.payoutId) return { success: true, withdrawal: w };
        const st = await this.paymentsService.checkPayoutStatus(w.payoutId);
        if (st.status === 'COMPLETED') await finish('paid');
        else if (st.status === 'FAILED' || st.status === 'REJECTED') await finish('failed');
        return { success: true, payoutStatus: st.status, withdrawal: w };
      }
      default:
        throw new BadRequestException('Unknown action. Use payout, mark_paid, reject or refresh');
    }
  }

  /**
   * 📍 GENERATE LOCATION CONFIRMATION TOKEN
   * Creates a unique token and expiry time for location confirmation
   */
  async generateLocationToken(merchantId: number) {
    const merchant = await this.merchantRepository.findOne({ where: { id: merchantId } });

    if (!merchant) {
      throw new NotFoundException(`Merchant with ID ${merchantId} not found`);
    }

    // Generate random token (UUID-like)
    const token = randomUUID();

    // Set expiry to 24 hours from now
    const expiry = new Date();
    expiry.setHours(expiry.getHours() + 24);

    // Update merchant with token
    merchant.locationToken = token;
    merchant.locationTokenExpiry = expiry;
    await this.merchantRepository.save(merchant);

    this.logger.log(`📍 Generated location token for ${merchant.name} (ID: ${merchantId})`);

    return {
      token,
      expiry,
      merchantId,
      merchantName: merchant.name,
      merchantPhone: merchant.phone,
      merchantEmail: merchant.email,
    };
  }

  /**
   * ✅ CONFIRM LOCATION FROM TOKEN
   * Updates merchant's GPS coordinates when they confirm via link
   */
  async confirmLocation(token: string, latitude: number, longitude: number) {
    // SECURITY: an empty/undefined token must never match (TypeORM ignores undefined in where).
    if (typeof token !== 'string' || !/^[0-9a-f-]{36}$/i.test(token)) {
      return { success: false, error: 'Invalid or expired confirmation link' };
    }
    try {
      const v = validateGPSCoordinates(latitude, longitude, true); // must be inside Rwanda
      latitude = v.lat;
      longitude = v.lng;
    } catch (e) {
      return { success: false, error: e.message };
    }

    const merchant = await this.merchantRepository.findOne({
      where: { locationToken: token },
    });

    if (!merchant) {
      return {
        success: false,
        error: 'Invalid or expired confirmation link',
      };
    }

    // Check if token has expired
    const now = new Date();
    if (merchant.locationTokenExpiry && now > merchant.locationTokenExpiry) {
      return {
        success: false,
        error: 'Confirmation link has expired. Please request a new one.',
      };
    }

    // Update location
    merchant.latitude = latitude;
    merchant.longitude = longitude;
    merchant.locationConfirmed = true;
    merchant.locationToken = null; // Clear token after use
    merchant.locationTokenExpiry = null;

    await this.merchantRepository.save(merchant);

    this.logger.log(`✅ Location confirmed for ${merchant.name}: ${latitude}, ${longitude}`);

    return {
      success: true,
      message: 'Location confirmed successfully!',
      merchant: {
        id: merchant.id,
        name: merchant.name,
        latitude: merchant.latitude,
        longitude: merchant.longitude,
      },
    };
  }

  /**
   * 📍 GET LOCATION TOKEN STATUS
   * Check if a merchant has a pending location confirmation
   */
  async getLocationTokenStatus(merchantId: number) {
    const merchant = await this.merchantRepository.findOne({
      where: { id: merchantId },
      select: ['id', 'name', 'locationToken', 'locationTokenExpiry', 'locationConfirmed', 'latitude', 'longitude'],
    });

    if (!merchant) {
      throw new NotFoundException(`Merchant with ID ${merchantId} not found`);
    }

    const hasToken = !!merchant.locationToken;
    const isExpired = merchant.locationTokenExpiry && new Date() > merchant.locationTokenExpiry;

    return {
      hasToken,
      isExpired,
      locationConfirmed: merchant.locationConfirmed,
      hasCoordinates: !!merchant.latitude && !!merchant.longitude,
      tokenExpiry: merchant.locationTokenExpiry,
    };
  }
}
