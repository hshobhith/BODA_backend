import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProductBarcodeIndex1791997796243 implements MigrationInterface {
    name = 'AddProductBarcodeIndex1791997796243'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE INDEX "IDX_adfc522baf9d9b19cd7d9461b7" ON "products" ("barcode") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_adfc522baf9d9b19cd7d9461b7"`);
    }

}
