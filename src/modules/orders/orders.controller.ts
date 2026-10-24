import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import { Role } from '../../common/enums/role.enum';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreatePosSaleDto } from './dto/create-pos-sale.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { ReviewPrescriptionDto } from './dto/review-prescription.dto';

// Orders embed the full `customer`/`store.seller` User relation in several
// responses — serialize through class-transformer so User's @Exclude'd
// fields (passwordHash, reset/verification token hashes) never leak here,
// matching the convention already used on Auth/Users controllers.
@ApiTags('orders')
@ApiBearerAuth()
@UseInterceptors(ClassSerializerInterceptor)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({
    summary: "Checkout the current user's cart items for a given store into a new order",
  })
  @ApiResponse({ status: 201, description: 'Order created' })
  @ApiResponse({
    status: 400,
    description: 'Cart empty for this store, insufficient stock, or invalid fulfillment/address',
  })
  async create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(user.id, dto);
  }

  @Get('mine')
  @ApiOperation({ summary: "List the current customer's own orders" })
  @ApiResponse({ status: 200, description: 'Paginated list of orders' })
  async findMine(@CurrentUser() user: CurrentUserPayload, @Query() query: QueryOrdersDto) {
    return this.ordersService.findMineAsCustomer(user.id, query);
  }

  @Roles(Role.SELLER)
  @Post('store/:storeId/pos')
  @ApiOperation({
    summary: 'Record an in-person (offline/POS) sale for one of the seller\'s stores',
    description:
      'Creates a real order already delivered/paid — decrements stock and produces a normal PDF invoice, same as an online order.',
  })
  @ApiResponse({ status: 201, description: 'Sale recorded' })
  @ApiResponse({ status: 400, description: 'Insufficient stock, or a product not in this store' })
  @ApiResponse({ status: 403, description: 'Not the store owner' })
  async createPosSale(
    @CurrentUser() user: CurrentUserPayload,
    @Param('storeId') storeId: string,
    @Body() dto: CreatePosSaleDto,
  ) {
    return this.ordersService.createPosSale(user.id, storeId, dto);
  }

  @Roles(Role.SELLER)
  @Get('seller/mine')
  @ApiOperation({
    summary:
      "List orders placed against the current seller's store(s) — all owned stores unless `storeId` narrows to one",
  })
  @ApiResponse({ status: 200, description: 'Paginated list of orders' })
  async findMineAsSeller(@CurrentUser() user: CurrentUserPayload, @Query() query: QueryOrdersDto) {
    return this.ordersService.findMineAsSeller(user.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an order by id (customer/seller/admin ownership-aware)' })
  @ApiResponse({ status: 200, description: 'Order detail' })
  @ApiResponse({ status: 404, description: 'Order not found or not accessible' })
  async findOne(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.findByIdForUser(id, user.id, user.role as Role);
  }

  @Get(':id/timeline')
  @ApiOperation({ summary: 'Get the chronological status history for an order' })
  @ApiResponse({ status: 200, description: 'Ordered list of status transitions' })
  @ApiResponse({ status: 404, description: 'Order not found or not accessible' })
  async getTimeline(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    const order = await this.ordersService.findByIdForUser(id, user.id, user.role as Role);
    return this.ordersService.getTimeline(order.id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Advance or cancel an order status' })
  @ApiResponse({ status: 200, description: 'Order updated' })
  @ApiResponse({ status: 400, description: 'Illegal status transition' })
  @ApiResponse({ status: 403, description: 'Not permitted to make this transition' })
  @ApiResponse({ status: 404, description: 'Order not found or not accessible' })
  async updateStatus(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(id, user.id, user.role as Role, dto);
  }

  @Roles(Role.SELLER, Role.ADMIN)
  @Patch(':id/prescription')
  @ApiOperation({
    summary: 'Approve or reject the prescription on a pharmacy order',
    description: 'Approving lets the order move forward; rejecting (with a note) cancels it.',
  })
  @ApiResponse({ status: 200, description: 'Order updated' })
  @ApiResponse({ status: 400, description: 'No prescription pending review, or a rejection without a note' })
  @ApiResponse({ status: 404, description: 'Order not found or not accessible' })
  async reviewPrescription(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewPrescriptionDto,
  ) {
    return this.ordersService.reviewPrescription(id, user.id, user.role as Role, dto);
  }

  @SkipTransform()
  @Get(':id/prescriptions/:index')
  @ApiOperation({ summary: 'Stream one of the prescription files attached to an order' })
  @ApiResponse({ status: 200, description: 'The image or PDF' })
  @ApiResponse({ status: 404, description: 'Order or file not found, or not accessible' })
  async getPrescription(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('index', ParseIntPipe) index: number,
    @Res() res: Response,
  ): Promise<void> {
    const order = await this.ordersService.findByIdForUser(id, user.id, user.role as Role);
    const file = await this.ordersService.readPrescription(order, index);

    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(file.body);
  }

  @SkipTransform()
  @Get(':id/invoice.pdf')
  @ApiOperation({ summary: 'Download the PDF invoice for an order' })
  @ApiResponse({ status: 200, description: 'PDF file stream' })
  @ApiResponse({ status: 404, description: 'Order not found or not accessible' })
  async getInvoice(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const order = await this.ordersService.findByIdForUser(id, user.id, user.role as Role);
    const buffer = await this.ordersService.generateInvoicePdf(order.id);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${order.orderNumber}.pdf"`);
    res.send(buffer);
  }
}
