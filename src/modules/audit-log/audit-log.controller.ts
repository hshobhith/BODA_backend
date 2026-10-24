import { ClassSerializerInterceptor, Controller, Get, Query, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { AuditLogService } from './audit-log.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

@ApiTags('admin/audit-logs')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@UseInterceptors(ClassSerializerInterceptor)
@Controller('admin/audit-logs')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @ApiOperation({ summary: 'List audit log entries (admin only)' })
  @ApiResponse({ status: 200, description: 'Paginated list of audit log entries' })
  async findAll(@Query() query: AuditLogQueryDto) {
    return this.auditLogService.findAll(query.page ?? 1, query.limit ?? 20, {
      action: query.action,
      entityType: query.entityType,
      actorId: query.actorId,
    });
  }
}
