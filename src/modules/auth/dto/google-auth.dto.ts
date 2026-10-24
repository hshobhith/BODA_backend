import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class GoogleAuthDto {
  @ApiProperty({
    description: 'The ID token ("credential") returned by Google Identity Services on the frontend',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  idToken: string;
}
