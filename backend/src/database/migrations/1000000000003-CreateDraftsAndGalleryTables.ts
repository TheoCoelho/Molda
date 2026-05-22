import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateDraftsAndGalleryTables1000000000003 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // ProjectDrafts table
    await queryRunner.createTable(
      new Table({
        name: 'project_drafts',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'user_id',
            type: 'uuid',
          },
          {
            name: 'name',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'data',
            type: 'jsonb',
            default: "'{}'",
          },
          {
            name: 'is_public',
            type: 'boolean',
            default: false,
          },
          {
            name: 'expires_at',
            type: 'timestamptz',
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
            onDelete: 'CASCADE',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex('project_drafts', new TableIndex({ columnNames: ['user_id'] }));
    await queryRunner.createIndex('project_drafts', new TableIndex({ columnNames: ['user_id', 'is_public'] }));
    await queryRunner.createIndex('project_drafts', new TableIndex({ columnNames: ['updated_at'], isUnique: false }));

    // GalleryItems table
    await queryRunner.createTable(
      new Table({
        name: 'gallery_visibility',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'user_id',
            type: 'uuid',
          },
          {
            name: 'storage_path',
            type: 'text',
          },
          {
            name: 'is_public',
            type: 'boolean',
            default: false,
          },
          {
            name: 'design_value',
            type: 'decimal',
            precision: 10,
            scale: 2,
            default: 0,
          },
          {
            name: 'design_name',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'title',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'image_url',
            type: 'varchar',
            length: '500',
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
            onDelete: 'CASCADE',
          },
        ],
        uniques: [
          {
            columnNames: ['user_id', 'storage_path'],
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex('gallery_visibility', new TableIndex({ columnNames: ['user_id'] }));
    await queryRunner.createIndex('gallery_visibility', new TableIndex({ columnNames: ['is_public'] }));

    // ProfileAddresses table
    await queryRunner.createTable(
      new Table({
        name: 'profile_addresses',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'user_id',
            type: 'uuid',
          },
          {
            name: 'street',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'number',
            type: 'varchar',
            length: '50',
          },
          {
            name: 'complement',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'district',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'city',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'state',
            type: 'varchar',
            length: '50',
          },
          {
            name: 'postal_code',
            type: 'varchar',
            length: '20',
          },
          {
            name: 'country',
            type: 'varchar',
            length: '100',
            default: "'BR'",
          },
          {
            name: 'is_default',
            type: 'boolean',
            default: false,
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
            onDelete: 'CASCADE',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex('profile_addresses', new TableIndex({ columnNames: ['user_id'] }));
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('profile_addresses', true);
    await queryRunner.dropTable('gallery_visibility', true);
    await queryRunner.dropTable('project_drafts', true);
  }
}

