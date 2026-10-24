import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Role } from '../../../common/enums/role.enum';
import { GoogleAuthDto } from './google-auth.dto';

/**
 * Second step of a first-time Google sign-in: the same details RegisterDto
 * collects, minus email/password (email comes from the verified Google token,
 * and these accounts have no password).
 */
export class GoogleRegisterDto extends GoogleAuthDto {
  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
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
