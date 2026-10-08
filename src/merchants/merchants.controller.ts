import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Logger,
  ParseIntPipe,
  HttpCode,
  ForbiddenException,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { MerchantsService } from './merchants.service';
import { EmailService } from '../notifications/email.service';
import { TwilioSmsService } from '../notifications/twilio-sms.service';
import { Auth, CurrentUser } from '../auth/decorators/roles.decorator';
import { AuthPrincipal, MERCHANT_ROLE, STAFF_ADMIN, STAFF_ALL, STAFF_WRITE } from '../auth/principal';
import { Merchant } from './entities/merchant.entity';

/** Public base URL used to build links that are sent to restaurants by SMS / email. */
export function publicLinkBase(): string {
  const base =
    process.env.FRONTEND_URL ||
    process.env.PUBLIC_BASE_URL ||
    (process.env.RENDER_EXTERNAL_URL ? process.env.RENDER_EXTERNAL_URL : '') ||
    (process.env.NODE_ENV === 'production' ? 'https://harakabackend.onrender.com' : `http://localhost:${process.env.PORT || 3000}`);
  return base.replace(/\/+$/, '');
}

/**
 * Restaurants (merchants), menus, earnings and withdrawals.
 *
 * Public:     GET /merchants, GET /merchants/:id, GET /merchants/:id/menu,
 *             POST /merchants/auth/login, POST /merchants/location/confirm
 * Restaurant: GET /merchants/me, earnings, withdraw, own withdrawals (merchant JWT)
 * Staff:      everything that creates/changes data (staff JWT + role)
 */
@Controller('merchants')
export class MerchantsController {
  private readonly logger = new Logger(MerchantsController.name);

  constructor(
    private readonly merchantsService: MerchantsService,
    private readonly emailService: EmailService,
    private readonly twilioSmsService: TwilioSmsService,
  ) {}

  /**
   * A merchant token may only act on its own restaurant; staff may act on any.
   * `idOrName` may be the numeric id or (legacy restaurant app) the restaurant name.
   */
  private async authorizeRestaurant(user: AuthPrincipal, idOrName: string): Promise<Merchant> {
    const merchant = await this.merchantsService.resolveMerchant(idOrName);
    if (user.type === 'merchant' && user.id !== merchant.id) {
      throw new ForbiddenException('You can only access your own restaurant');
    }
    return merchant;
  }

  // ------------------------------------------------------------ public

  @Get()
  async getAllMerchants() {
    const merchants = await this.merchantsService.getAllMerchants();
    return {
      success: true,
      data: merchants,
    };
  }

  /** Restaurant app login: { restaurantId | phone, password } -> merchant JWT. */
  @Post('auth/login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async merchantLogin(@Body() body: { restaurantId?: string | number; phone?: string; password: string }) {
    return this.merchantsService.merchantLogin(String(body?.restaurantId ?? body?.phone ?? ''), body?.password);
  }

  /**
   * ✅ Confirm location (PUBLIC - protected by the single-use 24h token in the link)
   */
  @Post('location/confirm')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async confirmLocation(@Body() body: { token: string; latitude: number; longitude: number }) {
    try {
      const token = typeof body?.token === 'string' ? body.token : '';
      this.logger.log(`📍 Location confirmation attempt with token: ${token.substring(0, 8)}...`);
      return await this.merchantsService.confirmLocation(token, body?.latitude, body?.longitude);
    } catch (error) {
      this.logger.error(`Error confirming location: ${error.message}`);
      return { success: false, error: 'Could not confirm location' };
    }
  }

  // ------------------------------------------------------------ restaurant (merchant JWT)

  @Get('me')
  @Auth(MERCHANT_ROLE)
  async getMe(@CurrentUser() user: AuthPrincipal) {
    return { success: true, data: await this.merchantsService.getMerchantById(user.id.toString()) };
  }

  @Get('me/withdrawals')
  @Auth(MERCHANT_ROLE)
  async myWithdrawals(@CurrentUser() user: AuthPrincipal) {
    return { success: true, data: await this.merchantsService.listWithdrawals(user.id) };
  }

  // ------------------------------------------------------------ staff: withdrawals

  @Get('withdrawals/all')
  @Auth(...STAFF_ALL)
  async allWithdrawals(@Query('merchantId') merchantId?: string) {
    return {
      success: true,
      data: await this.merchantsService.listWithdrawals(merchantId ? parseInt(merchantId, 10) : undefined),
    };
  }

  /** body: { action: 'payout' | 'mark_paid' | 'reject' | 'refresh', reference?, note? } */
  @Put('withdrawals/:withdrawalId')
  @Auth(...STAFF_ADMIN)
  async processWithdrawal(
    @Param('withdrawalId', ParseIntPipe) withdrawalId: number,
    @Body() body: { action: string; reference?: string; note?: string },
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.merchantsService.processWithdrawal(withdrawalId, body?.action, user.id, {
      reference: body?.reference,
      note: body?.note,
    });
  }

  // ------------------------------------------------------------ public by id

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
  async getMenu(@Param('id', ParseIntPipe) id: number) {
    const menu = await this.merchantsService.getMenuItems(id.toString());
    return {
      success: true,
      data: menu,
    };
  }

  // ------------------------------------------------------------ staff: restaurants & menus

  @Post()
  @Auth(...STAFF_WRITE)
  async createMerchant(@Body() data: any) {
    const merchant = await this.merchantsService.createMerchant(data);
    return { success: true, data: merchant };
  }

  @Put(':id')
  @Auth(...STAFF_WRITE)
  async updateMerchant(@Param('id', ParseIntPipe) id: number, @Body() data: any) {
    const merchant = await this.merchantsService.updateMerchant(id, data);
    return { success: true, data: merchant };
  }

