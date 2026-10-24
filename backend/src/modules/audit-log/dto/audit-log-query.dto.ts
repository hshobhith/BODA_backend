import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class AuditLogQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by exact action name, e.g. store.approve' })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({ description: 'Filter by entity type, e.g. store' })
  @IsOptional()
  @IsString()
  entityType?: string;

  @ApiPropertyOptional({ description: 'Filter by the actor (user) id' })
  @IsOptional()
  @IsUUID()
  actorId?: string;
}
