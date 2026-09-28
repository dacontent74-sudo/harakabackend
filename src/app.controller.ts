import { Controller, Get, Param, Res, Post } from '@nestjs/common';
import { Response } from 'express';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { join } from 'path';
import { seedMerchantsAndMenus } from './merchants/merchants.seed';

@Controller()
export class AppController {
  constructor(
    @InjectDataSource()
    private dataSource: DataSource,
  ) {}

  @Get('select-location/:orderId')
  serveLocationSelectionPage(
    @Param('orderId') orderId: string,
    @Res() res: Response,
  ) {
    res.sendFile(join(__dirname, '..', 'public', 'select-location.html'));
  }

  @Post('seed')
  async seedDatabase() {
    try {
      await seedMerchantsAndMenus(this.dataSource);
      return {
        success: true,
        message: 'Database seeded successfully with real restaurant data',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
