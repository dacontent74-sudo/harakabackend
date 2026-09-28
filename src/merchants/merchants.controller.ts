import { Controller, Get, Post, Put, Delete, Param, Body, Logger } from '@nestjs/common';
import { MerchantsService } from './merchants.service';

@Controller('merchants')
export class MerchantsController {
  private readonly logger = new Logger(MerchantsController.name);

  constructor(private readonly merchantsService: MerchantsService) {}

  @Get()
  async getAllMerchants() {
    const merchants = await this.merchantsService.getAllMerchants();
    return {
      success: true,
      data: merchants,
    };
  }

  @Get(':id')
  async getMerchant(@Param('id') id: string) {
    try {
      const merchant = await this.merchantsService.getMerchantById(id);
      return {
        success: true,
        data: merchant,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Get(':id/menu')
  async getMenu(@Param('id') id: string) {
    const menu = await this.merchantsService.getMenuItems(id);
    return {
      success: true,
      data: menu,
    };
  }

  /**
   * 🔧 ADMIN ENDPOINTS FOR MANAGING MERCHANTS
   */
  @Post()
  async createMerchant(@Body() data: any) {
    try {
      const merchant = await this.merchantsService.createMerchant(data);
      return {
        success: true,
        data: merchant,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Put(':id')
  async updateMerchant(@Param('id') id: string, @Body() data: any) {
    try {
      const merchant = await this.merchantsService.updateMerchant(parseInt(id), data);
      return {
        success: true,
        data: merchant,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Delete(':id')
  async deleteMerchant(@Param('id') id: string) {
    try {
      const result = await this.merchantsService.deleteMerchant(parseInt(id));
      return result;
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 🔧 ADMIN ENDPOINTS FOR MANAGING MENU ITEMS
   */
  @Post(':id/menu')
  async createMenuItem(@Param('id') id: string, @Body() data: any) {
    try {
      const menuItem = await this.merchantsService.createMenuItem({
        ...data,
        merchantId: parseInt(id),
      });
      return {
        success: true,
        data: menuItem,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Put('menu/:itemId')
  async updateMenuItem(@Param('itemId') itemId: string, @Body() data: any) {
    try {
      const menuItem = await this.merchantsService.updateMenuItem(parseInt(itemId), data);
      return {
        success: true,
        data: menuItem,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Delete('menu/:itemId')
  async deleteMenuItem(@Param('itemId') itemId: string) {
    try {
      const result = await this.merchantsService.deleteMenuItem(parseInt(itemId));
      return result;
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
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
