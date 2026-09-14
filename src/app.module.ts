import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PricingModule } from './pricing/pricing.module';
import { MerchantsModule } from './merchants/merchants.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { AppController } from './app.controller';
import { Order } from './orders/entities/order.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [Order],
      synchronize: true, // Auto-create tables (use migrations in production later)
      ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
    }),
    PricingModule,
    MerchantsModule,
    OrdersModule,
    PaymentsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
