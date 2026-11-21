import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { StoreApprovalStatus } from '../../stores/entities/store.entity';

export class QueryAdminStoresDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Matches store name, city or seller email' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: StoreApprovalStatus })
  @IsOptional()
  @IsEnum(StoreApprovalStatus)
  approvalStatus?: StoreApprovalStatus;
}
