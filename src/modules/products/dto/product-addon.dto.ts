import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
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

export class ProductAddonOptionDto {
  @ApiPropertyOptional({ description: 'Send back an existing option id to keep it stable across edits' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ example: 'Extra cheese' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @ApiPropertyOptional({ example: 20, default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}

export class ProductAddonGroupDto {
  @ApiPropertyOptional({ description: 'Send back an existing group id to keep it stable across edits' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ example: 'Extras' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @ApiPropertyOptional({ example: 0, default: 0, description: 'Above 0 makes the group required' })
  @IsOptional()
  @IsInt()
  @Min(0)
  minSelect?: number;

  @ApiPropertyOptional({ example: 3, description: 'Defaults to the number of options' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxSelect?: number;

  @ApiProperty({ type: [ProductAddonOptionDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ProductAddonOptionDto)
  options: ProductAddonOptionDto[];
}
