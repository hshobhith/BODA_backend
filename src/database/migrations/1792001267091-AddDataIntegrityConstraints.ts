import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Moves rules that only lived in app code into the database, so no code path
 * (scripts, admin SQL, a future service) can write invalid rows.
 *
 * Requires existing data to comply, or `up` fails and rolls back cleanly
 * (Postgres names the violated constraint). Pre-check with e.g.:
 *   SELECT "storeId", barcode FROM products WHERE barcode IS NOT NULL AND status = 'active'
 *     GROUP BY 1, 2 HAVING count(*) > 1;
 *   SELECT id FROM stores WHERE "storeType" <> 'retail' AND btrim(coalesce("licenseInfo", '')) = '';
 *
 * Tables were small when this was written. On large production tables, split
 * it: ADD CONSTRAINT ... NOT VALID, then VALIDATE CONSTRAINT (no long write
 * lock), and CREATE UNIQUE INDEX CONCURRENTLY in a migration with
 * `transaction = false`.
 */

export class AddDataIntegrityConstraints1792001267091 implements MigrationInterface {
    name = 'AddDataIntegrityConstraints1792001267091'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_products_store_active_barcode" ON "products" ("storeId", "barcode") WHERE "barcode" IS NOT NULL AND "status" = 'active'`);
        await queryRunner.query(`ALTER TABLE "stores" ADD CONSTRAINT "CHK_stores_licence_for_licensed_types" CHECK ("storeType" = 'retail' OR btrim(coalesce("licenseInfo", '')) <> '')`);
        await queryRunner.query(`ALTER TABLE "product_variants" ADD CONSTRAINT "CHK_product_variants_stock_non_negative" CHECK ("stockQuantity" >= 0)`);
        await queryRunner.query(`ALTER TABLE "products" ADD CONSTRAINT "CHK_products_addon_groups_array" CHECK (jsonb_typeof("addonGroups") = 'array')`);
        await queryRunner.query(`ALTER TABLE "products" ADD CONSTRAINT "CHK_products_prep_time_non_negative" CHECK ("preparationTimeMins" IS NULL OR "preparationTimeMins" >= 0)`);
        await queryRunner.query(`ALTER TABLE "products" ADD CONSTRAINT "CHK_products_stock_non_negative" CHECK ("stockQuantity" >= 0 AND "lowStockThreshold" >= 0)`);
        await queryRunner.query(`ALTER TABLE "products" ADD CONSTRAINT "CHK_products_money_non_negative" CHECK ("price" >= 0 AND ("discountPrice" IS NULL OR "discountPrice" >= 0))`);
        await queryRunner.query(`ALTER TABLE "order_items" ADD CONSTRAINT "CHK_order_items_addons_array" CHECK (jsonb_typeof("addons") = 'array')`);
        await queryRunner.query(`ALTER TABLE "order_items" ADD CONSTRAINT "CHK_order_items_money_non_negative" CHECK ("unitPrice" >= 0 AND "total" >= 0)`);
        await queryRunner.query(`ALTER TABLE "order_items" ADD CONSTRAINT "CHK_order_items_quantity_positive" CHECK ("quantity" > 0)`);
        await queryRunner.query(`ALTER TABLE "orders" ADD CONSTRAINT "CHK_orders_prescription_files_match_status" CHECK (jsonb_typeof("prescriptionKeys") = 'array' AND ("prescriptionStatus" = 'not_required') = (jsonb_array_length("prescriptionKeys") = 0))`);
        await queryRunner.query(`ALTER TABLE "orders" ADD CONSTRAINT "CHK_orders_money_non_negative" CHECK ("subtotal" >= 0 AND "deliveryFee" >= 0 AND "discount" >= 0 AND "tax" >= 0 AND "total" >= 0)`);
        await queryRunner.query(`ALTER TABLE "cart_items" ADD CONSTRAINT "CHK_cart_items_addon_ids_array" CHECK (jsonb_typeof("addonOptionIds") = 'array')`);
        await queryRunner.query(`ALTER TABLE "cart_items" ADD CONSTRAINT "CHK_cart_items_quantity_positive" CHECK ("quantity" > 0)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "cart_items" DROP CONSTRAINT "CHK_cart_items_quantity_positive"`);
        await queryRunner.query(`ALTER TABLE "cart_items" DROP CONSTRAINT "CHK_cart_items_addon_ids_array"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "CHK_orders_money_non_negative"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "CHK_orders_prescription_files_match_status"`);
        await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT "CHK_order_items_quantity_positive"`);
        await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT "CHK_order_items_money_non_negative"`);
        await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT "CHK_order_items_addons_array"`);
        await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT "CHK_products_money_non_negative"`);
        await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT "CHK_products_stock_non_negative"`);
        await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT "CHK_products_prep_time_non_negative"`);
        await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT "CHK_products_addon_groups_array"`);
        await queryRunner.query(`ALTER TABLE "product_variants" DROP CONSTRAINT "CHK_product_variants_stock_non_negative"`);
        await queryRunner.query(`ALTER TABLE "stores" DROP CONSTRAINT "CHK_stores_licence_for_licensed_types"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_products_store_active_barcode"`);
    }

}
