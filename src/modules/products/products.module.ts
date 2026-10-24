import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoresModule } from '../stores/stores.module';
import { CategoriesModule } from '../categories/categories.module';
import { UploadsModule } from '../uploads/uploads.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { BarcodeLookupService } from './barcode-lookup.service';
import { Product } from './entities/product.entity';
import { ProductImage } from './entities/product-image.entity';
import { ProductVideo } from './entities/product-video.entity';
import { ProductVariant } from './entities/product-variant.entity';
import { InventoryHistory } from './entities/inventory-history.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, ProductImage, ProductVideo, ProductVariant, InventoryHistory]),
    StoresModule,
    CategoriesModule,
    UploadsModule,
  ],
  controllers: [ProductsController],
  providers: [ProductsService, BarcodeLookupService],
  exports: [ProductsService, TypeOrmModule],
})
export class ProductsModule {}
