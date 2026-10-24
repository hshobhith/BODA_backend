import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { FulfillmentType } from '../../../common/enums/order-status.enum';

export class CreateOrderDto {
  @ApiProperty({ description: 'Store to checkout the current cart against' })
  @IsUUID()
  storeId: string;

  @ApiProperty({ enum: FulfillmentType })
  @IsEnum(FulfillmentType)
  fulfillmentType: FulfillmentType;

  @ApiPropertyOptional({
    description: 'Required when fulfillmentType is delivery; must belong to the requesting customer',
  })
  @IsOptional()
  @IsUUID()
  deliveryAddressId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  customerNote?: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Keys from POST /uploads/prescription. Required when the cart has prescription (Rx) medicines.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  prescriptionKeys?: string[];
}
