import { Injectable } from '@nestjs/common';

@Injectable()
export class PricingService {
  calculateDeliveryFee(distance: number, vehicleType: 'motorcycle' | 'car') {
    const config = vehicleType === 'car'
      ? { base: 1000, tier1: 300, tier2: 250, tier3: 200 }
      : { base: 500, tier1: 200, tier2: 150, tier3: 100 };

    let totalFee = config.base;
    let remaining = distance;

    // 0-3 km: base fee only
    if (remaining <= 3) {
      return { total: totalFee, breakdown: { base: config.base } };
    }
    remaining -= 3;

    // 3-5 km
    const tier1Distance = Math.min(remaining, 2);
    totalFee += tier1Distance * config.tier1;
    remaining -= tier1Distance;

    if (remaining <= 0) {
      return {
        total: totalFee,
        breakdown: {
          base: config.base,
          tier1: tier1Distance * config.tier1
        }
      };
    }

    // 5-10 km
    const tier2Distance = Math.min(remaining, 5);
    totalFee += tier2Distance * config.tier2;
    remaining -= tier2Distance;

    if (remaining <= 0) {
      return {
        total: totalFee,
        breakdown: {
          base: config.base,
          tier1: tier1Distance * config.tier1,
          tier2: tier2Distance * config.tier2
        }
      };
    }

    // 10+ km
    totalFee += remaining * config.tier3;

    return {
      total: totalFee,
      breakdown: {
        base: config.base,
        tier1: tier1Distance * config.tier1,
        tier2: tier2Distance * config.tier2,
        tier3: remaining * config.tier3
      }
    };
  }
}
