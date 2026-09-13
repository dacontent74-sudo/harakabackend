import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PricingModule } from './pricing/pricing.module';
import { MerchantsModule } from './merchants/merchants.module';
import { OrdersModule } from './orders/orders.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PricingModule,
    MerchantsModule,
    OrdersModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
