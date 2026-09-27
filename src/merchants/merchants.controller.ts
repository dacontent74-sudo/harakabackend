import { Controller, Get, Post, Param, Body, Logger } from '@nestjs/common';
import { MerchantsService } from './merchants.service';

@Controller('merchants')
export class MerchantsController {
  private readonly logger = new Logger(MerchantsController.name);

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

  /**
   * Get restaurant earnings
   */
  @Get(':id/earnings')
  async getEarnings(@Param('id') id: string) {
    try {
      const earnings = await this.merchantsService.calculateEarnings(id);
      return {
        success: true,
        data: earnings,
      };
    } catch (error) {
      this.logger.error(`Error getting earnings: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Withdraw earnings to Mobile Money
   */
  @Post(':id/withdraw')
  async withdrawEarnings(
    @Param('id') id: string,
    @Body() body: { amount: number; phoneNumber: string },
  ) {
    try {
      this.logger.log(`💰 Withdrawal request for restaurant ${id}: ${body.amount} RWF to ${body.phoneNumber}`);

      const result = await this.merchantsService.withdrawEarnings(
        id,
        body.amount,
        body.phoneNumber,
      );

      return result;
    } catch (error) {
      this.logger.error(`Error processing withdrawal: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
