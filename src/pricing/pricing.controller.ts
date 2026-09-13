import { Controller, Get, Query } from '@nestjs/common';
import { PricingService } from './pricing.service';

@Controller('pricing')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Get('calculate')
  calculateFee(@Query('distance') distance: string, @Query('vehicle') vehicle: string) {
    const distanceKm = parseFloat(distance);
    const vehicleType = vehicle === 'car' ? 'car' : 'motorcycle';

    return {
      success: true,
      data: {
        distance: distanceKm,
        vehicle: vehicleType,
        pricing: this.pricingService.calculateDeliveryFee(distanceKm, vehicleType),
      },
    };
  }

  @Get('rates')
  getRates() {
    return {
      success: true,
      data: {
        motorcycle: {
          base: 500,
          tiers: [
            { min: 0, max: 3, rate: 0, description: 'Base fee only' },
            { min: 3, max: 5, rate: 200, description: 'RWF 200 per km' },
            { min: 5, max: 10, rate: 150, description: 'RWF 150 per km' },
            { min: 10, max: null, rate: 100, description: 'RWF 100 per km' },
          ],
        },
        car: {
          base: 1000,
          tiers: [
            { min: 0, max: 3, rate: 0, description: 'Base fee only' },
            { min: 3, max: 5, rate: 300, description: 'RWF 300 per km' },
            { min: 5, max: 10, rate: 250, description: 'RWF 250 per km' },
            { min: 10, max: null, rate: 200, description: 'RWF 200 per km' },
          ],
        },
      },
    };
  }
}
