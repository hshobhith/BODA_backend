import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ReplyReviewDto {
  @ApiProperty({ example: "Thanks so much for the kind words — hope to see you again soon!" })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reply: string;
}