  @Delete(':id')
  @Auth(...STAFF_ADMIN)
  async deleteMerchant(@Param('id', ParseIntPipe) id: number) {
    return this.merchantsService.deleteMerchant(id);
  }

  /** Set / reset the restaurant app password. body: { password } */
  @Put(':id/password')
  @Auth(...STAFF_ADMIN)
  async setPassword(@Param('id', ParseIntPipe) id: number, @Body() body: { password: string }) {
    return this.merchantsService.setMerchantPassword(id, body?.password);
  }

  @Post(':id/menu')
  @Auth(...STAFF_WRITE)
  async createMenuItem(@Param('id', ParseIntPipe) id: number, @Body() data: any) {
    const menuItem = await this.merchantsService.createMenuItem(id, data);
    return { success: true, data: menuItem };
  }

  @Put('menu/:itemId')
  @Auth(...STAFF_WRITE)
  async updateMenuItem(@Param('itemId', ParseIntPipe) itemId: number, @Body() data: any) {
    const menuItem = await this.merchantsService.updateMenuItem(itemId, data);
    return { success: true, data: menuItem };
  }

  @Delete('menu/:itemId')
  @Auth(...STAFF_WRITE)
  async deleteMenuItem(@Param('itemId', ParseIntPipe) itemId: number) {
    return this.merchantsService.deleteMenuItem(itemId);
  }

  // ------------------------------------------------------------ earnings (restaurant or staff)

  /**
   * Get restaurant earnings. `:id` = restaurant id or name.
   */
  @Get(':id/earnings')
  @Auth(MERCHANT_ROLE, ...STAFF_ALL)
  async getEarnings(@Param('id') id: string, @CurrentUser() user: AuthPrincipal) {
    const merchant = await this.authorizeRestaurant(user, id);
    return { success: true, data: await this.merchantsService.calculateEarnings(merchant) };
  }

  /**
   * Request a withdrawal of earnings to Mobile Money (restaurant only).
   * Creates a request that an admin pays out - money never moves without review.
   */
  @Post(':id/withdraw')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Auth(MERCHANT_ROLE)
  async withdrawEarnings(
    @Param('id') id: string,
    @Body() body: { amount: number; phoneNumber: string },
    @CurrentUser() user: AuthPrincipal,
  ) {
    const merchant = await this.authorizeRestaurant(user, id);
    this.logger.log(`💰 Withdrawal request for restaurant ${merchant.id}: ${body?.amount} RWF`);
    return this.merchantsService.requestWithdrawal(merchant, body?.amount, body?.phoneNumber);
  }

  // ------------------------------------------------------------ staff: location links

  /**
   * 📍 Generate a location confirmation link (and optionally SMS it via Twilio).
   * body: { sendSms?: boolean }
   */
  @Post(':id/location/send-link')
  @Auth(...STAFF_WRITE)
  async sendLocationLink(@Param('id', ParseIntPipe) id: number, @Body() body: { sendSms?: boolean } = {}) {
    this.logger.log(`📍 Generating location confirmation link for merchant ${id}`);

    const tokenData = await this.merchantsService.generateLocationToken(id);
    const confirmationLink = `${publicLinkBase()}/confirm-location?token=${tokenData.token}`;

    let emailSent = false;
    if (tokenData.merchantEmail) {
      try {
        const emailResult = await this.emailService.sendLocationConfirmationEmail({
          to: tokenData.merchantEmail,
          restaurantName: tokenData.merchantName,
          confirmationLink,
          expiryHours: 24,
        });
        emailSent = emailResult?.success === true;
        if (emailSent) this.logger.log(`✅ Location confirmation email sent to ${tokenData.merchantEmail}`);
      } catch (emailError) {
        this.logger.warn(`⚠️ Failed to send email: ${emailError.message}`);
      }
    }

    // 📱 Optionally SMS the link to the restaurant phone via Twilio.
    // Never SMS a localhost link (happens only in local development).
    let smsSent = false;
    let smsError: string | undefined;
    if (body?.sendSms) {
      if (!tokenData.merchantPhone) {
        smsError = 'Restaurant has no phone number on file';
      } else if (/localhost|127\.0\.0\.1/.test(confirmationLink)) {
        smsError = 'Link points to localhost - set FRONTEND_URL or PUBLIC_BASE_URL';
      } else {
        smsSent = await this.twilioSmsService
          .sendSms(
            tokenData.merchantPhone,
            `Haraka: Hello ${tokenData.merchantName}, please confirm your restaurant GPS location. Open this link while at the restaurant (valid 24h): ${confirmationLink}`,
          )
          .catch((err) => {
            this.logger.warn(`⚠️ Failed to send location SMS: ${err.message}`);
            return false;
          });
        if (!smsSent) smsError = 'SMS could not be sent (check Twilio configuration)';
      }
    }

    this.logger.log(`✅ Location link generated for merchant ${id} (email=${emailSent}, sms=${smsSent})`);

    const channels = [emailSent && 'email', smsSent && 'SMS'].filter(Boolean).join(' and ');
    return {
      success: true,
      message: channels
        ? `Location confirmation link sent by ${channels}`
        : 'Location confirmation link generated - share it with the restaurant manually',
      link: confirmationLink,
      token: tokenData.token,
      expiry: tokenData.expiry,
      merchantName: tokenData.merchantName,
      merchantPhone: tokenData.merchantPhone,
      emailSent,
      smsSent,
      smsError,
    };
  }

  /**
   * 📍 Location token status (staff)
   */
  @Get(':id/location/status')
  @Auth(...STAFF_ALL)
  async getLocationStatus(@Param('id', ParseIntPipe) id: number) {
    const status = await this.merchantsService.getLocationTokenStatus(id);
    return { success: true, data: status };
  }
}
