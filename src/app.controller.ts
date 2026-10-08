import { Controller, Get, Param, Res, Post, HttpCode } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { join } from 'path';
import { seedMerchantsAndMenus } from './merchants/merchants.seed';
import { Auth } from './auth/decorators/roles.decorator';
import { UserRole } from './auth/entities/user.entity';

const PUBLIC_DIR = join(__dirname, '..', 'public');

@Controller()
export class AppController {
  constructor(
    @InjectDataSource()
    private dataSource: DataSource,
  ) {}

  /** Liveness/readiness probe (Render health check). Excluded from /api/v1. */
  @Get('health')
  @SkipThrottle()
  async health() {
    let database = 'ok';
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      database = 'error';
    }
    return {
      status: database === 'ok' ? 'ok' : 'degraded',
      database,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  /** Recipient picks the parcel delivery location (link sent by SMS). */
  @Get('select-location/:orderId')
  serveLocationSelectionPage(@Param('orderId') _orderId: string, @Res() res: Response) {
    res.sendFile(join(PUBLIC_DIR, 'select-location.html'));
  }

  @Get('location/:orderId')
  serveLocationPage(@Param('orderId') _orderId: string, @Res() res: Response) {
    res.sendFile(join(PUBLIC_DIR, 'location.html'));
  }

  /** Restaurant confirms its GPS location (link sent by SMS/email from the admin dashboard). */
  @Get('confirm-location')
  serveConfirmLocationPage(@Res() res: Response) {
    res.sendFile(join(PUBLIC_DIR, 'confirm-location.html'));
  }

  /**
   * Seed the sample Kigali restaurants (only if the merchants table is empty).
   * SUPER ADMIN ONLY.
   */
  @Post('seed')
  @HttpCode(200)
  @Auth(UserRole.SUPER_ADMIN)
  async seedDatabase() {
    // The demo data uses real Kigali restaurant names with placeholder phone
    // numbers and invented menus. Customers must never be able to order from
    // it in production, so it is blocked unless explicitly allowed.
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
      return {
        success: false,
        error: 'Demo seed is disabled in production. Add real restaurants from the admin dashboard (see ADDING_RESTAURANTS.md).',
      };
    }
    try {
      await seedMerchantsAndMenus(this.dataSource);
      return {
        success: true,
        message: 'Seed finished (skipped if restaurants already exist)',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
