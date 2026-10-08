import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CouriersController } from './couriers.controller';
import { CouriersService } from './couriers.service';
import { Courier } from './entities/courier.entity';
import { Order } from '../orders/entities/order.entity';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [TypeOrmModule.forFeature([Courier, Order]), AuthModule, NotificationsModule],
  controllers: [CouriersController],
  providers: [CouriersService],
  exports: [CouriersService],
})
export class CouriersModule {}
