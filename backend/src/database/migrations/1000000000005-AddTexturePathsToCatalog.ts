import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddTexturePathsToCatalog1000000000005 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('materials', 'texture_path'))) {
      await queryRunner.addColumn(
        'materials',
        new TableColumn({
          name: 'texture_path',
          type: 'text',
          isNullable: true,
        }),
      );
    }

    if (!(await queryRunner.hasColumn('printing_methods', 'texture_path'))) {
      await queryRunner.addColumn(
        'printing_methods',
        new TableColumn({
          name: 'texture_path',
          type: 'text',
          isNullable: true,
        }),
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('printing_methods', 'texture_path')) {
      await queryRunner.dropColumn('printing_methods', 'texture_path');
    }

    if (await queryRunner.hasColumn('materials', 'texture_path')) {
      await queryRunner.dropColumn('materials', 'texture_path');
    }
  }
}
