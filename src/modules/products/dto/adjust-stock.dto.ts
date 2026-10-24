import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, NotEquals } from 'class-validator';

export class AdjustStockDto {
  @ApiPropertyOptional({ description: 'Adjust a specific variant instead of the base product' })
  @IsOptional()
  @IsUUID()
  variantId?: string;

  @ApiProperty({ example: -5, description: 'Signed quantity change; negative decrements stock' })
  @IsInt()
  @NotEquals(0)
  changeQty: number;

  @ApiProperty({ example: 'restock' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
