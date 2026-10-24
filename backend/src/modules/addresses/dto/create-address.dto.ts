import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateAddressDto {
  @ApiProperty({ example: 'Home' })
  @IsString()
  @IsNotEmpty()
  label: string;

  @ApiProperty({ example: '221B Baker Street' })
  @IsString()
  @IsNotEmpty()
  line1: string;

  @ApiPropertyOptional({ example: 'Near Central Park' })
  @IsOptional()
  @IsString()
  line2?: string;

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

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
