import { MigrationInterface, QueryRunner } from "typeorm";

const SOFT_DELETE_TABLES = ['users', 'addresses', 'categories', 'reviews', 'cart_items', 'wishlist_items'];

/**
 * Deletes from the app become soft deletes: every table with a delete action
 * gets a nullable "deletedAt", and the unique rules that a kept-but-deleted
 * row would otherwise trip become partial (live rows only). users.email and
 * users.googleId stay fully unique on purpose, so a deleted account can't be
 * signed up again.
 *
 * Purely additive for existing data: every current row stays live.
 */
export class SoftDeletes1792842320387 implements MigrationInterface {
    name = 'SoftDeletes1792842320387'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_e99b7e55b580bc03ba2f0e2b25"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_97a0f9b77a1d46c89c387daeb6"`);
        await queryRunner.query(`ALTER TABLE "addresses" ADD "deletedAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "users" ADD "deletedAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "wishlist_items" ADD "deletedAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "reviews" ADD "deletedAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "categories" ADD "deletedAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "cart_items" ADD "deletedAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "categories" DROP CONSTRAINT "UQ_420d9f679d41281f282f5bc7d09"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_wishlist_items_active_user_target" ON "wishlist_items" ("userId", "targetType", "targetId") WHERE "deletedAt" IS NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_reviews_active_user_target" ON "reviews" ("userId", "targetType", "targetId") WHERE "deletedAt" IS NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_categories_active_slug" ON "categories" ("slug") WHERE "deletedAt" IS NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Dropping "deletedAt" would silently bring deleted rows back as live
        // ones (and re-adding full uniqueness would fail on them), so refuse
        // until someone has decided to restore or purge them.
        for (const table of SOFT_DELETE_TABLES) {
            const [{ count }] = await queryRunner.query(
                `SELECT count(*)::int AS count FROM "${table}" WHERE "deletedAt" IS NOT NULL`,
            );
            if (count > 0) {
                throw new Error(
                    `Cannot revert SoftDeletes: "${table}" has ${count} soft-deleted row(s) that would reappear as live. Restore or purge them first.`,
                );
            }
        }

        await queryRunner.query(`DROP INDEX "public"."UQ_categories_active_slug"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_reviews_active_user_target"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_wishlist_items_active_user_target"`);
        await queryRunner.query(`ALTER TABLE "categories" ADD CONSTRAINT "UQ_420d9f679d41281f282f5bc7d09" UNIQUE ("slug")`);
        await queryRunner.query(`ALTER TABLE "cart_items" DROP COLUMN "deletedAt"`);
        await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN "deletedAt"`);
        await queryRunner.query(`ALTER TABLE "reviews" DROP COLUMN "deletedAt"`);
        await queryRunner.query(`ALTER TABLE "wishlist_items" DROP COLUMN "deletedAt"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "deletedAt"`);
        await queryRunner.query(`ALTER TABLE "addresses" DROP COLUMN "deletedAt"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_97a0f9b77a1d46c89c387daeb6" ON "reviews" ("userId", "targetType", "targetId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_e99b7e55b580bc03ba2f0e2b25" ON "wishlist_items" ("userId", "targetType", "targetId") `);
    }

}
