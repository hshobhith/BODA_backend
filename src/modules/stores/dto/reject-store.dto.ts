import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RejectStoreDto {
  @ApiProperty({ example: 'Uploaded license document is illegible.' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
