import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { CreateStoreDto } from '../../stores/dto/create-store.dto';

/**
 * A store an admin sets up for a seller. Same fields as a seller's own
 * `POST /stores`, plus whose store it is: the seller's sign-in email.
 */
export class AdminCreateStoreDto extends CreateStoreDto {
  @ApiProperty({
    example: 'ravi@example.com',
    description:
      "The real seller's email. An existing seller gets the store straight away; otherwise a seller account is created and they're emailed a link to set a password.",
  })
  @IsEmail()
  sellerEmail: string;

  @ApiPropertyOptional({
    example: 'Ravi Kumar',
    description: "Seller's name, used only when a new account is created",
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sellerName?: string;

  @ApiPropertyOptional({
    example: '+919876543210',
    description: "Seller's phone, used only when a new account is created",
  })
  @IsOptional()
  @IsString()
  sellerPhone?: string;
}
