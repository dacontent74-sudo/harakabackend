import { Controller, Get, Post, Put, Body, Param, ParseIntPipe, HttpCode } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CouriersService } from './couriers.service';
import { Auth, CurrentUser } from '../auth/decorators/roles.decorator';
import { AuthPrincipal, COURIER_ROLE, STAFF_ALL, STAFF_WRITE } from '../auth/principal';

/**
 * Courier endpoints.
 * - register / login are public (rate limited).
 * - Every job endpoint requires a courier JWT; the courier id is taken from
 *   the verified token, never from the request.
 * - Admin endpoints (list / approve / deactivate) require a staff JWT.
 */
@Controller('couriers')
export class CouriersController {
  constructor(private readonly couriersService: CouriersService) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async register(@Body() body: any) {
    return this.couriersService.register(body);
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async login(@Body() body: any) {
    return this.couriersService.login(body?.phoneNumber, body?.password);
  }

  // ------------------------------------------------------------ courier

  @Get('available-jobs')
  @Auth(COURIER_ROLE)
  async getAvailableJobs() {
    return this.couriersService.getAvailableJobs();
  }

  @Post('accept-job/:orderId')
  @Auth(COURIER_ROLE)
  async acceptJob(@Param('orderId') orderId: string, @CurrentUser() courier: AuthPrincipal) {
    return this.couriersService.acceptJob(orderId, courier.id);
  }

  @Put('update-status/:orderId')
  @Auth(COURIER_ROLE)
  async updateJobStatus(@Param('orderId') orderId: string, @Body() body: any, @CurrentUser() courier: AuthPrincipal) {
    return this.couriersService.updateJobStatus(
      orderId,
      body?.status,
      courier.id,
      body?.latitude != null && body?.longitude != null
        ? { latitude: body.latitude, longitude: body.longitude }
        : undefined,
    );
  }

  @Get('active-jobs')
  @Auth(COURIER_ROLE)
  async getActiveJobs(@CurrentUser() courier: AuthPrincipal) {
    return this.couriersService.getActiveJobs(courier.id);
  }

  @Get('history')
  @Auth(COURIER_ROLE)
  async getJobHistory(@CurrentUser() courier: AuthPrincipal) {
    return this.couriersService.getJobHistory(courier.id);
  }

  @Get('earnings')
  @Auth(COURIER_ROLE)
  async getEarnings(@CurrentUser() courier: AuthPrincipal) {
    return this.couriersService.getEarnings(courier.id);
  }

  @Post('update-location')
  @HttpCode(200)
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @Auth(COURIER_ROLE)
  async updateLocation(@Body() body: any, @CurrentUser() courier: AuthPrincipal) {
    return this.couriersService.updateLocation(courier.id, Number(body?.latitude), Number(body?.longitude));
  }

  @Get('profile')
  @Auth(COURIER_ROLE)
  async getCourierProfile(@CurrentUser() courier: AuthPrincipal) {
    return this.couriersService.getCourierProfile(courier.id);
  }

  @Put('profile')
  @Auth(COURIER_ROLE)
  async updateCourierProfile(@Body() body: any, @CurrentUser() courier: AuthPrincipal) {
    return this.couriersService.updateCourierProfile(courier.id, body || {});
  }

  // ------------------------------------------------------------ admin

  @Get()
  @Auth(...STAFF_ALL)
  async listCouriers() {
    return { success: true, data: await this.couriersService.listCouriers() };
  }

  @Put(':id/approval')
  @Auth(...STAFF_WRITE)
  async setApproval(@Param('id', ParseIntPipe) id: number, @Body() body: { isApproved?: boolean; isActive?: boolean }) {
    return this.couriersService.setCourierFlags(id, {
      isApproved: typeof body?.isApproved === 'boolean' ? body.isApproved : undefined,
      isActive: typeof body?.isActive === 'boolean' ? body.isActive : undefined,
    });
  }
}
