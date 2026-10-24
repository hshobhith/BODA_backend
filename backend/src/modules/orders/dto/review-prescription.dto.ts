import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewPrescriptionDto {
  @ApiProperty({ description: 'true to accept the prescription, false to reject it (cancels the order)' })
  @IsBoolean()
  approve: boolean;

  @ApiPropertyOptional({ description: 'Required when rejecting — shown to the customer' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
