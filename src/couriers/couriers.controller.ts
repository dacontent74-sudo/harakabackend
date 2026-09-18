import { Controller, Get, Post, Put, Body, Param, Headers } from '@nestjs/common';
import { CouriersService } from './couriers.service';

@Controller('api/v1/couriers')
export class CouriersController {
  constructor(private readonly couriersService: CouriersService) {}

  @Post('register')
  async register(@Body() body: any) {
    return this.couriersService.register(body);
  }

  @Post('login')
  async login(@Body() body: any) {
    return this.couriersService.login(body.phoneNumber, body.password);
  }

  @Get('available-jobs')
  async getAvailableJobs() {
    return this.couriersService.getAvailableJobs();
  }

  @Post('accept-job/:orderId')
  async acceptJob(@Param('orderId') orderId: string, @Headers('authorization') auth: string) {
    const courierId = this.extractCourierId(auth);
    return this.couriersService.acceptJob(orderId, courierId);
  }

  @Put('update-status/:orderId')
  async updateJobStatus(
    @Param('orderId') orderId: string,
    @Body() body: any,
    @Headers('authorization') auth: string,
  ) {
    const courierId = this.extractCourierId(auth);
    return this.couriersService.updateJobStatus(
      orderId,
      body.status,
      courierId,
      body.latitude && body.longitude
        ? { latitude: body.latitude, longitude: body.longitude }
        : undefined,
    );
  }

  @Get('active-jobs')
  async getActiveJobs(@Headers('authorization') auth: string) {
    const courierId = this.extractCourierId(auth);
    return this.couriersService.getActiveJobs(courierId);
  }

  @Get('history')
  async getJobHistory(@Headers('authorization') auth: string) {
    const courierId = this.extractCourierId(auth);
    return this.couriersService.getJobHistory(courierId);
  }

  @Get('earnings')
  async getEarnings(@Headers('authorization') auth: string) {
    const courierId = this.extractCourierId(auth);
    return this.couriersService.getEarnings(courierId);
  }

  @Post('update-location')
  async updateLocation(@Body() body: any, @Headers('authorization') auth: string) {
    const courierId = this.extractCourierId(auth);
    return this.couriersService.updateLocation(courierId, body.latitude, body.longitude);
  }

  @Get('profile')
  async getCourierProfile(@Headers('authorization') auth: string) {
    const courierId = this.extractCourierId(auth);
    return this.couriersService.getCourierProfile(courierId);
  }

  @Put('profile')
  async updateCourierProfile(@Body() body: any, @Headers('authorization') auth: string) {
    const courierId = this.extractCourierId(auth);
    return this.couriersService.updateCourierProfile(courierId, body);
  }

  private extractCourierId(authHeader: string): number {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return 1; // Default for testing
    }

    const token = authHeader.substring(7);
    const parts = token.split('_');

    if (parts.length >= 2) {
      return parseInt(parts[1], 10);
    }

    return 1;
  }
}
