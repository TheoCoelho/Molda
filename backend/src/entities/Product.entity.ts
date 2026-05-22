import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany, CreateDateColumn } from 'typeorm';
import { ProductType } from './ProductType.entity';
import { ProductSubtype } from './ProductSubtype.entity';
import { ProductImage } from './ProductImage.entity';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  type_id: string;

  @Column({ type: 'uuid', nullable: true })
  subtype_id?: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  sku: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'text', array: true, nullable: true })
  available_colors?: string[];

  @Column({ type: 'boolean', default: true })
  available: boolean;

  @Column({ type: 'boolean', default: true })
  visible: boolean;

  @Column({ type: 'text', nullable: true })
  cover_image_path?: string;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => ProductType, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'type_id' })
  type: ProductType;

  @ManyToOne(() => ProductSubtype, (subtype) => subtype.products, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'subtype_id' })
  subtype?: ProductSubtype;

  @OneToMany(() => ProductImage, (image) => image.product)
  images: ProductImage[];
}
