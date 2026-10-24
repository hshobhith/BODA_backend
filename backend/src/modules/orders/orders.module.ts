import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoresModule } from '../stores/stores.module';
import { ProductsModule } from '../products/products.module';
import { CartModule } from '../cart/cart.module';
import { AddressesModule } from '../addresses/addresses.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UploadsModule } from '../uploads/uploads.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { OrderStatusHistory } from './entities/order-status-history.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, OrderStatusHistory]),
    StoresModule,
    ProductsModule,
    CartModule,
    AddressesModule,
    NotificationsModule,
    UploadsModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
