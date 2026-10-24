import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class SearchGeocodeDto {
  @ApiProperty({ example: 'MG Road, Bengaluru' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(200)
  q: string;
}
