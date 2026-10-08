import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { OrdersModule } from '../orders/orders.module';
import { Order } from '../orders/entities/order.entity';
import { WebhookGuard } from './guards/webhook.guard';
import { IdempotencyService } from './services/idempotency.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order]),
    OrdersModule,
    NotificationsModule,
    AuthModule,
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    WebhookGuard,
    IdempotencyService,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
