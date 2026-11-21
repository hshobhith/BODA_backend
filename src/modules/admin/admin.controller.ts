import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Param,
  Patch,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { AuditLogInterceptor } from '../audit-log/audit-log.interceptor';
import { RejectStoreDto } from '../stores/dto/reject-store.dto';
import { QueryOrdersDto } from '../orders/dto/query-orders.dto';
import { QueryAdminUsersDto } from './dto/query-admin-users.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { QueryAdminStoresDto } from './dto/query-admin-stores.dto';
import { AdminCreateStoreDto } from './dto/admin-create-store.dto';
import { AdminService } from './admin.service';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.ADMIN)
// ClassSerializerInterceptor strips `@Exclude`-marked fields (passwordHash,
// token hashes, ...) off `User` entities returned as-is by this controller,
// matching what UsersController already does for `/users/me`.
@UseInterceptors(ClassSerializerInterceptor, AuditLogInterceptor)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // -----------------------------------------------------------------
  // Users
  // -----------------------------------------------------------------

  @Get('users')
  @ApiOperation({ summary: 'List all users, optionally filtered by role' })
  @ApiResponse({ status: 200, description: 'Paginated list of users' })
  async listUsers(@Query() query: QueryAdminUsersDto) {
    return this.adminService.listUsers(query);
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Get a single user by id' })
  @ApiResponse({ status: 200, description: 'The user' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUser(@Param('id') id: string) {
    return this.adminService.getUser(id);
  }

  @Patch('users/:id/suspend')
  @Audit('user.suspend', 'user')
  @ApiOperation({ summary: 'Suspend a user account' })
  @ApiResponse({ status: 200, description: 'User suspended' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async suspendUser(@Param('id') id: string) {
    return this.adminService.suspendUser(id);
  }

  @Patch('users/:id/unsuspend')
  @Audit('user.unsuspend', 'user')
  @ApiOperation({ summary: 'Reinstate a suspended user account' })
  @ApiResponse({ status: 200, description: 'User unsuspended' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async unsuspendUser(@Param('id') id: string) {
    return this.adminService.unsuspendUser(id);
  }

  @Patch('users/:id/role')
  @Audit('user.role-change', 'user')
  @ApiOperation({
    summary: 'Change a user\'s role',
    description: 'The only way to grant/revoke admin access. Blocked for the last remaining admin.',
  })
  @ApiResponse({ status: 200, description: 'Role changed' })
  @ApiResponse({ status: 400, description: 'Would leave the platform with no admin account' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async changeUserRole(@Param('id') id: string, @Body() dto: UpdateUserRoleDto) {
    return this.adminService.changeUserRole(id, dto.role);
  }

  @Delete('users/:id')
  @Audit('user.remove', 'user')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Permanently delete a user account',
    description:
      'MVP-simple hard delete. Blocked for self-deletion and for the last remaining admin account.',
  })
  @ApiResponse({ status: 204, description: 'User deleted' })
  @ApiResponse({ status: 400, description: 'Cannot delete your own account or the last remaining admin' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async removeUser(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    await this.adminService.removeUser(id, user);
  }

  // -----------------------------------------------------------------
  // Stores
  // -----------------------------------------------------------------

  @Get('stores/pending')
  @ApiOperation({ summary: 'List stores awaiting approval' })
  @ApiResponse({ status: 200, description: 'Paginated list of pending stores' })
  async listPendingStores(@Query() query: QueryOrdersDto) {
    return this.adminService.listPendingStores(query.page ?? 1, query.limit ?? 20);
  }

  @Get('stores')
  @ApiOperation({ summary: 'List every store (any approval status) with its seller' })
  @ApiResponse({ status: 200, description: 'Paginated list of stores, newest first' })
  async listAllStores(@Query() query: QueryAdminStoresDto) {
    return this.adminService.listAllStores(query);
  }

  @Post('stores')
  @Audit('store.admin-create', 'store')
  @ApiOperation({
    summary: 'Set up a store for a seller, by their email',
    description:
      'Creates an approved (but closed) store owned by the seller with `sellerEmail`. If no account uses that email, a seller account is created and emailed a link to set its password; a customer account is upgraded to seller. When the seller signs in, the store is theirs to manage like any other. Add hours, delivery settings and products through the seller endpoints, passing `storeId`.',
  })
  @ApiResponse({ status: 201, description: 'Store created' })
  @ApiResponse({ status: 400, description: 'Email belongs to an admin, suspended or deleted account' })
  async createStore(@Body() dto: AdminCreateStoreDto) {
    return this.adminService.createStoreForSeller(dto);
  }

  // Declared after `stores/pending` so that path isn't read as an id.
  @Get('stores/:id')
  @ApiOperation({ summary: 'Get one store (any approval status) with its seller' })
  @ApiResponse({ status: 200, description: 'The store' })
  @ApiResponse({ status: 404, description: 'Store not found' })
  async getStore(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getStore(id);
  }

  @Post('stores/:id/resend-invite')
  @Audit('store.resend-seller-invite', 'store')
  @ApiOperation({ summary: "Re-send the set-password email to a store's not-yet-signed-in seller" })
  @ApiResponse({ status: 201, description: 'Invite sent' })
  @ApiResponse({ status: 400, description: 'The seller has already signed in' })
  async resendSellerInvite(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.resendSellerInvite(id);
  }

  @Patch('stores/:id/approve')
  @Audit('store.approve', 'store')
  @ApiOperation({ summary: 'Approve a pending store' })
  @ApiResponse({ status: 200, description: 'Store approved' })
  @ApiResponse({ status: 404, description: 'Store not found' })
  async approveStore(@Param('id') id: string) {
    return this.adminService.approveStore(id);
  }

  @Patch('stores/:id/reject')
  @Audit('store.reject', 'store')
  @ApiOperation({ summary: 'Reject a pending store' })
  @ApiResponse({ status: 200, description: 'Store rejected' })
  @ApiResponse({ status: 404, description: 'Store not found' })
  async rejectStore(@Param('id') id: string, @Body() dto: RejectStoreDto) {
    return this.adminService.rejectStore(id, dto.reason);
  }

  @Patch('stores/:id/suspend')
  @Audit('store.suspend', 'store')
  @ApiOperation({ summary: 'Suspend a previously approved store' })
  @ApiResponse({ status: 200, description: 'Store suspended' })
  @ApiResponse({ status: 404, description: 'Store not found' })
  async suspendStore(@Param('id') id: string) {
    return this.adminService.suspendStore(id);
  }

  // -----------------------------------------------------------------
  // Products
  // -----------------------------------------------------------------

  @Patch('products/:id/archive')
  @Audit('product.archive', 'product')
  @ApiOperation({ summary: 'Moderation archive of a product (bypasses seller ownership)' })
  @ApiResponse({ status: 200, description: 'Product archived' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async archiveProduct(@Param('id') id: string) {
    await this.adminService.archiveProduct(id);
    return { archived: true };
  }

  // -----------------------------------------------------------------
  // Orders
  // -----------------------------------------------------------------

  @Get('orders')
  @ApiOperation({ summary: 'List all orders platform-wide, optionally filtered by status/store' })
  @ApiResponse({ status: 200, description: 'Paginated list of orders' })
  async listOrders(@Query() query: QueryOrdersDto) {
    return this.adminService.listOrders(query);
  }

  // -----------------------------------------------------------------
  // Analytics
  // -----------------------------------------------------------------

  @Get('analytics/overview')
  @ApiOperation({ summary: 'Platform-wide counts and revenue snapshot' })
  @ApiResponse({ status: 200, description: 'Analytics overview' })
  async getAnalyticsOverview() {
    return this.adminService.getAnalyticsOverview();
  }
}
