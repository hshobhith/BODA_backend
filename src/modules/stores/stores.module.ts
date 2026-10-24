import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoresController } from './stores.controller';
import { StoresService } from './stores.service';
import { Store } from './entities/store.entity';
import { StoreWorkingHours } from './entities/store-working-hours.entity';
import { StoreDeliverySettings } from './entities/store-delivery-settings.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Store, StoreWorkingHours, StoreDeliverySettings])],
  controllers: [StoresController],
  providers: [StoresService],
  exports: [StoresService, TypeOrmModule],
})
export class StoresModule {}
