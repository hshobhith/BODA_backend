import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { StoreStatus } from '../entities/store.entity';

export class UpdateStoreStatusDto {
  @ApiProperty({ enum: StoreStatus, example: StoreStatus.OPEN })
  @IsEnum(StoreStatus)
  status: StoreStatus;
}
