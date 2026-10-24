import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { Role } from '../../../common/enums/role.enum';

export class QueryAdminUsersDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: Role, description: 'Filter users by role' })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
