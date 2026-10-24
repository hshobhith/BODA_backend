import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSellerReplyToReviews1785244873150 implements MigrationInterface {
    name = 'AddSellerReplyToReviews1785244873150'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "reviews" ADD "sellerReply" text`);
        await queryRunner.query(`ALTER TABLE "reviews" ADD "sellerRepliedAt" TIMESTAMP WITH TIME ZONE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "reviews" DROP COLUMN "sellerRepliedAt"`);
        await queryRunner.query(`ALTER TABLE "reviews" DROP COLUMN "sellerReply"`);
    }

}
