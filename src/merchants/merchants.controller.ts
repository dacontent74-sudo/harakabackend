import { Controller, Get, Param } from '@nestjs/common';
import { MerchantsService } from './merchants.service';

@Controller('merchants')
export class MerchantsController {
  constructor(private readonly merchantsService: MerchantsService) {}

  @Get()
  getAllMerchants() {
    return {
      success: true,
      data: this.merchantsService.getAllMerchants(),
    };
  }

  @Get(':id')
  getMerchant(@Param('id') id: string) {
    const merchant = this.merchantsService.getMerchantById(id);
    return {
      success: true,
      data: merchant,
    };
  }

  @Get(':id/menu')
  getMenu(@Param('id') id: string) {
    const menu = this.merchantsService.getMenuItems(id);
    return {
      success: true,
      data: menu,
    };
  }
}
