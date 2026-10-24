import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export enum ContactTopic {
  ORDER = 'order',
  RETURNS = 'returns',
  ACCOUNT = 'account',
  SELLING = 'selling',
  OTHER = 'other',
}

export class CreateContactMessageDto {
  @ApiProperty({ example: 'Priya Sharma' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'priya@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ enum: ContactTopic, example: ContactTopic.ORDER })
  @IsEnum(ContactTopic)
  topic: ContactTopic;

  @ApiPropertyOptional({ example: 'BODA-20260704-K3F9Q2' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  // Order numbers are `BODA-<date>-<suffix>`; restricting the charset also keeps
  // this safe to put in the email subject line.
  @Matches(/^[A-Za-z0-9-]+$/, { message: 'orderNumber may only contain letters, digits and dashes' })
  orderNumber?: string;

  @ApiProperty({ example: 'My order was marked delivered but I never received it.' })
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  message: string;
}
