import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { StoreType } from '../entities/store.entity';

export class SearchStoreDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'bakery' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: StoreType, description: 'Only stores of this type' })
  @IsOptional()
  @IsEnum(StoreType)
  storeType?: StoreType;
}
