/**
 * Standalone MVP demo data seed script.
 *
 * Connects directly via the TypeORM `dataSource` used for migrations (see
 * `src/database/data-source.ts`) — no Nest application context is spun up,
 * keeping this fast and dependency-light.
 *
 * Idempotent: every entity is looked up by its natural unique key (email /
 * slug) before insert, so re-running this script is always safe and never
 * creates duplicates.
 *
 * Usage: `npm run seed`
 */
import * as bcrypt from 'bcrypt';
import dataSource from '../data-source';
import { User, UserStatus } from '../../modules/auth/entities/user.entity';
import { Role } from '../../common/enums/role.enum';
import { Category } from '../../modules/categories/entities/category.entity';
import {
  Store,
  StoreApprovalStatus,
  StoreStatus,
  StoreVisibilityType,
} from '../../modules/stores/entities/store.entity';
import { StoreWorkingHours } from '../../modules/stores/entities/store-working-hours.entity';
import {
  DeliveryMode,
  DeliverySpeed,
  StoreDeliverySettings,
} from '../../modules/stores/entities/store-delivery-settings.entity';
import { Address } from '../../modules/addresses/entities/address.entity';
import {
  Product,
  ProductDeliveryType,
  ProductStatus,
} from '../../modules/products/entities/product.entity';
import { ProductImage } from '../../modules/products/entities/product-image.entity';
import { ProductVariant } from '../../modules/products/entities/product-variant.entity';

// Same salt round count as `BCRYPT_SALT_ROUNDS` in `src/modules/auth/auth.service.ts`.
const BCRYPT_SALT_ROUNDS = 10;

const SEED_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@boda.local';
const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';
// Shared password for all demo seller/customer accounts created by this script.
const SEED_DEMO_PASSWORD = 'Demo1234!';

const counts = {
  users: { created: 0, skipped: 0 },
  categories: { created: 0, skipped: 0 },
  stores: { created: 0, skipped: 0 },
  deliverySettings: { created: 0, skipped: 0 },
  workingHours: { created: 0, skipped: 0 },
  addresses: { created: 0, skipped: 0 },
  products: { created: 0, skipped: 0 },
  productImages: { created: 0, skipped: 0 },
  productVariants: { created: 0, skipped: 0 },
};

const picsum = (seed: string, w: number, h: number) =>
  `https://picsum.photos/seed/${seed}/${w}/${h}`;

async function getOrCreateUser(
  userRepo: import('typeorm').Repository<User>,
  data: {
    email: string;
    password: string;
    role: Role;
    fullName: string;
    phone?: string;
  },
): Promise<User> {
  const existing = await userRepo.findOne({ where: { email: data.email } });
  if (existing) {
    counts.users.skipped++;
    return existing;
  }
  const passwordHash = await bcrypt.hash(data.password, BCRYPT_SALT_ROUNDS);
  const user = userRepo.create({
    email: data.email,
    phone: data.phone,
    passwordHash,
    role: data.role,
    fullName: data.fullName,
    status: UserStatus.ACTIVE,
    emailVerifiedAt: new Date(),
  });
  const saved = await userRepo.save(user);
  counts.users.created++;
  return saved;
}

async function getOrCreateCategory(
  categoryRepo: import('typeorm').Repository<Category>,
  data: {
    name: string;
    slug: string;
    parentId?: string | null;
    sortOrder?: number;
  },
): Promise<Category> {
  const existing = await categoryRepo.findOne({ where: { slug: data.slug } });
  if (existing) {
    counts.categories.skipped++;
    return existing;
  }
  const category = categoryRepo.create({
    name: data.name,
    slug: data.slug,
    imageUrl: picsum(data.slug, 400, 300),
    parentId: data.parentId ?? null,
    sortOrder: data.sortOrder ?? 0,
    isActive: true,
  });
  const saved = await categoryRepo.save(category);
  counts.categories.created++;
  return saved;
}

/**
 * The product category taxonomy, seeded on its own (via `npm run
 * seed:categories`) or as part of the full demo dataset (`npm run seed`).
 * `Other` is a deliberate top-level catch-all for a seller whose product
 * doesn't fit any of the specific categories below.
 */
