import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PricingModule } from '../pricing/pricing.module';
import { Order } from './entities/order.entity';
import { StatusValidationService } from './services/status-validation.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order]),
    PricingModule,
    NotificationsModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, StatusValidationService],
  exports: [OrdersService],
})
export class OrdersModule {}
