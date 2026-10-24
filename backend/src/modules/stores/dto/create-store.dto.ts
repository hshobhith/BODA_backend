import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { StoreType, StoreVisibilityType } from '../entities/store.entity';

export class CreateStoreDto {
  @ApiProperty({ example: "Nina's Bakery" })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/logo.png' })
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/banner.png' })
  @IsOptional()
  @IsString()
  bannerUrl?: string;

  @ApiPropertyOptional({ example: 'Fresh baked goods daily.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    enum: StoreType,
    default: StoreType.RETAIL,
    description: 'Restaurant and pharmacy stores must also provide licenseInfo',
  })
  @IsOptional()
  @IsEnum(StoreType)
  storeType?: StoreType;

  @ApiProperty({ example: 'Bakery' })
  @IsString()
  @IsNotEmpty()
  businessType: string;

  @ApiPropertyOptional({ example: '29ABCDE1234F1Z5' })
  @IsOptional()
  @IsString()
  gstNumber?: string;

  @ApiPropertyOptional({
    example: 'FSSAI-12345678901234',
    description: 'FSSAI licence for restaurants, drug licence for pharmacies (required for both)',
  })
  @IsOptional()
  @IsString()
  licenseInfo?: string;

  @ApiProperty({ example: '+919876543210' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ example: 'store@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '221B Baker Street' })
  @IsString()
  @IsNotEmpty()
  addressLine: string;

  @ApiProperty({ example: 'Bengaluru' })
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiProperty({ example: 'Karnataka' })
  @IsString()
  @IsNotEmpty()
  state: string;

  @ApiProperty({ example: 'India' })
  @IsString()
  @IsNotEmpty()
  country: string;

  @ApiProperty({ example: '560001' })
  @IsString()
  @IsNotEmpty()
  pincode: string;

  @ApiProperty({ example: 12.9716 })
  @IsLatitude()
  lat: number;

  @ApiProperty({ example: 77.5946 })
  @IsLongitude()
  lng: number;

  @ApiProperty({ enum: StoreVisibilityType, example: StoreVisibilityType.RADIUS_10 })
  @IsEnum(StoreVisibilityType)
  visibilityType: StoreVisibilityType;
}