async function seedCategories(
  categoryRepo: import('typeorm').Repository<Category>,
): Promise<void> {
  const groceries = await getOrCreateCategory(categoryRepo, {
    name: 'Groceries',
    slug: 'groceries',
    sortOrder: 0,
  });
  await getOrCreateCategory(categoryRepo, {
    name: 'Fruits & Vegetables',
    slug: 'fruits-vegetables',
    parentId: groceries.id,
    sortOrder: 0,
  });
  await getOrCreateCategory(categoryRepo, {
    name: 'Dairy & Bakery',
    slug: 'dairy-bakery',
    parentId: groceries.id,
    sortOrder: 1,
  });

  const electronics = await getOrCreateCategory(categoryRepo, {
    name: 'Electronics',
    slug: 'electronics',
    sortOrder: 1,
  });
  await getOrCreateCategory(categoryRepo, {
    name: 'Mobiles',
    slug: 'mobiles',
    parentId: electronics.id,
    sortOrder: 0,
  });
  await getOrCreateCategory(categoryRepo, {
    name: 'Accessories',
    slug: 'accessories',
    parentId: electronics.id,
    sortOrder: 1,
  });

  await getOrCreateCategory(categoryRepo, { name: 'Fashion', slug: 'fashion', sortOrder: 2 });
  await getOrCreateCategory(categoryRepo, {
    name: 'Home & Kitchen',
    slug: 'home-kitchen',
    sortOrder: 3,
  });
  await getOrCreateCategory(categoryRepo, { name: 'Pharmacy', slug: 'pharmacy', sortOrder: 4 });
  await getOrCreateCategory(categoryRepo, {
    name: 'Restaurants & Food',
    slug: 'restaurants-food',
    sortOrder: 5,
  });
  await getOrCreateCategory(categoryRepo, {
    name: 'Beauty & Personal Care',
    slug: 'beauty-personal-care',
    sortOrder: 6,
  });
  await getOrCreateCategory(categoryRepo, {
    name: 'Books & Stationery',
    slug: 'books-stationery',
    sortOrder: 7,
  });
  // Catch-all — always last.
  await getOrCreateCategory(categoryRepo, { name: 'Other', slug: 'other', sortOrder: 8 });
}

interface StoreSeedSpec {
  slug: string;
  name: string;
  sellerEmail: string;
  sellerFullName: string;
  businessType: string;
  gstNumber: string;
  phone: string;
  city: string;
  state: string;
  pincode: string;
  addressLine: string;
  lat: number;
  lng: number;
  description: string;
  deliveryMode: DeliveryMode;
  deliveryFee: number;
  freeDeliveryThreshold: number | null;
  deliverySpeed: DeliverySpeed;
  deliveryRadiusKm: number;
  sundayHoliday?: boolean;
  categorySlug: string;
}

