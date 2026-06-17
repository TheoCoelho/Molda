import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany, CreateDateColumn } from 'typeorm';
import { ProductType } from './ProductType.entity';
import { Product } from './Product.entity';

@Entity('product_subtypes')
export class ProductSubtype {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  type_id: string;

  @Column({ type: 'varchar', length: 255 })
  slug: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'text', nullable: true })
  card_image_path?: string;

  @Column({ type: 'text', nullable: true })
  model_3d_path?: string;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => ProductType, (type) => type.subtypes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'type_id' })
  type: ProductType;

  @OneToMany(() => Product, (product) => product.subtype)
  products: Product[];
}
