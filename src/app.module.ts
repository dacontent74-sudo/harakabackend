import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
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
import { User } from './auth/entities/user.entity';
import { AuditLog } from './auth/entities/audit-log.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [Order, Courier, Merchant, MenuItem, User, AuditLog],
      synchronize: true, // Auto-create tables (use migrations in production later)
      ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
    }),
    PricingModule,
    MerchantsModule,
    OrdersModule,
    PaymentsModule,
    CouriersModule,
    AuthModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
