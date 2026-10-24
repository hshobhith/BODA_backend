import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { StoresService } from '../stores/stores.service';
import { StoreApprovalStatus } from '../stores/entities/store.entity';
import { CategoriesService } from '../categories/categories.service';
import { UploadsService } from '../uploads/uploads.service';
import { Product, ProductStatus } from './entities/product.entity';

export type BarcodeLookupSource = 'boda' | 'openfoodfacts';

/** Catalogue details to pre-fill the seller's product form. Never price or stock — those are per store. */
export interface ProductSuggestion {
  name: string;
  brand: string | null;
  description: string | null;
  categoryId: string | null;
  weight: number | null;
  tags: string[];
  images: { url: string; sortOrder: number }[];
  composition: string | null;
  requiresPrescription: boolean;
}

export interface BarcodeLookupResult {
  barcode: string;
  /** Where the suggestion came from; null when neither BODA nor Open Food Facts knows the barcode. */
  source: BarcodeLookupSource | null;
  /** The seller's own store already lists this barcode (so the form can warn about a duplicate). */
  existingProduct: { id: string; name: string } | null;
  suggestion: ProductSuggestion | null;
  /** Required credit line when the data comes from Open Food Facts (ODbL; images CC BY-SA). */
  attribution: string | null;
}

interface OffProduct {
  product_name?: string;
  product_name_en?: string;
  generic_name?: string;
  generic_name_en?: string;
  brands?: string;
  quantity?: string;
  categories_tags?: string[];
  image_front_url?: string;
  image_url?: string;
}

const BARCODE_PATTERN = /^[0-9A-Za-z-]{4,32}$/;
/** EAN-8, UPC-A, EAN-13 and GTIN-14 — the codes Open Food Facts indexes. */
const GTIN_PATTERN = /^(\d{8}|\d{12,14})$/;
const OFF_FIELDS = [
  'product_name',
  'product_name_en',
  'generic_name',
  'generic_name_en',
  'brands',
  'quantity',
  'categories_tags',
  'image_front_url',
  'image_url',
].join(',');
const OFF_ATTRIBUTION =
  'Product details from Open Food Facts (openfoodfacts.org), ODbL; image CC BY-SA.';
const OFF_TIMEOUT_MS = 6000;
/** Their image servers can be slow; a missing photo is retried on the next lookup. */
const IMAGE_TIMEOUT_MS = 10000;
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const CACHE_MAX_ENTRIES = 500;
const CACHE_TTL_FOUND_MS = 12 * 60 * 60 * 1000;
const CACHE_TTL_MISSING_MS = 60 * 60 * 1000;

/** Open Food Facts category keywords -> our category slugs, most specific first. Food falls back to groceries. */
const CATEGORY_KEYWORDS: [string, string[]][] = [
  ['dairy-bakery', ['dair', 'milk', 'cheese', 'yogurt', 'yoghurt', 'butter', 'cream', 'bread', 'bakery', 'cake', 'pastr']],
  ['fruits-vegetables', ['fruit', 'vegetable', 'fresh-produce', 'legume']],
];
const FALLBACK_CATEGORY_SLUG = 'groceries';

/**
 * Turns a scanned barcode into pre-filled product details: first from
 * products already listed on BODA, then from Open Food Facts. Price and
 * stock are always left to the seller.
 */
