import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { StoreType } from '../entities/store.entity';

export class NearbyQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 12.9716 })
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @ApiPropertyOptional({ example: 77.5946 })
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;

  @ApiPropertyOptional({ default: 10, example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  radiusKm?: number = 10;

  @ApiPropertyOptional({ enum: StoreType, description: 'Only stores of this type' })
  @IsOptional()
  @IsEnum(StoreType)
  storeType?: StoreType;
}
