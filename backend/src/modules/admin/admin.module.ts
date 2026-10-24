import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { StoresModule } from '../stores/stores.module';
import { ProductsModule } from '../products/products.module';
import { OrdersModule } from '../orders/orders.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [
    UsersModule,
    StoresModule,
    ProductsModule,
    OrdersModule,
    AuditLogModule,
    NotificationsModule,
    ReviewsModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
