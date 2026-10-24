import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class ProductMediaDto {
  @ApiProperty({ example: 'https://cdn.example.com/uploads/products/abc123.jpg' })
  @IsString()
  @IsNotEmpty()
  url: string;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
