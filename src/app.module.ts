import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PricingModule } from './pricing/pricing.module';
import { MerchantsModule } from './merchants/merchants.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { CouriersModule } from './couriers/couriers.module';
import { AuthModule } from './auth/auth.module';
import { AppController } from './app.controller';
import { Order } from './orders/entities/order.entity';
import { Courier } from './couriers/entities/courier.entity';
import { Merchant } from './merchants/entities/merchant.entity';
import { MenuItem } from './merchants/entities/menu-item.entity';
import { Withdrawal } from './merchants/entities/withdrawal.entity';
import { User } from './auth/entities/user.entity';
import { AuditLog } from './auth/entities/audit-log.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    // ✅ SECURITY: global rate limit per client IP (main.ts sets `trust proxy`
    // so the real client IP is used behind Render's proxy). Sensitive routes
    // (logins, order creation, payments) set stricter limits with @Throttle().
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: Number(process.env.RATE_LIMIT_PER_MINUTE || 120),
      },
    ]),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [Order, Courier, Merchant, MenuItem, Withdrawal, User, AuditLog],
      // Schema auto-sync keeps the DB in step with the entities (additive changes only
      // in this codebase). Set DB_SYNCHRONIZE=false once you switch to migrations.
      synchronize: process.env.DB_SYNCHRONIZE !== 'false',
      ssl: process.env.DATABASE_URL && process.env.DATABASE_SSL !== 'false' ? { rejectUnauthorized: false } : false,
    }),
    PricingModule,
    MerchantsModule,
    OrdersModule,
    PaymentsModule,
    CouriersModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
