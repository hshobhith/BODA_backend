import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/role.enum';
import { ProductsService } from './products.service';
import { BarcodeLookupService } from './barcode-lookup.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { DuplicateProductDto } from './dto/duplicate-product.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { QueryProductsDto } from './dto/query-products.dto';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly barcodeLookupService: BarcodeLookupService,
  ) {}

  // -----------------------------------------------------------------
  // Public browse / search / detail
  // -----------------------------------------------------------------

  @Public()
  @Get()
  @ApiOperation({ summary: 'Browse/search active products from approved stores' })
  @ApiResponse({ status: 200, description: 'Paginated list of products' })
  async findPublic(@Query() query: QueryProductsDto) {
    return this.productsService.findPublic(query);
  }

  @Public()
  @Get('store/:storeId')
  @ApiOperation({ summary: "A store's public product listing" })
  @ApiResponse({ status: 200, description: 'Paginated list of products for the store' })
  async findByStore(@Param('storeId') storeId: string, @Query() query: QueryProductsDto) {
    return this.productsService.findByStore(storeId, query);
  }

  // -----------------------------------------------------------------
  // Seller-facing (must be declared before the public `:idOrSlug` route
  // below, otherwise Nest would match `/products/mine/...` as an idOrSlug
  // lookup).
  // -----------------------------------------------------------------

  @Roles(Role.SELLER)
  @ApiBearerAuth()
  @Get('barcode/:code')
  @ApiOperation({
    summary: 'Look up product details for a scanned barcode',
    description:
      'Checks products already on BODA first, then Open Food Facts. Returns details to pre-fill the add-product form (never price or stock), or `source: null` when neither knows the barcode. Pass `storeId` to also get `existingProduct` if that store already lists it.',
  })
  @ApiResponse({ status: 200, description: 'Lookup result (suggestion may be null)' })
  @ApiResponse({ status: 400, description: 'Not a valid barcode' })
  async lookupBarcode(
    @CurrentUser() user: CurrentUserPayload,
    @Param('code') code: string,
    @Query('storeId', new ParseUUIDPipe({ optional: true })) storeId?: string,
  ) {
    return this.barcodeLookupService.lookup(code, user.id, storeId);
  }

  @Roles(Role.SELLER)
  @ApiBearerAuth()
  @Post('store/:storeId')
  @ApiOperation({ summary: 'Create a new product for the current seller store' })
  @ApiResponse({ status: 201, description: 'Product created' })
  @ApiResponse({ status: 403, description: 'Not the store owner' })
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Param('storeId') storeId: string,
    @Body() dto: CreateProductDto,
  ) {
    return this.productsService.create(user.id, storeId, dto);
  }

  @Roles(Role.SELLER)
  @ApiBearerAuth()
  @Get('mine/store/:storeId')
  @ApiOperation({ summary: "Seller's own product listing (all statuses)" })
  @ApiResponse({ status: 200, description: 'Paginated list of products' })
  async findMine(
    @CurrentUser() user: CurrentUserPayload,
    @Param('storeId') storeId: string,
    @Query() query: QueryProductsDto,
  ) {
    return this.productsService.findMine(user.id, storeId, query);
  }

  @Roles(Role.SELLER)
  @ApiBearerAuth()
  @Get('mine/:id')
  @ApiOperation({ summary: "Seller's own product detail regardless of status" })
  @ApiResponse({ status: 200, description: 'The product' })
  @ApiResponse({ status: 403, description: 'Not the product owner' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async findMineById(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.productsService.findMineById(id, user.id);
  }

  @Roles(Role.SELLER)
  @ApiBearerAuth()
  @Patch(':id')
  @ApiOperation({ summary: 'Update a product (owner only)' })
  @ApiResponse({ status: 200, description: 'Product updated' })
  @ApiResponse({ status: 403, description: 'Not the product owner' })
  async update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(id, user.id, dto);
  }

  @Roles(Role.SELLER)
  @ApiBearerAuth()
  @Patch(':id/archive')
  @ApiOperation({ summary: 'Archive a product (owner only)' })
  @ApiResponse({ status: 200, description: 'Product archived' })
  async archive(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.productsService.archive(id, user.id);
  }

  @Roles(Role.SELLER)
  @ApiBearerAuth()
  @Post(':id/duplicate')
  @ApiOperation({ summary: 'Duplicate a product with a new slug (owner only)' })
  @ApiResponse({ status: 201, description: 'Duplicated product' })
  async duplicate(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: DuplicateProductDto,
  ) {
    return this.productsService.duplicate(id, user.id, dto);
  }

  @Roles(Role.SELLER)
  @ApiBearerAuth()
  @Patch(':id/adjust-stock')
  @ApiOperation({ summary: 'Manually adjust stock for a product or variant (owner only)' })
  @ApiResponse({ status: 200, description: 'Stock adjusted' })
  @ApiResponse({ status: 400, description: 'Resulting quantity would be negative' })
  async adjustStock(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: AdjustStockDto,
  ) {
    await this.productsService.manualAdjustStock(id, user.id, dto);
    return { success: true };
  }

  @Roles(Role.SELLER)
  @ApiBearerAuth()
  @Get('store/:storeId/low-stock')
  @ApiOperation({ summary: 'List products/variants at or below their low-stock threshold' })
  @ApiResponse({ status: 200, description: 'List of low-stock products' })
  async lowStock(@CurrentUser() user: CurrentUserPayload, @Param('storeId') storeId: string) {
    return this.productsService.findLowStock(storeId, user.id);
  }

  @Roles(Role.SELLER)
  @ApiBearerAuth()
  @Get(':id/inventory-history')
  @ApiOperation({ summary: 'Paginated inventory history for a product (owner only)' })
  @ApiResponse({ status: 200, description: 'Paginated inventory history' })
  async inventoryHistory(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.productsService.getInventoryHistory(id, user.id, Number(page) || 1, Number(limit) || 20);
  }

  // -----------------------------------------------------------------
  // Public single-product lookup — must stay last so it doesn't shadow
  // the routes above.
  // -----------------------------------------------------------------

  @Public()
  @Get(':idOrSlug')
  @ApiOperation({ summary: 'Get an active product by id or slug (approved stores only)' })
  @ApiResponse({ status: 200, description: 'The product' })
  @ApiResponse({ status: 404, description: 'Product not found, archived, or store not approved' })
  async findOne(@Param('idOrSlug') idOrSlug: string) {
    return this.productsService.findPublicByIdOrSlug(idOrSlug);
  }
}
