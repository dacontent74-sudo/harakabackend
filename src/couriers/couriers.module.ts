import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CouriersController } from './couriers.controller';
import { CouriersService } from './couriers.service';
import { Courier } from './entities/courier.entity';
import { Order } from '../orders/entities/order.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Courier, Order])],
  controllers: [CouriersController],
  providers: [CouriersService],
  exports: [CouriersService],
})
export class CouriersModule {}
