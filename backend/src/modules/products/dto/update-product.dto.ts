import { PartialType } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';

// Nested images/videos/variants arrays, when provided, fully replace the
// existing set for that relation (delete + recreate) — see
// ProductsService.update for the diff strategy.
export class UpdateProductDto extends PartialType(CreateProductDto) {}
