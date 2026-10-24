import { Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: "List the current user's notifications, newest first" })
  @ApiResponse({ status: 200, description: 'Paginated list of notifications' })
  async findAll(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: PaginationQueryDto,
  ) {
    return this.notificationsService.findForUser(user.id, query.page ?? 1, query.limit ?? 20);
  }

  @Get('unread-count')
  @ApiOperation({ summary: "Get the count of the current user's unread notifications" })
  @ApiResponse({ status: 200, description: 'Unread notification count' })
  async unreadCount(@CurrentUser() user: CurrentUserPayload) {
    return this.notificationsService.unreadCount(user.id);
  }

  @Patch('read-all')
  @ApiOperation({ summary: "Mark all of the current user's notifications as read" })
  @ApiResponse({ status: 200, description: 'Number of notifications updated' })
  async markAllRead(@CurrentUser() user: CurrentUserPayload) {
    return this.notificationsService.markAllRead(user.id);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a single notification as read' })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  @ApiResponse({ status: 403, description: 'Not the owner of this notification' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async markRead(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notificationsService.markRead(user.id, id);
  }
}
