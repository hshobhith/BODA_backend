import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPosOrdersSupport1785303530318 implements MigrationInterface {
    name = 'AddPosOrdersSupport1785303530318'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."orders_channel_enum" AS ENUM('online', 'pos')`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "channel" "public"."orders_channel_enum" NOT NULL DEFAULT 'online'`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "guestName" character varying`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "guestPhone" character varying`);
        await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "FK_e5de51ca888d8b1f5ac25799dd1"`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "customerId" DROP NOT NULL`);
        await queryRunner.query(`ALTER TYPE "public"."orders_paymentmethod_enum" RENAME TO "orders_paymentmethod_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."orders_paymentmethod_enum" AS ENUM('cod', 'cash')`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "paymentMethod" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "paymentMethod" TYPE "public"."orders_paymentmethod_enum" USING "paymentMethod"::"text"::"public"."orders_paymentmethod_enum"`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "paymentMethod" SET DEFAULT 'cod'`);
        await queryRunner.query(`DROP TYPE "public"."orders_paymentmethod_enum_old"`);
        await queryRunner.query(`ALTER TABLE "orders" ADD CONSTRAINT "FK_e5de51ca888d8b1f5ac25799dd1" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "FK_e5de51ca888d8b1f5ac25799dd1"`);
        await queryRunner.query(`CREATE TYPE "public"."orders_paymentmethod_enum_old" AS ENUM('cod')`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "paymentMethod" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "paymentMethod" TYPE "public"."orders_paymentmethod_enum_old" USING "paymentMethod"::"text"::"public"."orders_paymentmethod_enum_old"`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "paymentMethod" SET DEFAULT 'cod'`);
        await queryRunner.query(`DROP TYPE "public"."orders_paymentmethod_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."orders_paymentmethod_enum_old" RENAME TO "orders_paymentmethod_enum"`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "customerId" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "orders" ADD CONSTRAINT "FK_e5de51ca888d8b1f5ac25799dd1" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "guestPhone"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "guestName"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "channel"`);
        await queryRunner.query(`DROP TYPE "public"."orders_channel_enum"`);
    }

}
