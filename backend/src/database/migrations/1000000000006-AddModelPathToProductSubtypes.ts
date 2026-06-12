import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddModelPathToProductSubtypes1000000000006 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('product_subtypes', 'model_3d_path'))) {
      await queryRunner.addColumn(
        'product_subtypes',
        new TableColumn({
          name: 'model_3d_path',
          type: 'text',
          isNullable: true,
        }),
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('product_subtypes', 'model_3d_path')) {
      await queryRunner.dropColumn('product_subtypes', 'model_3d_path');
    }
  }
}