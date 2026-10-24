import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class DuplicateProductDto {
  @ApiPropertyOptional({ example: 'Organic Whole Wheat Bread (Copy)' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  newName?: string;
}
