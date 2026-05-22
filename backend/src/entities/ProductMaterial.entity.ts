import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Product } from './Product.entity';
import { Material } from './Material.entity';

@Entity('product_materials')
export class ProductMaterial {
  @PrimaryColumn({ type: 'uuid' })
  product_id: string;

  @PrimaryColumn({ type: 'uuid' })
  material_id: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @ManyToOne(() => Material, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'material_id' })
  material: Material;
}