async function getOrCreateStore(
  storeRepo: import('typeorm').Repository<Store>,
  workingHoursRepo: import('typeorm').Repository<StoreWorkingHours>,
  deliverySettingsRepo: import('typeorm').Repository<StoreDeliverySettings>,
  seller: User,
  spec: StoreSeedSpec,
): Promise<Store> {
  const existing = await storeRepo.findOne({ where: { slug: spec.slug } });
  if (existing) {
    counts.stores.skipped++;
    return existing;
  }

  const store = storeRepo.create({
    sellerId: seller.id,
    name: spec.name,
    slug: spec.slug,
    logoUrl: picsum(`${spec.slug}-logo`, 200, 200),
    bannerUrl: picsum(`${spec.slug}-banner`, 1200, 400),
    description: spec.description,
    businessType: spec.businessType,
    gstNumber: spec.gstNumber,
    phone: spec.phone,
    email: spec.sellerEmail,
    addressLine: spec.addressLine,
    city: spec.city,
    state: spec.state,
    country: 'India',
    pincode: spec.pincode,
    lat: spec.lat,
    lng: spec.lng,
    visibilityType: StoreVisibilityType.RADIUS_10,
    status: StoreStatus.OPEN,
    approvalStatus: StoreApprovalStatus.APPROVED,
    isVerified: true,
  });
  const savedStore = await storeRepo.save(store);
  counts.stores.created++;

  // Working hours: Mon-Sat 09:00-21:00 with a 13:00-14:00 break; Sunday
  // is a holiday for stores flagged `sundayHoliday`, otherwise same hours.
  for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek++) {
    const existingWh = await workingHoursRepo.findOne({
      where: { storeId: savedStore.id, dayOfWeek },
    });
    if (existingWh) {
      counts.workingHours.skipped++;
      continue;
    }
    const isSunday = dayOfWeek === 0;
    const isHoliday = isSunday && !!spec.sundayHoliday;
    const wh = workingHoursRepo.create({
      storeId: savedStore.id,
      dayOfWeek,
      openTime: isHoliday ? null : '09:00',
      closeTime: isHoliday ? null : '21:00',
      breakStart: isHoliday ? null : '13:00',
      breakEnd: isHoliday ? null : '14:00',
      isHoliday,
    });
    await workingHoursRepo.save(wh);
    counts.workingHours.created++;
  }

  const existingDs = await deliverySettingsRepo.findOne({
    where: { storeId: savedStore.id },
  });
  if (existingDs) {
    counts.deliverySettings.skipped++;
  } else {
    const ds = deliverySettingsRepo.create({
      storeId: savedStore.id,
      mode: spec.deliveryMode,
      deliveryRadiusKm: spec.deliveryRadiusKm,
      deliveryFee: spec.deliveryFee,
      freeDeliveryThreshold: spec.freeDeliveryThreshold,
      deliverySpeed: spec.deliverySpeed,
    });
    await deliverySettingsRepo.save(ds);
    counts.deliverySettings.created++;
  }

  return savedStore;
}

interface ProductSeedSpec {
  slug: string;
  name: string;
  description: string;
  brand?: string;
  price: number;
  discountPrice?: number | null;
  stockQuantity: number;
  lowStockThreshold?: number;
  tags?: string[];
  variants?: { name: string; sku?: string; priceDelta: number; stockQuantity: number }[];
}

async function getOrCreateProduct(
  productRepo: import('typeorm').Repository<Product>,
  imageRepo: import('typeorm').Repository<ProductImage>,
  variantRepo: import('typeorm').Repository<ProductVariant>,
  store: Store,
  category: Category,
  spec: ProductSeedSpec,
): Promise<Product> {
  const existing = await productRepo.findOne({ where: { slug: spec.slug } });
  if (existing) {
    counts.products.skipped++;
    return existing;
  }

  const product = productRepo.create({
    storeId: store.id,
    categoryId: category.id,
    name: spec.name,
    slug: spec.slug,
    description: spec.description,
    brand: spec.brand,
    price: spec.price,
    discountPrice: spec.discountPrice ?? null,
    stockQuantity: spec.stockQuantity,
    lowStockThreshold: spec.lowStockThreshold ?? 5,
    deliveryType: ProductDeliveryType.BOTH,
    status: ProductStatus.ACTIVE,
    tags: spec.tags ?? null,
  });
  const savedProduct = await productRepo.save(product);
  counts.products.created++;

  const images = [
    imageRepo.create({
      productId: savedProduct.id,
      url: picsum(spec.slug, 600, 600),
      sortOrder: 0,
    }),
    imageRepo.create({
      productId: savedProduct.id,
      url: picsum(`${spec.slug}-alt`, 600, 600),
      sortOrder: 1,
    }),
  ];
  await imageRepo.save(images);
  counts.productImages.created += images.length;

  if (spec.variants && spec.variants.length > 0) {
    const variants = spec.variants.map((v) =>
      variantRepo.create({
        productId: savedProduct.id,
        name: v.name,
        sku: v.sku,
        priceDelta: v.priceDelta,
        stockQuantity: v.stockQuantity,
      }),
    );
    await variantRepo.save(variants);
    counts.productVariants.created += variants.length;
  }

  return savedProduct;
}

