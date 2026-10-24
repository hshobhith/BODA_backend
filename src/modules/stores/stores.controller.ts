import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/role.enum';
import { StoresService } from './stores.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { UpdateWorkingHoursDto } from './dto/update-working-hours.dto';
import { UpdateDeliverySettingsDto } from './dto/update-delivery-settings.dto';
import { UpdateStoreStatusDto } from './dto/update-status.dto';
import { NearbyQueryDto } from './dto/nearby-query.dto';
import { SearchStoreDto } from './dto/search-store.dto';

@ApiTags('stores')
@Controller('stores')
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  // -----------------------------------------------------------------
  // Public discovery endpoints. NOTE: these must be declared before the
  // `:idOrSlug` catch-all route below, otherwise Nest would match
  // `/stores/nearby` and `/stores/search` as an idOrSlug lookup.
  // -----------------------------------------------------------------

  @Public()
  @Get('nearby')
  @ApiOperation({ summary: 'Find approved stores near a given lat/lng, ordered by distance' })
  @ApiResponse({ status: 200, description: 'Paginated list of nearby stores' })
  async nearby(@Query() query: NearbyQueryDto) {
    return this.storesService.findNearby(
      query.lat,
      query.lng,
      query.radiusKm ?? 10,
      query.page ?? 1,
      query.limit ?? 20,
      query.storeType,
    );
  }

  @Public()
  @Get('search')
  @ApiOperation({ summary: 'Search approved stores by name or city' })
  @ApiResponse({ status: 200, description: 'Paginated list of matching stores' })
  async search(@Query() query: SearchStoreDto) {
    return this.storesService.search(query.q, query.page ?? 1, query.limit ?? 20, query.storeType);
  }

  // -----------------------------------------------------------------
  // Seller-facing: current seller's own store
  // -----------------------------------------------------------------

  @Roles(Role.SELLER)
  @ApiBearerAuth()
  @Post()
  @ApiOperation({ summary: 'Register a new store for the current seller (sellers may own more than one)' })
  @ApiResponse({ status: 201, description: 'Store created (pending approval)' })
  async create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateStoreDto) {
    return this.storesService.create(user.id, dto);
  }

  @Roles(Role.SELLER)
  @ApiBearerAuth()
  @Get('me/stores')
  @ApiOperation({ summary: "List all of the current seller's stores" })
  @ApiResponse({ status: 200, description: "The seller's stores, oldest first" })
  async findAllMine(@CurrentUser() user: CurrentUserPayload) {
    return this.storesService.findAllMine(user.id);
  }

  /**
   * Every `me/store*` endpoint below accepts an optional `storeId` query
   * param so a seller with multiple stores can target a specific one.
   * Omitting it falls back to the seller's earliest-created store, which
   * keeps single-store callers (and any client not yet passing `storeId`)
   * working unchanged.
   */
  private resolveMineStore(user: CurrentUserPayload, storeId?: string) {
    return storeId
      ? this.storesService.findMineById(storeId, user.id)
      : this.storesService.findMine(user.id);
  }

  @Roles(Role.SELLER)
  @ApiBearerAuth()
  @Get('me/store')
  @ApiOperation({ summary: "Get one of the current seller's stores (defaults to the first)" })
  @ApiResponse({ status: 200, description: 'The seller store' })
  @ApiResponse({ status: 404, description: 'No store registered yet' })
  async findMine(@CurrentUser() user: CurrentUserPayload, @Query('storeId') storeId?: string) {
    return this.resolveMineStore(user, storeId);
  }

  @Roles(Role.SELLER)
  @ApiBearerAuth()
  @Patch('me/store')
  @ApiOperation({ summary: "Update one of the current seller's stores" })
  @ApiResponse({ status: 200, description: 'Store updated' })
  @ApiResponse({ status: 403, description: 'Not the store owner' })
  @ApiResponse({ status: 404, description: 'Store not found' })
  async updateMine(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateStoreDto,
    @Query('storeId') storeId?: string,
  ) {
    const store = await this.resolveMineStore(user, storeId);
    return this.storesService.update(store.id, user.id, dto);
  }

  @Roles(Role.SELLER)
  @ApiBearerAuth()
  @Get('me/store/working-hours')
  @ApiOperation({ summary: "Get one of the current seller's store working hours" })
  @ApiResponse({ status: 200, description: 'Working hours for all configured days' })
  async getMyWorkingHours(
    @CurrentUser() user: CurrentUserPayload,
    @Query('storeId') storeId?: string,
  ) {
    const store = await this.resolveMineStore(user, storeId);
    return this.storesService.getWorkingHours(store.id);
  }

  @Roles(Role.SELLER)
  @ApiBearerAuth()
  @Put('me/store/working-hours')
  @ApiOperation({ summary: "Replace one of the current seller's store working hours" })
  @ApiResponse({ status: 200, description: 'Working hours updated' })
  async updateMyWorkingHours(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateWorkingHoursDto,
    @Query('storeId') storeId?: string,
  ) {
    const store = await this.resolveMineStore(user, storeId);
    return this.storesService.upsertWorkingHours(store.id, user.id, dto);
  }

  @Roles(Role.SELLER)
  @ApiBearerAuth()
  @Put('me/store/delivery-settings')
  @ApiOperation({ summary: "Update one of the current seller's delivery settings" })
  @ApiResponse({ status: 200, description: 'Delivery settings updated' })
  async updateMyDeliverySettings(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateDeliverySettingsDto,
    @Query('storeId') storeId?: string,
  ) {
    const store = await this.resolveMineStore(user, storeId);
    return this.storesService.upsertDeliverySettings(store.id, user.id, dto);
  }

  @Roles(Role.SELLER)
  @ApiBearerAuth()
  @Patch('me/store/status')
  @ApiOperation({ summary: 'Manually toggle a store open/closed/vacation status' })
  @ApiResponse({ status: 200, description: 'Store status updated' })
  async updateMyStatus(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateStoreStatusDto,
    @Query('storeId') storeId?: string,
  ) {
    const store = await this.resolveMineStore(user, storeId);
    return this.storesService.setStatus(store.id, user.id, dto.status);
  }

  // -----------------------------------------------------------------
  // Public single-store lookup — must stay last so it doesn't shadow
  // the routes above.
  // -----------------------------------------------------------------

  @Public()
  @Get(':idOrSlug')
  @ApiOperation({ summary: 'Get an approved store by id or slug' })
  @ApiResponse({ status: 200, description: 'The store' })
  @ApiResponse({ status: 404, description: 'Store not found or not approved' })
  async findOne(@Param('idOrSlug') idOrSlug: string) {
    return this.storesService.findApprovedByIdOrSlug(idOrSlug);
  }
}
