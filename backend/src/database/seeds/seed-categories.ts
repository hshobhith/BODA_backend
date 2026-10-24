/**
 * Seeds just the product category taxonomy — no demo users/stores/products.
 * Useful for a DB that already has real seller/store data and only needs
 * categories (e.g. a seller can't list a product without one). Idempotent,
 * same as `run-seed.ts`: existing categories are looked up by slug and left
 * untouched.
 *
 * Usage: `npm run seed:categories`
 */
import dataSource from '../data-source';
import { Category } from '../../modules/categories/entities/category.entity';
import { seedCategories } from './run-seed';

async function main(): Promise<void> {
  await dataSource.initialize();
  const categoryRepo = dataSource.getRepository(Category);

  const before = await categoryRepo.count();
  await seedCategories(categoryRepo);
  const after = await categoryRepo.count();

  console.log(`Categories: ${before} -> ${after} (${after - before} added)`);
}

main()
  .then(() => {
    console.log('Category seed completed successfully.');
  })
  .catch((error) => {
    console.error('Category seed failed:', error);
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
