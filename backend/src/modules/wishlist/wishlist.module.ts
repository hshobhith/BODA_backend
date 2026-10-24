import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsModule } from '../products/products.module';
import { StoresModule } from '../stores/stores.module';
import { WishlistController } from './wishlist.controller';
import { WishlistService } from './wishlist.service';
import { WishlistItem } from './entities/wishlist-item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([WishlistItem]), ProductsModule, StoresModule],
  controllers: [WishlistController],
  providers: [WishlistService],
  exports: [WishlistService],
})
export class WishlistModule {}
