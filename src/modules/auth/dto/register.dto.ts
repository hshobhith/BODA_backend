import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { Role } from '../../../common/enums/role.enum';

export class RegisterDto {
  @ApiProperty({ example: 'jane@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'Password1',
    description: 'Minimum 8 characters, must include at least one letter and one number',
  })
  @IsString()
  @MinLength(8)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'Password must contain at least one letter and one number',
  })
  password: string;

  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @ApiPropertyOptional({ example: '+919876543210' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    enum: [Role.CUSTOMER, Role.SELLER],
    default: Role.CUSTOMER,
    description: 'Only customer or seller may self-register; admin is provisioned separately',
  })
  @IsOptional()
  @IsIn([Role.CUSTOMER, Role.SELLER], {
    message: 'role must be one of: customer, seller',
  })
  role?: Role.CUSTOMER | Role.SELLER;
}
