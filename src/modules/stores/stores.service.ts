import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, In, Repository } from 'typeorm';
import { nanoid } from 'nanoid';
import slugify from 'slugify';
import { PaginatedResult, paginate } from '../../common/utils/paginate.util';
import {
  LICENSED_STORE_TYPES,
  Store,
  StoreApprovalStatus,
  StoreStatus,
  StoreType,
} from './entities/store.entity';
import { StoreWorkingHours } from './entities/store-working-hours.entity';
import { StoreDeliverySettings } from './entities/store-delivery-settings.entity';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { UpdateWorkingHoursDto } from './dto/update-working-hours.dto';
import { UpdateDeliverySettingsDto } from './dto/update-delivery-settings.dto';
import { storeDistanceKmSql } from './store-distance';

export interface StoreWithLiveStatus extends Store {
  isOpenNow: boolean;
}

export interface NearbyStoreResult extends StoreWithLiveStatus {
  distanceKm: number;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class StoresService {
  constructor(
    @InjectRepository(Store)
    private readonly storesRepository: Repository<Store>,
    @InjectRepository(StoreWorkingHours)
    private readonly workingHoursRepository: Repository<StoreWorkingHours>,
    @InjectRepository(StoreDeliverySettings)
    private readonly deliverySettingsRepository: Repository<StoreDeliverySettings>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // ---------------------------------------------------------------------
  // Seller-facing CRUD
  // ---------------------------------------------------------------------

  /**
   * Also seeds a `pickup_only` `StoreDeliverySettings` row so a seller who
   * never visits the delivery-settings tab still has a store that can
   * accept (pickup) orders, rather than one silently unable to accept any
   * order at all — `OrdersService.create` rejects both fulfillment types
   * when `deliverySettings` is entirely absent.
   */
  async create(sellerId: string, dto: CreateStoreDto): Promise<Store> {
    this.assertLicence(dto.storeType ?? StoreType.RETAIL, dto.licenseInfo);
    const slug = await this.generateUniqueSlug(dto.name);

    const store = this.storesRepository.create({
      ...dto,
      sellerId,
      slug,
      status: StoreStatus.CLOSED,
      approvalStatus: StoreApprovalStatus.PENDING,
    });

    return this.dataSource.transaction(async (manager) => {
      const savedStore = await manager.save(Store, store);
      savedStore.deliverySettings = await manager.save(
        StoreDeliverySettings,
        manager.create(StoreDeliverySettings, { storeId: savedStore.id }),
      );
      return savedStore;
    });
  }

  /**
   * A seller's earliest-created store. Sellers can own more than one store;
   * this is the fallback used by callers that don't pass an explicit
   * `storeId` (older single-store callers, or a default before the caller
   * has picked one from `findAllMine`).
   */
  async findMine(sellerId: string): Promise<Store> {
    const store = await this.storesRepository.findOne({
      where: { sellerId },
      relations: ['workingHours', 'deliverySettings'],
      order: { createdAt: 'ASC' },
    });
    if (!store) {
      throw new NotFoundException('You do not have a store yet');
    }
    return store;
  }

  /** All stores owned by a seller, oldest first. */
  async findAllMine(sellerId: string): Promise<Store[]> {
    return this.storesRepository.find({
      where: { sellerId },
      relations: ['workingHours', 'deliverySettings'],
      order: { createdAt: 'ASC' },
    });
  }

  /** A specific store, ownership-checked against the given seller. */
  async findMineById(storeId: string, sellerId: string): Promise<Store> {
    const store = await this.findById(storeId);
    if (store.sellerId !== sellerId) {
      throw new ForbiddenException('You do not have access to this store');
    }
    return store;
  }

  async findById(id: string): Promise<Store> {
    const store = await this.storesRepository.findOne({
      where: { id },
      relations: ['workingHours', 'deliverySettings'],
    });
    if (!store) {
      throw new NotFoundException('Store not found');
    }
    return store;
  }

  /**
   * Public lookup by uuid id or slug. Only ever returns approved stores —
   * a seller's own (possibly unapproved) store is fetched via the
   * `me/store` endpoints instead.
   */
  async findApprovedByIdOrSlug(idOrSlug: string): Promise<StoreWithLiveStatus> {
    const where = UUID_REGEX.test(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug };
    const store = await this.storesRepository.findOne({
      where: { ...where, approvalStatus: StoreApprovalStatus.APPROVED },
      relations: ['workingHours', 'deliverySettings'],
    });
    if (!store) {
      throw new NotFoundException('Store not found');
    }
    return { ...store, isOpenNow: this.isStoreOpenNow(store) };
  }

  async update(id: string, sellerId: string, dto: UpdateStoreDto): Promise<Store> {
    const store = await this.findOwnedById(id, sellerId);
    if (dto.licenseInfo !== undefined) {
      this.assertLicence(store.storeType, dto.licenseInfo);
    }
    // Slug is intentionally left untouched on rename to avoid breaking
    // existing links; sellers needing a new slug should contact support.
    Object.assign(store, dto);
    return this.storesRepository.save(store);
  }

  /** Restaurants need an FSSAI licence and pharmacies a drug licence to trade. */
  private assertLicence(storeType: StoreType, licenseInfo?: string | null): void {
    if (LICENSED_STORE_TYPES.includes(storeType) && !licenseInfo?.trim()) {
      const licence = storeType === StoreType.PHARMACY ? 'drug licence' : 'FSSAI licence';
      throw new BadRequestException(`A ${licence} number is required for this store type`);
    }
  }

  private async findOwnedById(id: string, sellerId: string): Promise<Store> {
    const store = await this.storesRepository.findOne({ where: { id } });
    if (!store) {
      throw new NotFoundException('Store not found');
    }
    if (store.sellerId !== sellerId) {
      throw new ForbiddenException('You do not have access to this store');
    }
    return store;
  }

  // ---------------------------------------------------------------------
  // Working hours
  // ---------------------------------------------------------------------

  async getWorkingHours(storeId: string): Promise<StoreWorkingHours[]> {
    return this.workingHoursRepository.find({
      where: { storeId },
      order: { dayOfWeek: 'ASC' },
    });
  }

  async upsertWorkingHours(
    storeId: string,
    sellerId: string,
    dto: UpdateWorkingHoursDto,
  ): Promise<StoreWorkingHours[]> {
    await this.findOwnedById(storeId, sellerId);

    for (const entry of dto.hours) {
      const existing = await this.workingHoursRepository.findOne({
        where: { storeId, dayOfWeek: entry.dayOfWeek },
      });

      if (existing) {
        Object.assign(existing, entry);
        await this.workingHoursRepository.save(existing);
      } else {
        const created = this.workingHoursRepository.create({ ...entry, storeId });
        await this.workingHoursRepository.save(created);
      }
    }

    return this.getWorkingHours(storeId);
  }

  // ---------------------------------------------------------------------
  // Delivery settings
  // ---------------------------------------------------------------------

  async upsertDeliverySettings(
    storeId: string,
    sellerId: string,
    dto: UpdateDeliverySettingsDto,
  ): Promise<StoreDeliverySettings> {
    await this.findOwnedById(storeId, sellerId);

    let settings = await this.deliverySettingsRepository.findOne({ where: { storeId } });
    if (settings) {
      Object.assign(settings, dto);
    } else {
      settings = this.deliverySettingsRepository.create({ ...dto, storeId });
    }
    return this.deliverySettingsRepository.save(settings);
  }

  // ---------------------------------------------------------------------
  // Status toggle (manual seller override)
  // ---------------------------------------------------------------------

  async setStatus(storeId: string, sellerId: string, status: StoreStatus): Promise<Store> {
    const store = await this.findOwnedById(storeId, sellerId);
    store.status = status;
    return this.storesRepository.save(store);
  }

  /**
   * Live "is this store actually open right now" check.
   *
   * `status` is the manual override the seller controls: anything other
   * than `open` (closed / temporarily_closed / vacation) always means
   * closed, regardless of configured hours. Only when `status === open`
   * do we consult today's working-hours row.
   *
   * A seller who has never visited the working-hours tab has an empty
   * `workingHours` array (the editor upserts all seven days together, so a
   * non-empty array always has a row for every day) — treat that as "no
   * hours restriction configured yet" and trust `status` alone, rather than
   * defaulting to closed every day until the seller fills the form in. Once
   * they've configured a specific day (including marking it a holiday),
   * that day's row is honored as intentional.
   *
   * Pure given its inputs: relies solely on `store.status` and whichever
   * `StoreWorkingHours` rows are present on `store.workingHours` (callers
   * only need to have today's row loaded, not all seven).
   */
  isStoreOpenNow(store: Pick<Store, 'status' | 'workingHours'>): boolean {
    if (store.status !== StoreStatus.OPEN) {
      return false;
    }

    const workingHours = store.workingHours ?? [];
    if (workingHours.length === 0) {
      return true;
    }

    const now = new Date();
    const dayOfWeek = now.getDay();
    const todayHours = workingHours.find((wh) => wh.dayOfWeek === dayOfWeek);

    if (!todayHours || todayHours.isHoliday) {
      return false;
    }
    if (!todayHours.openTime || !todayHours.closeTime) {
      return false;
    }

    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes(),
    ).padStart(2, '0')}`;

    if (currentTime < todayHours.openTime || currentTime >= todayHours.closeTime) {
      return false;
    }

    if (todayHours.breakStart && todayHours.breakEnd) {
      if (currentTime >= todayHours.breakStart && currentTime < todayHours.breakEnd) {
        return false;
      }
    }

    return true;
  }

  // ---------------------------------------------------------------------
  // Discovery
  // ---------------------------------------------------------------------

  async findNearby(
    lat: number,
    lng: number,
    radiusKm: number,
    page: number,
    limit: number,
    storeType?: StoreType,
  ): Promise<PaginatedResult<NearbyStoreResult>> {
    const distanceExpr = storeDistanceKmSql();

    const baseQb = () => {
      const qb = this.storesRepository
        .createQueryBuilder('store')
        .where('store.approvalStatus = :approved', { approved: StoreApprovalStatus.APPROVED })
        .andWhere(`${distanceExpr} <= :radiusKm`, { lat, lng, radiusKm });
      if (storeType) {
        qb.andWhere('store.storeType = :storeType', { storeType });
      }
      return qb;
    };

    const total = await baseQb().getCount();

    const { entities, raw } = await baseQb()
      .addSelect(distanceExpr, 'distanceKm')
      .orderBy('"distanceKm"', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getRawAndEntities();

    const storeIds = entities.map((s) => s.id);
    const todayHoursByStoreId = await this.getTodayWorkingHoursByStoreIds(storeIds);

    const data: NearbyStoreResult[] = entities.map((store, index) => {
      const todayHours = todayHoursByStoreId.get(store.id);
      const isOpenNow = this.isStoreOpenNow({
        status: store.status,
        workingHours: todayHours ? [todayHours] : [],
      });
      return {
        ...store,
        isOpenNow,
        distanceKm: parseFloat(raw[index]?.distanceKm ?? '0'),
      };
    });

    return paginate(data, total, page, limit);
  }

  async search(
    q: string | undefined,
    page: number,
    limit: number,
    storeType?: StoreType,
  ): Promise<PaginatedResult<StoreWithLiveStatus>> {
    const term = (q ?? '').trim();

    const base = { approvalStatus: StoreApprovalStatus.APPROVED, ...(storeType ? { storeType } : {}) };
    const where = term
      ? [
          { ...base, name: ILike(`%${term}%`) },
          { ...base, city: ILike(`%${term}%`) },
        ]
      : base;

    const [stores, total] = await this.storesRepository.findAndCount({
      where,
      relations: ['workingHours'],
      order: { name: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const data = stores.map((store) => ({ ...store, isOpenNow: this.isStoreOpenNow(store) }));
    return paginate(data, total, page, limit);
  }

  private async getTodayWorkingHoursByStoreIds(
    storeIds: string[],
  ): Promise<Map<string, StoreWorkingHours>> {
    const map = new Map<string, StoreWorkingHours>();
    if (storeIds.length === 0) {
      return map;
    }
    const dayOfWeek = new Date().getDay();
    const rows = await this.workingHoursRepository.find({
      where: { storeId: In(storeIds), dayOfWeek },
    });
    for (const row of rows) {
      map.set(row.storeId, row);
    }
    return map;
  }

  // ---------------------------------------------------------------------
  // Admin-facing (called directly by the Admin module's service layer)
  // ---------------------------------------------------------------------

  async listPendingApprovals(page: number, limit: number): Promise<PaginatedResult<Store>> {
    const [stores, total] = await this.storesRepository.findAndCount({
      where: { approvalStatus: StoreApprovalStatus.PENDING },
      order: { createdAt: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return paginate(stores, total, page, limit);
  }

  async countByStoreType(storeType: StoreType): Promise<number> {
    return this.storesRepository.count({ where: { storeType } });
  }

  async approve(storeId: string): Promise<Store> {
    const store = await this.findById(storeId);
    store.approvalStatus = StoreApprovalStatus.APPROVED;
    store.isVerified = true;
    store.rejectionReason = null;
    return this.storesRepository.save(store);
  }

  async reject(storeId: string, reason: string): Promise<Store> {
    const store = await this.findById(storeId);
    store.approvalStatus = StoreApprovalStatus.REJECTED;
    store.isVerified = false;
    store.rejectionReason = reason;
    return this.storesRepository.save(store);
  }

  async suspend(storeId: string): Promise<Store> {
    const store = await this.findById(storeId);
    store.approvalStatus = StoreApprovalStatus.SUSPENDED;
    store.isVerified = false;
    return this.storesRepository.save(store);
  }

  async countByApprovalStatus(approvalStatus: StoreApprovalStatus): Promise<number> {
    return this.storesRepository.count({ where: { approvalStatus } });
  }

  async countAll(): Promise<number> {
    return this.storesRepository.count();
  }

  // ---------------------------------------------------------------------
  // Slug generation
  // ---------------------------------------------------------------------

  private async generateUniqueSlug(name: string): Promise<string> {
    const base = slugify(name, { lower: true, strict: true });
    let slug = base;
    let attempts = 0;

    // Extremely unlikely to loop more than once; the random suffix keeps
    // shrinking the collision space each retry.
    while (await this.storesRepository.findOne({ where: { slug } })) {
      attempts += 1;
      slug = `${base}-${nanoid(6)}`;
      if (attempts > 5) {
        break;
      }
    }

    return slug;
  }

  // ---------------------------------------------------------------------
  // Rating aggregates (set by the Reviews module after recomputing)
  // ---------------------------------------------------------------------

  /**
   * Setter the Reviews module calls after computing new rating aggregates
   * for a store — no rating computation logic lives here on purpose.
   */
  async updateRatingStats(storeId: string, avgRating: number, reviewCount: number): Promise<void> {
    await this.storesRepository.update({ id: storeId }, { avgRating, reviewCount });
  }
}
