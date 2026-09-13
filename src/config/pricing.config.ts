import { ConfigService } from '@nestjs/config';

export interface PricingTier {
  minDistance: number;
  maxDistance: number | null;
  ratePerKm: number;
}

export interface VehiclePricing {
  baseFee: number;
  tiers: PricingTier[];
}

export interface PricingConfig {
  motorcycle: VehiclePricing;
  car: VehiclePricing;
  merchantCommissionRate: number;
  courierEarningRate: number;
  platformFeeRate: number;
}

export class PricingConfigService {
  private readonly config: PricingConfig;

  constructor(private configService: ConfigService) {
    this.config = {
      motorcycle: {
        baseFee: this.configService.get<number>('MOTORCYCLE_BASE_FEE', 500),
        tiers: [
          {
            minDistance: 0,
            maxDistance: 3,
            ratePerKm: this.configService.get<number>('MOTORCYCLE_RATE_0_3KM', 0),
          },
          {
            minDistance: 3,
            maxDistance: 5,
            ratePerKm: this.configService.get<number>('MOTORCYCLE_RATE_3_5KM', 200),
          },
          {
            minDistance: 5,
            maxDistance: 10,
            ratePerKm: this.configService.get<number>('MOTORCYCLE_RATE_5_10KM', 150),
          },
          {
            minDistance: 10,
            maxDistance: null,
            ratePerKm: this.configService.get<number>('MOTORCYCLE_RATE_10_PLUS_KM', 100),
          },
        ],
      },
      car: {
        baseFee: this.configService.get<number>('CAR_BASE_FEE', 1000),
        tiers: [
          {
            minDistance: 0,
            maxDistance: 3,
            ratePerKm: this.configService.get<number>('CAR_RATE_0_3KM', 0),
          },
          {
            minDistance: 3,
            maxDistance: 5,
            ratePerKm: this.configService.get<number>('CAR_RATE_3_5KM', 300),
          },
          {
            minDistance: 5,
            maxDistance: 10,
            ratePerKm: this.configService.get<number>('CAR_RATE_5_10KM', 250),
          },
          {
            minDistance: 10,
            maxDistance: null,
            ratePerKm: this.configService.get<number>('CAR_RATE_10_PLUS_KM', 200),
          },
        ],
      },
      merchantCommissionRate: this.configService.get<number>('MERCHANT_COMMISSION_RATE', 0.15),
      courierEarningRate: this.configService.get<number>('COURIER_EARNING_RATE', 0.70),
      platformFeeRate: this.configService.get<number>('PLATFORM_FEE_RATE', 0.30),
    };
  }

  /**
   * Calculate delivery fee based on distance and vehicle type
   * @param distanceKm - Distance in kilometers
   * @param vehicleType - 'motorcycle' | 'car'
   * @returns Delivery fee in RWF
   *
   * Example: 7km motorcycle delivery
   * = 500 (base) + 0 (first 3km) + 400 (2km @ 200) + 300 (2km @ 150) = 1,200 RWF
   */
  calculateDeliveryFee(distanceKm: number, vehicleType: 'motorcycle' | 'car'): number {
    const vehiclePricing = this.config[vehicleType];
    let totalFee = vehiclePricing.baseFee;

    let remainingDistance = distanceKm;

    for (const tier of vehiclePricing.tiers) {
      if (remainingDistance <= 0) break;

      const tierDistance = tier.maxDistance
        ? Math.min(tier.maxDistance - tier.minDistance, remainingDistance)
        : remainingDistance;

      if (distanceKm > tier.minDistance) {
        const applicableDistance = Math.min(tierDistance, distanceKm - tier.minDistance);
        totalFee += applicableDistance * tier.ratePerKm;
        remainingDistance -= applicableDistance;
      }
    }

    return Math.round(totalFee);
  }

  /**
   * Calculate merchant commission
   * @param subtotal - Order subtotal in RWF
   * @returns Commission amount in RWF
   */
  calculateMerchantCommission(subtotal: number): number {
    return Math.round(subtotal * this.config.merchantCommissionRate);
  }

  /**
   * Calculate courier earnings from delivery fee
   * @param deliveryFee - Total delivery fee in RWF
   * @returns Courier earnings in RWF
   */
  calculateCourierEarnings(deliveryFee: number): number {
    return Math.round(deliveryFee * this.config.courierEarningRate);
  }

  /**
   * Calculate platform fee from delivery fee
   * @param deliveryFee - Total delivery fee in RWF
   * @returns Platform fee in RWF
   */
  calculatePlatformFee(deliveryFee: number): number {
    return Math.round(deliveryFee * this.config.platformFeeRate);
  }

  /**
   * Get complete pricing breakdown for an order
   */
  getPricingBreakdown(
    distanceKm: number,
    vehicleType: 'motorcycle' | 'car',
    orderSubtotal: number = 0,
  ): {
    deliveryFee: number;
    courierEarnings: number;
    platformFee: number;
    merchantCommission: number;
    orderSubtotal: number;
    orderTotal: number;
  } {
    const deliveryFee = this.calculateDeliveryFee(distanceKm, vehicleType);
    const courierEarnings = this.calculateCourierEarnings(deliveryFee);
    const platformFee = this.calculatePlatformFee(deliveryFee);
    const merchantCommission = this.calculateMerchantCommission(orderSubtotal);
    const orderTotal = orderSubtotal + deliveryFee;

    return {
      deliveryFee,
      courierEarnings,
      platformFee,
      merchantCommission,
      orderSubtotal,
      orderTotal,
    };
  }

  /**
   * Get pricing config for display
   */
  getPricingConfig(): PricingConfig {
    return this.config;
  }
}
