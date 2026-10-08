import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MerchantsController } from './merchants.controller';
import { MerchantsService } from './merchants.service';
import { Order } from '../orders/entities/order.entity';
import { Merchant } from './entities/merchant.entity';
import { MenuItem } from './entities/menu-item.entity';
import { Withdrawal } from './entities/withdrawal.entity';
import { PaymentsModule } from '../payments/payments.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, Merchant, MenuItem, Withdrawal]),
    PaymentsModule,
    NotificationsModule,
    AuthModule,
  ],
  controllers: [MerchantsController],
  providers: [MerchantsService],
  exports: [MerchantsService],
})
export class MerchantsModule {}
