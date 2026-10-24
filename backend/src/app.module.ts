import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import redisConfig from './config/redis.config';
import storageConfig from './config/storage.config';
import { validationSchema } from './config/validation.schema';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { DatabaseModule } from './database/database.module';
import { AddressesModule } from './modules/addresses/addresses.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { AuthModule } from './modules/auth/auth.module';
import { CartModule } from './modules/cart/cart.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { ContactModule } from './modules/contact/contact.module';
import { GeocodingModule } from './modules/geocoding/geocoding.module';
import { MailModule } from './modules/mail/mail.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ProductsModule } from './modules/products/products.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { StoresModule } from './modules/stores/stores.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { UsersModule } from './modules/users/users.module';
import { WishlistModule } from './modules/wishlist/wishlist.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema,
      load: [appConfig, databaseConfig, jwtConfig, redisConfig, storageConfig],
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            ttl: (configService.get<number>('app.throttleTtl') ?? 60) * 1000,
            limit: configService.get<number>('app.throttleLimit') ?? 100,
          },
        ],
      }),
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    AuthModule,
    UsersModule,
    AddressesModule,
    AuditLogModule,
    CategoriesModule,
    GeocodingModule,
    MailModule,
    ContactModule,
    StoresModule,
    NotificationsModule,
    ProductsModule,
    UploadsModule,
    CartModule,
    OrdersModule,
    ReviewsModule,
    WishlistModule,
    AdminModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