async function getOrCreateAddress(
  addressRepo: import('typeorm').Repository<Address>,
  user: User,
  data: {
    label: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    pincode: string;
    lat: number;
    lng: number;
    isDefault?: boolean;
  },
): Promise<Address> {
  const existing = await addressRepo.findOne({
    where: { userId: user.id, label: data.label },
  });
  if (existing) {
    counts.addresses.skipped++;
    return existing;
  }
  const address = addressRepo.create({
    userId: user.id,
    label: data.label,
    line1: data.line1,
    line2: data.line2,
    city: data.city,
    state: data.state,
    country: 'India',
    pincode: data.pincode,
    lat: data.lat,
    lng: data.lng,
    isDefault: data.isDefault ?? false,
  });
  const saved = await addressRepo.save(address);
  counts.addresses.created++;
  return saved;
}

async function seed(): Promise<void> {
  await dataSource.initialize();

  const userRepo = dataSource.getRepository(User);
  const categoryRepo = dataSource.getRepository(Category);
  const storeRepo = dataSource.getRepository(Store);
  const workingHoursRepo = dataSource.getRepository(StoreWorkingHours);
  const deliverySettingsRepo = dataSource.getRepository(StoreDeliverySettings);
  const addressRepo = dataSource.getRepository(Address);
  const productRepo = dataSource.getRepository(Product);
  const productImageRepo = dataSource.getRepository(ProductImage);
  const productVariantRepo = dataSource.getRepository(ProductVariant);

  // ---------------------------------------------------------------------
  // 1. Admin user
  // ---------------------------------------------------------------------
  await getOrCreateUser(userRepo, {
    email: SEED_ADMIN_EMAIL,
    password: SEED_ADMIN_PASSWORD,
    role: Role.ADMIN,
    fullName: 'BODA Admin',
  });

  // ---------------------------------------------------------------------
  // 2. Categories (flat + a couple with children)
  // ---------------------------------------------------------------------
  await seedCategories(categoryRepo);
  const groceries = await categoryRepo.findOneOrFail({ where: { slug: 'groceries' } });
  const restaurants = await categoryRepo.findOneOrFail({ where: { slug: 'restaurants-food' } });

  // ---------------------------------------------------------------------
  // 3. Sellers + stores
  // ---------------------------------------------------------------------
  const freshMartSeller = await getOrCreateUser(userRepo, {
    email: 'seller.freshmart@boda.local',
    password: SEED_DEMO_PASSWORD,
    role: Role.SELLER,
    fullName: 'Ravi Kumar',
    phone: '+919876500001',
  });
  const techZoneSeller = await getOrCreateUser(userRepo, {
    email: 'seller.techzone@boda.local',
    password: SEED_DEMO_PASSWORD,
    role: Role.SELLER,
    fullName: 'Anita Sharma',
    phone: '+919876500002',
  });
  const spiceKitchenSeller = await getOrCreateUser(userRepo, {
    email: 'seller.spicekitchen@boda.local',
    password: SEED_DEMO_PASSWORD,
    role: Role.SELLER,
    fullName: 'Mohammed Iqbal',
    phone: '+919876500003',
  });

  const freshMart = await getOrCreateStore(
    storeRepo,
    workingHoursRepo,
    deliverySettingsRepo,
    freshMartSeller,
    {
      slug: 'fresh-mart',
      name: 'Fresh Mart',
      sellerEmail: freshMartSeller.email,
      sellerFullName: freshMartSeller.fullName,
      businessType: 'Grocery Retail',
      gstNumber: '29ABCDE1234F1Z5',
      phone: '+918041234501',
      city: 'Bangalore',
      state: 'Karnataka',
      pincode: '560001',
      addressLine: '12 MG Road',
      lat: 12.9716,
      lng: 77.5946,
      description: 'Your neighbourhood grocery store for fresh produce and daily essentials.',
      deliveryMode: DeliveryMode.BOTH,
      deliveryFee: 30,
      freeDeliveryThreshold: 300,
      deliverySpeed: DeliverySpeed.SAME_DAY,
      deliveryRadiusKm: 8,
      categorySlug: 'groceries',
    },
  );

  const techZone = await getOrCreateStore(
    storeRepo,
    workingHoursRepo,
    deliverySettingsRepo,
    techZoneSeller,
    {
      slug: 'techzone-electronics',
      name: 'TechZone Electronics',
      sellerEmail: techZoneSeller.email,
      sellerFullName: techZoneSeller.fullName,
      businessType: 'Electronics Retail',
      gstNumber: '29PQRSX5678K1Z3',
      phone: '+918041234502',
      city: 'Bangalore',
      state: 'Karnataka',
      pincode: '560025',
      addressLine: '45 Brigade Road',
      lat: 12.9789,
      lng: 77.6008,
      description: 'Latest mobiles, gadgets and accessories at your doorstep.',
      deliveryMode: DeliveryMode.DELIVERY,
      deliveryFee: 49,
      freeDeliveryThreshold: 999,
      deliverySpeed: DeliverySpeed.NEXT_DAY,
      deliveryRadiusKm: 15,
      sundayHoliday: true,
      categorySlug: 'electronics',
    },
  );

  const spiceKitchen = await getOrCreateStore(
    storeRepo,
    workingHoursRepo,
    deliverySettingsRepo,
    spiceKitchenSeller,
    {
      slug: 'spice-kitchen',
      name: 'Spice Kitchen',
      sellerEmail: spiceKitchenSeller.email,
      sellerFullName: spiceKitchenSeller.fullName,
      businessType: 'Restaurant',
      gstNumber: '29LMNOP9012Q1Z8',
      phone: '+918041234503',
      city: 'Bangalore',
      state: 'Karnataka',
      pincode: '560034',
      addressLine: '8 Indiranagar 100ft Road',
      lat: 12.9634,
      lng: 77.6389,
      description: 'Authentic home-style Indian cooking, delivered hot and fast.',
      deliveryMode: DeliveryMode.BOTH,
      deliveryFee: 15,
      freeDeliveryThreshold: 200,
      deliverySpeed: DeliverySpeed.TEN_MIN,
      deliveryRadiusKm: 5,
      categorySlug: 'restaurants-food',
    },
  );

  // ---------------------------------------------------------------------
  // 4. Customers
  // ---------------------------------------------------------------------
  const priya = await getOrCreateUser(userRepo, {
    email: 'customer.priya@boda.local',
    password: SEED_DEMO_PASSWORD,
    role: Role.CUSTOMER,
    fullName: 'Priya Nair',
    phone: '+919876511001',
  });
  const arjun = await getOrCreateUser(userRepo, {
    email: 'customer.arjun@boda.local',
    password: SEED_DEMO_PASSWORD,
    role: Role.CUSTOMER,
    fullName: 'Arjun Reddy',
    phone: '+919876511002',
  });
  const meera = await getOrCreateUser(userRepo, {
    email: 'customer.meera@boda.local',
    password: SEED_DEMO_PASSWORD,
    role: Role.CUSTOMER,
    fullName: 'Meera Iyer',
    phone: '+919876511003',
  });

  await getOrCreateAddress(addressRepo, priya, {
    label: 'Home',
    line1: '221 Koramangala 5th Block',
    city: 'Bangalore',
    state: 'Karnataka',
    pincode: '560095',
    lat: 12.9352,
    lng: 77.6146,
    isDefault: true,
  });
  await getOrCreateAddress(addressRepo, arjun, {
    label: 'Home',
    line1: '77 HSR Layout Sector 2',
    city: 'Bangalore',
    state: 'Karnataka',
    pincode: '560102',
    lat: 12.9116,
    lng: 77.6412,
    isDefault: true,
  });

  // ---------------------------------------------------------------------
  // 5. Products
  // ---------------------------------------------------------------------
  const fruitsVegCategory = await categoryRepo.findOneOrFail({
    where: { slug: 'fruits-vegetables' },
  });
  const dairyBakeryCategory = await categoryRepo.findOneOrFail({
    where: { slug: 'dairy-bakery' },
  });
  const mobilesCategory = await categoryRepo.findOneOrFail({ where: { slug: 'mobiles' } });
  const accessoriesCategory = await categoryRepo.findOneOrFail({
    where: { slug: 'accessories' },
  });

  // Fresh Mart (Groceries)
  await getOrCreateProduct(productRepo, productImageRepo, productVariantRepo, freshMart, fruitsVegCategory, {
    slug: 'fresh-mart-alphonso-mangoes',
    name: 'Alphonso Mangoes (1 dozen)',
    description: 'Premium Ratnagiri Alphonso mangoes, hand-picked and naturally ripened.',
    brand: 'Fresh Mart Farms',
    price: 599,
    discountPrice: 549,
    stockQuantity: 40,
    tags: ['fruits', 'seasonal'],
  });
  await getOrCreateProduct(productRepo, productImageRepo, productVariantRepo, freshMart, fruitsVegCategory, {
    slug: 'fresh-mart-organic-tomatoes',
    name: 'Organic Tomatoes',
    description: 'Farm-fresh organic tomatoes, sold by weight.',
    brand: 'Fresh Mart Farms',
    price: 60,
    stockQuantity: 120,
    tags: ['vegetables', 'organic'],
    variants: [
      { name: '500g', priceDelta: 0, stockQuantity: 60 },
      { name: '1kg', priceDelta: 55, stockQuantity: 60 },
    ],
  });
  await getOrCreateProduct(productRepo, productImageRepo, productVariantRepo, freshMart, dairyBakeryCategory, {
    slug: 'fresh-mart-whole-milk',
    name: 'Whole Milk (1 litre)',
    description: 'Farm-fresh pasteurized whole milk, delivered chilled.',
    brand: 'Nandini',
    price: 66,
    stockQuantity: 200,
    tags: ['dairy'],
  });
  await getOrCreateProduct(productRepo, productImageRepo, productVariantRepo, freshMart, dairyBakeryCategory, {
    slug: 'fresh-mart-brown-bread',
    name: 'Multigrain Brown Bread',
    description: 'Soft multigrain bread baked fresh daily.',
    brand: 'Modern Foods',
    price: 55,
    stockQuantity: 8,
    lowStockThreshold: 10, // deliberately at/below threshold to populate low-stock dashboard
    tags: ['bakery'],
  });
  await getOrCreateProduct(productRepo, productImageRepo, productVariantRepo, freshMart, groceries, {
    slug: 'fresh-mart-basmati-rice',
    name: 'Premium Basmati Rice (5kg)',
    description: 'Aged, extra-long grain basmati rice.',
    brand: 'India Gate',
    price: 650,
    discountPrice: 599,
    stockQuantity: 75,
    tags: ['staples'],
  });

  // TechZone Electronics
  await getOrCreateProduct(productRepo, productImageRepo, productVariantRepo, techZone, mobilesCategory, {
    slug: 'techzone-galaxy-m14',
    name: 'Samsung Galaxy M14 5G (128GB)',
    description: 'Reliable everyday smartphone with a large 6000mAh battery.',
    brand: 'Samsung',
    price: 14999,
    discountPrice: 13499,
    stockQuantity: 25,
    tags: ['mobile', '5g'],
    variants: [
      { name: 'Icy Silver', priceDelta: 0, stockQuantity: 15 },
      { name: 'Berry Blue', priceDelta: 0, stockQuantity: 10 },
    ],
  });
  await getOrCreateProduct(productRepo, productImageRepo, productVariantRepo, techZone, mobilesCategory, {
    slug: 'techzone-redmi-13c',
    name: 'Redmi 13C (128GB)',
    description: 'Budget-friendly smartphone with a 90Hz display.',
    brand: 'Xiaomi',
    price: 9999,
    stockQuantity: 30,
    tags: ['mobile', 'budget'],
  });
  await getOrCreateProduct(productRepo, productImageRepo, productVariantRepo, techZone, accessoriesCategory, {
    slug: 'techzone-usb-c-charger-33w',
    name: '33W USB-C Fast Charger',
    description: 'Compact GaN fast charger, compatible with most Android phones.',
    brand: 'Anker',
    price: 1499,
    discountPrice: 1199,
    stockQuantity: 60,
    tags: ['charger', 'accessory'],
  });
  await getOrCreateProduct(productRepo, productImageRepo, productVariantRepo, techZone, accessoriesCategory, {
    slug: 'techzone-bt-earbuds',
    name: 'Wireless Bluetooth Earbuds',
    description: 'True wireless earbuds with 24-hour battery backup with case.',
    brand: 'boAt',
    price: 1999,
    stockQuantity: 45,
    tags: ['audio', 'accessory'],
  });

  // Spice Kitchen (Restaurant)
  await getOrCreateProduct(productRepo, productImageRepo, productVariantRepo, spiceKitchen, restaurants, {
    slug: 'spice-kitchen-butter-chicken',
    name: 'Butter Chicken (Full)',
    description: 'Creamy tomato-based curry with tender tandoori chicken.',
    price: 320,
    stockQuantity: 50,
    tags: ['non-veg', 'curry'],
  });
  await getOrCreateProduct(productRepo, productImageRepo, productVariantRepo, spiceKitchen, restaurants, {
    slug: 'spice-kitchen-paneer-tikka',
    name: 'Paneer Tikka',
    description: 'Marinated cottage cheese cubes grilled to smoky perfection.',
    price: 260,
    stockQuantity: 40,
    tags: ['veg', 'starter'],
  });
  await getOrCreateProduct(productRepo, productImageRepo, productVariantRepo, spiceKitchen, restaurants, {
    slug: 'spice-kitchen-veg-biryani',
    name: 'Vegetable Biryani',
    description: 'Fragrant basmati rice cooked with mixed vegetables and spices.',
    price: 220,
    stockQuantity: 55,
    tags: ['veg', 'rice'],
  });
  await getOrCreateProduct(productRepo, productImageRepo, productVariantRepo, spiceKitchen, restaurants, {
    slug: 'spice-kitchen-gulab-jamun',
    name: 'Gulab Jamun (2 pieces)',
    description: 'Soft milk-solid dumplings soaked in rose-cardamom syrup.',
    price: 90,
    stockQuantity: 30,
    tags: ['dessert'],
  });

  // ---------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------
  // eslint-disable-next-line no-console
  console.log('\n=== BODA Seed Summary ===');
  console.log('Users            ', counts.users);
  console.log('Categories       ', counts.categories);
  console.log('Stores           ', counts.stores);
  console.log('Working hours    ', counts.workingHours);
  console.log('Delivery settings', counts.deliverySettings);
  console.log('Addresses        ', counts.addresses);
  console.log('Products         ', counts.products);
  console.log('Product images   ', counts.productImages);
  console.log('Product variants ', counts.productVariants);

  console.log('\n=== Demo credentials ===');
  console.log(`Admin:     ${SEED_ADMIN_EMAIL} / ${SEED_ADMIN_PASSWORD}`);
  console.log(`Seller:    ${freshMartSeller.email} / ${SEED_DEMO_PASSWORD}  (Fresh Mart)`);
  console.log(`Seller:    ${techZoneSeller.email} / ${SEED_DEMO_PASSWORD}  (TechZone Electronics)`);
  console.log(`Seller:    ${spiceKitchenSeller.email} / ${SEED_DEMO_PASSWORD}  (Spice Kitchen)`);
  console.log(`Customer:  ${priya.email} / ${SEED_DEMO_PASSWORD}`);
  console.log(`Customer:  ${arjun.email} / ${SEED_DEMO_PASSWORD}`);
  console.log(`Customer:  ${meera.email} / ${SEED_DEMO_PASSWORD}`);
  console.log(`\nShared demo password for all sellers/customers: ${SEED_DEMO_PASSWORD}`);
}

if (require.main === module) {
  seed()
    .then(() => {
      console.log('\nSeed completed successfully.');
    })
    .catch((error) => {
      console.error('Seed failed:', error);
      process.exitCode = 1;
    })
    .finally(async () => {
      if (dataSource.isInitialized) {
        await dataSource.destroy();
      }
      if (process.exitCode) {
        process.exit(process.exitCode);
      }
    });
}

export { seed, seedCategories };
