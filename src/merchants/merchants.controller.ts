import { Controller, Get, Post, Put, Delete, Param, Body, Logger } from '@nestjs/common';
import { MerchantsService } from './merchants.service';
import { EmailService } from '../notifications/email.service';

@Controller('merchants')
export class MerchantsController {
  private readonly logger = new Logger(MerchantsController.name);

  constructor(
    private readonly merchantsService: MerchantsService,
    private readonly emailService: EmailService,
  ) {}

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

  /**
   * 📍 Generate location confirmation link
   * Admin endpoint to send location confirmation link to restaurant
   */
  @Post(':id/location/send-link')
  async sendLocationLink(@Param('id') id: string) {
    try {
      this.logger.log(`📍 Generating location confirmation link for merchant ${id}`);

      const tokenData = await this.merchantsService.generateLocationToken(parseInt(id));

      const confirmationLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/confirm-location?token=${tokenData.token}`;

      // Send email if restaurant has email
      if (tokenData.merchantEmail) {
        try {
          await this.emailService.sendLocationConfirmationEmail({
            to: tokenData.merchantEmail,
            restaurantName: tokenData.merchantName,
            confirmationLink,
            expiryHours: 24,
          });
          this.logger.log(`✅ Location confirmation email sent to ${tokenData.merchantEmail}`);
        } catch (emailError) {
          this.logger.warn(`⚠️ Failed to send email: ${emailError.message}`);
          // Continue even if email fails - admin can still share link manually
        }
      }

      this.logger.log(`✅ Location link generated: ${confirmationLink}`);

      return {
        success: true,
        message: tokenData.merchantEmail
          ? 'Location confirmation link sent to restaurant email'
          : 'Location confirmation link generated (no email on file - share manually)',
        link: confirmationLink,
        token: tokenData.token,
        expiry: tokenData.expiry,
        merchantName: tokenData.merchantName,
        merchantPhone: tokenData.merchantPhone,
        emailSent: !!tokenData.merchantEmail,
      };
    } catch (error) {
      this.logger.error(`Error generating location link: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * ✅ Confirm location (PUBLIC endpoint - no auth required)
   * Used by restaurant owners clicking the confirmation link
   */
  @Post('location/confirm')
  async confirmLocation(
    @Body() body: { token: string; latitude: number; longitude: number },
  ) {
    try {
      this.logger.log(`📍 Location confirmation attempt with token: ${body.token.substring(0, 8)}...`);

      const result = await this.merchantsService.confirmLocation(
        body.token,
        body.latitude,
        body.longitude,
      );

      return result;
    } catch (error) {
      this.logger.error(`Error confirming location: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 📍 Get location token status
   * Check if merchant has pending location confirmation
   */
  @Get(':id/location/status')
  async getLocationStatus(@Param('id') id: string) {
    try {
      const status = await this.merchantsService.getLocationTokenStatus(parseInt(id));
      return {
        success: true,
        data: status,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
