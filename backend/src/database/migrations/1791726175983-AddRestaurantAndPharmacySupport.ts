import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRestaurantAndPharmacySupport1791726175983 implements MigrationInterface {
    name = 'AddRestaurantAndPharmacySupport1791726175983'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."stores_storetype_enum" AS ENUM('retail', 'restaurant', 'pharmacy')`);
        await queryRunner.query(`ALTER TABLE "stores" ADD "storeType" "public"."stores_storetype_enum" NOT NULL DEFAULT 'retail'`);
        await queryRunner.query(`ALTER TABLE "products" ADD "trackInventory" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(`ALTER TABLE "products" ADD "isAvailable" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(`CREATE TYPE "public"."products_foodtype_enum" AS ENUM('veg', 'non_veg', 'egg')`);
        await queryRunner.query(`ALTER TABLE "products" ADD "foodType" "public"."products_foodtype_enum"`);
        await queryRunner.query(`ALTER TABLE "products" ADD "preparationTimeMins" integer`);
        await queryRunner.query(`ALTER TABLE "products" ADD "addonGroups" jsonb NOT NULL DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "products" ADD "requiresPrescription" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "products" ADD "composition" character varying`);
        await queryRunner.query(`ALTER TABLE "products" ADD "expiryDate" date`);
        await queryRunner.query(`ALTER TABLE "order_items" ADD "addons" jsonb NOT NULL DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "order_items" ADD "stockDeducted" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(`CREATE TYPE "public"."orders_prescriptionstatus_enum" AS ENUM('not_required', 'pending_review', 'approved', 'rejected')`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "prescriptionStatus" "public"."orders_prescriptionstatus_enum" NOT NULL DEFAULT 'not_required'`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "prescriptionKeys" jsonb NOT NULL DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "prescriptionNote" text`);
        await queryRunner.query(`ALTER TABLE "cart_items" ADD "addonOptionIds" jsonb NOT NULL DEFAULT '[]'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "cart_items" DROP COLUMN "addonOptionIds"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "prescriptionNote"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "prescriptionKeys"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "prescriptionStatus"`);
        await queryRunner.query(`DROP TYPE "public"."orders_prescriptionstatus_enum"`);
        await queryRunner.query(`ALTER TABLE "order_items" DROP COLUMN "stockDeducted"`);
        await queryRunner.query(`ALTER TABLE "order_items" DROP COLUMN "addons"`);
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "expiryDate"`);
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "composition"`);
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "requiresPrescription"`);
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "addonGroups"`);
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "preparationTimeMins"`);
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "foodType"`);
        await queryRunner.query(`DROP TYPE "public"."products_foodtype_enum"`);
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "isAvailable"`);
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "trackInventory"`);
        await queryRunner.query(`ALTER TABLE "stores" DROP COLUMN "storeType"`);
        await queryRunner.query(`DROP TYPE "public"."stores_storetype_enum"`);
    }

}
