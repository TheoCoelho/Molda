import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateOrdersTables1000000000002 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // Orders table
    await queryRunner.createTable(
      new Table({
        name: 'orders',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'order_number',
            type: 'varchar',
            length: '50',
            isUnique: true,
          },
          {
            name: 'user_id',
            type: 'uuid',
          },
          {
            name: 'factory_user_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '50',
            default: "'pending'",
          },
          {
            name: 'design_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'design_3d_model_path',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'design_preview_url',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'design_specifications',
            type: 'jsonb',
            default: "'{}'",
          },
          {
            name: 'material_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'material_quantity',
            type: 'decimal',
            precision: 10,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'material_unit',
            type: 'varchar',
            length: '20',
            isNullable: true,
          },
          {
            name: 'material_properties',
            type: 'jsonb',
            default: "'{}'",
          },
          {
            name: 'decals_paths',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'colors',
            type: 'jsonb',
            default: "'{}'",
          },
          {
            name: 'inscriptions',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'custom_metadata',
            type: 'jsonb',
            default: "'{}'",
          },
          {
            name: 'unit_price',
            type: 'decimal',
            precision: 10,
            scale: 2,
          },
          {
            name: 'quantity',
            type: 'int',
            default: 1,
          },
          {
            name: 'material_cost',
            type: 'decimal',
            precision: 10,
            scale: 2,
            default: 0,
          },
          {
            name: 'production_cost',
            type: 'decimal',
            precision: 10,
            scale: 2,
            default: 0,
          },
          {
            name: 'total_cost',
            type: 'decimal',
            precision: 10,
            scale: 2,
          },
          {
            name: 'delivery_type',
            type: 'varchar',
            length: '50',
            default: "'standard'",
          },
          {
            name: 'shipping_cost',
            type: 'decimal',
            precision: 10,
            scale: 2,
            default: 0,
          },
          {
            name: 'tracking_number',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'shipping_address_street',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'shipping_address_number',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'shipping_address_complement',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'shipping_address_district',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'shipping_address_city',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'shipping_address_state',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'shipping_address_postal_code',
            type: 'varchar',
            length: '20',
            isNullable: true,
          },
          {
            name: 'shipping_address_country',
            type: 'varchar',
            length: '100',
            default: "'BR'",
          },
          {
            name: 'production_started_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'production_completed_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'quality_check_notes',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'now()',
          },
        ],
        foreignKeys: [
          {
            columnNames: ['user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
          },
          {
            columnNames: ['factory_user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          },
          {
            columnNames: ['material_id'],
            referencedTableName: 'materials',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex('orders', new TableIndex({ columnNames: ['user_id'] }));
    await queryRunner.createIndex('orders', new TableIndex({ columnNames: ['factory_user_id'] }));
    await queryRunner.createIndex('orders', new TableIndex({ columnNames: ['status'] }));
    await queryRunner.createIndex('orders', new TableIndex({ columnNames: ['order_number'] }));
    await queryRunner.createIndex('orders', new TableIndex({ columnNames: ['created_at'], isUnique: false }));

    // OrderEvents table
    await queryRunner.createTable(
      new Table({
        name: 'order_events',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'order_id',
            type: 'uuid',
          },
          {
            name: 'event_type',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'triggered_by',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'details',
            type: 'jsonb',
            default: "'{}'",
          },
          {
            name: 'notes',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'previous_status',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'new_status',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
          },
        ],
        foreignKeys: [
          {
            columnNames: ['order_id'],
            referencedTableName: 'orders',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
          {
            columnNames: ['triggered_by'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex('order_events', new TableIndex({ columnNames: ['order_id'] }));
    await queryRunner.createIndex('order_events', new TableIndex({ columnNames: ['triggered_by'] }));
    await queryRunner.createIndex('order_events', new TableIndex({ columnNames: ['created_at'], isUnique: false }));
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('order_events', true);
    await queryRunner.dropTable('orders', true);
  }
}

