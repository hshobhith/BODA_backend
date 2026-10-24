import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude } from 'class-validator';

export class ReverseGeocodeDto {
  @ApiProperty({ example: 12.9716 })
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @ApiProperty({ example: 77.5946 })
  @Type(() => Number)
  @IsLongitude()
  lng: number;
}
