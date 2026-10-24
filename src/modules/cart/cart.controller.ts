import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { CartService } from './cart.service';
import { AddToCartDto } from './dto/add-to-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { ToggleSavedDto } from './dto/toggle-saved.dto';

@ApiTags('cart')
@ApiBearerAuth()
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @ApiOperation({ summary: "Get the current user's active cart items and subtotal" })
  @ApiResponse({ status: 200, description: 'Cart items, subtotal, and stock warnings' })
  async getCart(@CurrentUser() user: CurrentUserPayload) {
    return this.cartService.getCart(user.id);
  }

  @Get('saved-for-later')
  @ApiOperation({ summary: "List the current user's saved-for-later items" })
  @ApiResponse({ status: 200, description: 'List of saved-for-later items' })
  async getSavedForLater(@CurrentUser() user: CurrentUserPayload) {
    return this.cartService.getSavedForLater(user.id);
  }

  @Get('count')
  @ApiOperation({ summary: 'Total quantity of active cart items (for a header badge)' })
  @ApiResponse({ status: 200, description: 'Item count' })
  async countItems(@CurrentUser() user: CurrentUserPayload) {
    const count = await this.cartService.countItems(user.id);
    return { count };
  }

  @Post('items')
  @ApiOperation({ summary: 'Add a product (or variant) to the cart' })
  @ApiResponse({ status: 201, description: 'Item added or quantity merged into an existing line' })
  @ApiResponse({ status: 400, description: 'Product inactive, invalid variant, or insufficient stock' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async addItem(@CurrentUser() user: CurrentUserPayload, @Body() dto: AddToCartDto) {
    return this.cartService.addItem(user.id, dto);
  }

  @Patch('items/:id')
  @ApiOperation({ summary: 'Update the quantity of a cart item' })
  @ApiResponse({ status: 200, description: 'Cart item updated' })
  @ApiResponse({ status: 400, description: 'Insufficient stock' })
  @ApiResponse({ status: 403, description: 'Not the owner of this cart item' })
  @ApiResponse({ status: 404, description: 'Cart item not found' })
  async updateQuantity(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateQuantity(user.id, id, dto.quantity);
  }

  @Patch('items/:id/save')
  @ApiOperation({ summary: 'Move an item between the cart and saved-for-later' })
  @ApiResponse({ status: 200, description: 'Cart item moved' })
  @ApiResponse({ status: 403, description: 'Not the owner of this cart item' })
  @ApiResponse({ status: 404, description: 'Cart item not found' })
  async toggleSaved(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ToggleSavedDto,
  ) {
    return this.cartService.toggleSaved(user.id, id, dto.savedForLater);
  }

  @Delete('items/:id')
  @ApiOperation({ summary: 'Remove an item from the cart' })
  @ApiResponse({ status: 200, description: 'Item removed' })
  @ApiResponse({ status: 403, description: 'Not the owner of this cart item' })
  @ApiResponse({ status: 404, description: 'Cart item not found' })
  async removeItem(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    await this.cartService.removeItem(user.id, id);
    return { message: 'Cart item removed successfully' };
  }

  @Delete()
  @ApiOperation({ summary: "Clear all active items from the current user's cart" })
  @ApiResponse({ status: 200, description: 'Cart cleared' })
  async clearCart(@CurrentUser() user: CurrentUserPayload) {
    await this.cartService.clearCart(user.id);
    return { message: 'Cart cleared successfully' };
  }
}
