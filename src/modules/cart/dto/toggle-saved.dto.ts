import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class ToggleSavedDto {
  @ApiProperty({ example: true, description: 'true = move to saved-for-later, false = move back to cart' })
  @IsBoolean()
  savedForLater: boolean;
}
