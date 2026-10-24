import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateStoreDto } from './create-store.dto';

// storeType is fixed at creation: approval is granted against the licence
// for that type, so switching e.g. retail -> pharmacy needs a new store.
export class UpdateStoreDto extends PartialType(OmitType(CreateStoreDto, ['storeType'] as const)) {}
