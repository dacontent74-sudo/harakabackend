import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PricingModule } from '../pricing/pricing.module';
import { Order } from './entities/order.entity';
import { Merchant } from '../merchants/entities/merchant.entity';
import { MenuItem } from '../merchants/entities/menu-item.entity';
import { StatusValidationService } from './services/status-validation.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, Merchant, MenuItem]),
    PricingModule,
    NotificationsModule,
    AuthModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, StatusValidationService],
  exports: [OrdersService],
})
export class OrdersModule {}
