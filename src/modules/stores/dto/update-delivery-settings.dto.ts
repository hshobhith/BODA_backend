import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { DeliveryMode, DeliverySpeed } from '../entities/store-delivery-settings.entity';

export class UpdateDeliverySettingsDto {
  @ApiPropertyOptional({ enum: DeliveryMode, default: DeliveryMode.PICKUP_ONLY })
  @IsOptional()
  @IsEnum(DeliveryMode)
  mode?: DeliveryMode;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  deliveryRadiusKm?: number;

  @ApiPropertyOptional({ example: 20, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  deliveryFee?: number;

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  freeDeliveryThreshold?: number;

  @ApiPropertyOptional({ enum: DeliverySpeed, default: DeliverySpeed.SAME_DAY })
  @IsOptional()
  @IsEnum(DeliverySpeed)
  deliverySpeed?: DeliverySpeed;

  @ApiPropertyOptional({ example: 'Delivered within 2 hours during business hours.' })
  @IsOptional()
  @IsString()
  customWindowNote?: string;
}
