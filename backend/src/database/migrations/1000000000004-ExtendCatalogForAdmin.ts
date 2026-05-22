import { MigrationInterface, QueryRunner, Table, TableColumn } from 'typeorm';

export class ExtendCatalogForAdmin1000000000004 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    const hasAvailableColors = await queryRunner.hasColumn('products', 'available_colors');
    if (!hasAvailableColors) {
      await queryRunner.addColumn(
        'products',
        new TableColumn({
          name: 'available_colors',
          type: 'text',
          isArray: true,
          isNullable: true,
        }),
      );
    }

    const hasProductMaterials = await queryRunner.hasTable('product_materials');
    if (!hasProductMaterials) {
      await queryRunner.createTable(
        new Table({
          name: 'product_materials',
          columns: [
            { name: 'product_id', type: 'uuid', isPrimary: true },
            { name: 'material_id', type: 'uuid', isPrimary: true },
          ],
          foreignKeys: [
            {
              columnNames: ['product_id'],
              referencedTableName: 'products',
              referencedColumnNames: ['id'],
              onDelete: 'CASCADE',
            },
            {
              columnNames: ['material_id'],
              referencedTableName: 'materials',
              referencedColumnNames: ['id'],
              onDelete: 'RESTRICT',
            },
          ],
        }),
        true,
      );
    }

    const hasSubtypeMaterials = await queryRunner.hasTable('subtype_materials');
    if (!hasSubtypeMaterials) {
      await queryRunner.createTable(
        new Table({
          name: 'subtype_materials',
          columns: [
            { name: 'subtype_id', type: 'uuid', isPrimary: true },
            { name: 'material_id', type: 'uuid', isPrimary: true },
          ],
          foreignKeys: [
            {
              columnNames: ['subtype_id'],
              referencedTableName: 'product_subtypes',
              referencedColumnNames: ['id'],
              onDelete: 'CASCADE',
            },
            {
              columnNames: ['material_id'],
              referencedTableName: 'materials',
              referencedColumnNames: ['id'],
              onDelete: 'RESTRICT',
            },
          ],
        }),
        true,
      );
    }

    const hasInventory = await queryRunner.hasTable('inventory');
    if (!hasInventory) {
      await queryRunner.createTable(
        new Table({
          name: 'inventory',
          columns: [
            { name: 'product_id', type: 'uuid', isPrimary: true },
            { name: 'on_hand', type: 'int', default: 0 },
            { name: 'reserved', type: 'int', default: 0 },
            { name: 'updated_at', type: 'timestamptz', default: 'now()' },
          ],
          foreignKeys: [
            {
              columnNames: ['product_id'],
              referencedTableName: 'products',
              referencedColumnNames: ['id'],
              onDelete: 'CASCADE',
            },
          ],
        }),
        true,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('inventory')) {
      await queryRunner.dropTable('inventory', true);
    }

    if (await queryRunner.hasTable('subtype_materials')) {
      await queryRunner.dropTable('subtype_materials', true);
    }

    if (await queryRunner.hasTable('product_materials')) {
      await queryRunner.dropTable('product_materials', true);
    }

    if (await queryRunner.hasColumn('products', 'available_colors')) {
      await queryRunner.dropColumn('products', 'available_colors');
    }
  }
}
