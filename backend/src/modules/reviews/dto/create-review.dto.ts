import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ReviewTargetType } from '../entities/review.entity';

export class CreateReviewDto {
  @ApiProperty({ enum: ReviewTargetType, example: ReviewTargetType.PRODUCT })
  @IsEnum(ReviewTargetType)
  targetType: ReviewTargetType;

  @ApiProperty({ example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' })
  @IsUUID()
  targetId: string;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ example: 'Great product, fast delivery!' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @ApiPropertyOptional({ type: [String], example: ['https://cdn.example.com/review1.jpg'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  images?: string[];
}
