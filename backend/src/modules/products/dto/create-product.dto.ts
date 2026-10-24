import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { FoodType, ProductDeliveryType } from '../entities/product.entity';
import { ProductMediaDto } from './product-image.dto';
import { ProductVariantDto } from './product-variant.dto';
import { ProductAddonGroupDto } from './product-addon.dto';

export class CreateProductDto {
  @ApiProperty({ example: 'Organic Whole Wheat Bread' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Freshly baked daily using organic flour.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' })
  @IsUUID()
  categoryId: string;

  @ApiPropertyOptional({ example: 'BREAD-WW-001' })
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional({ example: '8901234567890' })
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiPropertyOptional({ example: "Nina's Bakery" })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiProperty({ example: 120.0 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ example: 99.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discountPrice?: number;

  @ApiPropertyOptional({ example: 50, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  stockQuantity?: number;

  @ApiPropertyOptional({ example: 5, default: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  lowStockThreshold?: number;

  @ApiPropertyOptional({
    default: true,
    description: 'False for made-to-order items: stock is then neither checked nor decremented',
  })
  @IsOptional()
  @IsBoolean()
  trackInventory?: boolean;

  @ApiPropertyOptional({ default: true, description: 'Seller\'s sold-out switch' })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @ApiPropertyOptional({ example: 0.4, description: 'Weight in kg' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  weight?: number;

  @ApiPropertyOptional({ enum: ProductDeliveryType, default: ProductDeliveryType.BOTH })
  @IsOptional()
  @IsEnum(ProductDeliveryType)
  deliveryType?: ProductDeliveryType;

  @ApiPropertyOptional({ example: 'Returnable within 7 days if unopened.' })
  @IsOptional()
  @IsString()
  returnPolicy?: string;

  @ApiPropertyOptional({ example: ['organic', 'bakery', 'fresh'], type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ enum: FoodType, nullable: true, description: 'Restaurant items' })
  @IsOptional()
  @IsEnum(FoodType)
  foodType?: FoodType | null;

  @ApiPropertyOptional({ example: 20, nullable: true, description: 'Restaurant items, in minutes' })
  @IsOptional()
  @IsInt()
  @Min(0)
  preparationTimeMins?: number | null;

  @ApiPropertyOptional({ type: [ProductAddonGroupDto], description: 'Restaurant add-ons/customizations' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ProductAddonGroupDto)
  addonGroups?: ProductAddonGroupDto[];

  @ApiPropertyOptional({ default: false, description: 'Pharmacy: prescription (Rx) medicine' })
  @IsOptional()
  @IsBoolean()
  requiresPrescription?: boolean;

  @ApiPropertyOptional({ example: 'Paracetamol 500mg', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  composition?: string | null;

  @ApiPropertyOptional({ example: '2027-06-30', nullable: true, description: 'Earliest expiry of stock on hand' })
  @IsOptional()
  @IsDateString({ strict: true })
  expiryDate?: string | null;

  @ApiPropertyOptional({ type: [ProductMediaDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductMediaDto)
  images?: ProductMediaDto[];

  @ApiPropertyOptional({ type: [ProductMediaDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductMediaDto)
  videos?: ProductMediaDto[];

  @ApiPropertyOptional({ type: [ProductVariantDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductVariantDto)
  variants?: ProductVariantDto[];
}