@Injectable()
export class BarcodeLookupService {
  private readonly logger = new Logger(BarcodeLookupService.name);
  /**
   * In-memory cache of Open Food Facts results (by barcode), so repeat scans
   * don't refetch or re-upload. `imageSource` is kept while the photo copy
   * hasn't succeeded yet, so a later lookup can retry it.
   */
  private readonly offCache = new Map<
    string,
    { value: ProductSuggestion | null; imageSource?: string; expiresAt: number }
  >();

  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    private readonly storesService: StoresService,
    private readonly categoriesService: CategoriesService,
    private readonly uploadsService: UploadsService,
    private readonly configService: ConfigService,
  ) {}

  async lookup(rawBarcode: string, sellerId: string, storeId?: string): Promise<BarcodeLookupResult> {
    const barcode = rawBarcode.trim();
    if (!BARCODE_PATTERN.test(barcode)) {
      throw new BadRequestException('That doesn’t look like a barcode');
    }
    if (storeId) {
      await this.storesService.findMineById(storeId, sellerId);
    }
    const variants = barcodeVariants(barcode);

    const own = storeId
      ? await this.productsRepository.findOne({
          where: { storeId, barcode: In(variants) },
          relations: ['images', 'category'],
          order: { updatedAt: 'DESC' },
        })
      : null;

    // Only copy from products shoppers can already see: active, in an approved store.
    const listed = await this.productsRepository.findOne({
      where: {
        barcode: In(variants),
        status: ProductStatus.ACTIVE,
        store: { approvalStatus: StoreApprovalStatus.APPROVED },
        ...(storeId ? { storeId: Not(storeId) } : {}),
      },
      relations: ['images', 'category', 'store'],
      order: { updatedAt: 'DESC' },
    });

    const result: BarcodeLookupResult = {
      barcode,
      source: null,
      existingProduct: own ? { id: own.id, name: own.name } : null,
      suggestion: null,
      attribution: null,
    };

    const bodaMatch = listed ?? own;
    if (bodaMatch) {
      return { ...result, source: 'boda', suggestion: this.fromProduct(bodaMatch) };
    }

    if (GTIN_PATTERN.test(barcode)) {
      const suggestion = await this.fromOpenFoodFacts(barcode);
      if (suggestion) {
        return { ...result, source: 'openfoodfacts', suggestion, attribution: OFF_ATTRIBUTION };
      }
    }
    return result;
  }

  private fromProduct(product: Product): ProductSuggestion {
    return {
      name: product.name,
      brand: product.brand ?? null,
      description: product.description ?? null,
      categoryId: product.categoryId,
      weight: product.weight ?? null,
      tags: product.tags ?? [],
      images: [...(product.images ?? [])]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((image, index) => ({ url: image.url, sortOrder: index })),
      composition: product.composition ?? null,
      requiresPrescription: product.requiresPrescription,
    };
  }

  private async fromOpenFoodFacts(barcode: string): Promise<ProductSuggestion | null> {
    const cached = this.offCache.get(barcode);
    if (cached && cached.expiresAt > Date.now()) {
      if (cached.value && cached.imageSource) {
        const images = await this.rehostImage(cached.imageSource);
        if (images.length > 0) {
          cached.value = { ...cached.value, images };
          cached.imageSource = undefined;
        }
      }
      return cached.value;
    }

    const baseUrl = this.configService.get<string>('app.openFoodFactsBaseUrl')!.replace(/\/$/, '');
    let product: OffProduct | null = null;
    try {
      const response = await fetch(`${baseUrl}/api/v2/product/${barcode}.json?fields=${OFF_FIELDS}`, {
        headers: { 'User-Agent': this.userAgent(), Accept: 'application/json' },
        signal: AbortSignal.timeout(OFF_TIMEOUT_MS),
      });
      // 404 is their normal "product not found" answer.
      if (!response.ok && response.status !== 404) {
        throw new Error(`HTTP ${response.status}`);
      }
      const body = (await response.json()) as { status?: number; product?: OffProduct };
      product = body.status === 1 && body.product ? body.product : null;
    } catch (err) {
      // Outage or timeout: say "not found" this time, but don't cache it.
      this.logger.warn(`Open Food Facts lookup failed for ${barcode}: ${(err as Error).message}`);
      return null;
    }

    const suggestion = product ? await this.mapOffProduct(product) : null;
    const imageSource = product?.image_front_url || product?.image_url;
    this.cacheSet(barcode, suggestion, suggestion && suggestion.images.length === 0 ? imageSource : undefined);
    return suggestion;
  }

  private async mapOffProduct(product: OffProduct): Promise<ProductSuggestion | null> {
    const baseName = (product.product_name_en || product.product_name || '').trim();
    if (!baseName) {
      return null;
    }
    // Drop the EU "estimated quantity" sign (℮, often typed as a trailing "e").
    const quantity = (product.quantity ?? '').replace(/\s*(℮|\be)\s*$/i, '').trim();
    const squash = (value: string) => value.toLowerCase().replace(/\s+/g, '');
    const name = quantity && !squash(baseName).includes(squash(quantity)) ? `${baseName} ${quantity}` : baseName;
    const description = (product.generic_name_en || product.generic_name || '').trim();
    // Canonical taxonomy tags only ("en:sweet-spreads"); untranslated entries
    // also carry "en:" but keep their original text, e.g. "en:Pâtes à tartiner".
    const tags = (product.categories_tags ?? [])
      .filter((tag) => /^en:[a-z0-9-]+$/.test(tag))
      .map((tag) => tag.slice(3).replace(/-/g, ' '))
      .slice(-3);

    return {
      name,
      brand: product.brands?.split(',')[0]?.trim() || null,
      description: description && description !== baseName ? description : null,
      categoryId: await this.mapCategory(product.categories_tags ?? []),
      weight: parseWeightKg(quantity),
      tags,
      images: await this.rehostImage(product.image_front_url || product.image_url),
      composition: null,
      requiresPrescription: false,
    };
  }

  private async mapCategory(tags: string[]): Promise<string | null> {
    const joined = tags.join(' ').toLowerCase();
    const slugs = CATEGORY_KEYWORDS.filter(([, words]) => words.some((word) => joined.includes(word))).map(
      ([slug]) => slug,
    );
    for (const slug of [...slugs, FALLBACK_CATEGORY_SLUG]) {
      const category = await this.categoriesService.findBySlug(slug);
      if (category) {
        return category.id;
      }
    }
    return null;
  }

  /**
   * Copies the product photo into our own storage so listings don't depend on
   * Open Food Facts staying up. Only fetches from their image hosts (the URL
   * comes from their response, never from the client).
   */
  private async rehostImage(imageUrl?: string): Promise<{ url: string; sortOrder: number }[]> {
    if (!imageUrl) {
      return [];
    }
    try {
      const url = new URL(imageUrl);
      if (url.protocol !== 'https:' || !url.hostname.endsWith('.openfoodfacts.org')) {
        return [];
      }
      const response = await fetch(url, {
        headers: { 'User-Agent': this.userAgent() },
        signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
      });
      const type = (response.headers.get('content-type') ?? '').split(';')[0].trim();
      if (!response.ok || !IMAGE_TYPES.includes(type)) {
        return [];
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > IMAGE_MAX_BYTES) {
        return [];
      }
      const { url: storedUrl } = await this.uploadsService.uploadImageBuffer(buffer, type, 'products');
      return [{ url: storedUrl, sortOrder: 0 }];
    } catch (err) {
      this.logger.warn(`Could not copy Open Food Facts image ${imageUrl}: ${(err as Error).message}`);
      return [];
    }
  }

  private userAgent(): string {
    return this.configService.get<string>('app.openFoodFactsUserAgent')!;
  }

  private cacheSet(barcode: string, value: ProductSuggestion | null, imageSource?: string): void {
    if (this.offCache.size >= CACHE_MAX_ENTRIES) {
      // Map keeps insertion order, so the first key is the oldest entry.
      this.offCache.delete(this.offCache.keys().next().value!);
    }
    const ttl = value ? CACHE_TTL_FOUND_MS : CACHE_TTL_MISSING_MS;
    this.offCache.set(barcode, { value, imageSource, expiresAt: Date.now() + ttl });
  }
}

/**
 * The same product can be read as a 12-digit UPC-A or a 13-digit EAN-13 with
 * a leading zero, depending on the scanner — match either form.
 */
export function barcodeVariants(barcode: string): string[] {
  if (/^\d{12}$/.test(barcode)) {
    return [barcode, `0${barcode}`];
  }
  if (/^0\d{12}$/.test(barcode)) {
    return [barcode, barcode.slice(1)];
  }
  return [barcode];
}

/** "500 g" -> 0.5, "1.2kg" -> 1.2; volumes and unparseable quantities -> null. */
export function parseWeightKg(quantity: string): number | null {
  const match = /^([\d]+(?:[.,]\d+)?)\s*(kg|g|mg)\b/i.exec(quantity);
  if (!match) {
    return null;
  }
  const value = parseFloat(match[1].replace(',', '.'));
  const unit = match[2].toLowerCase();
  const kg = unit === 'kg' ? value : unit === 'g' ? value / 1000 : value / 1_000_000;
  return Math.round(kg * 1000) / 1000;
}
