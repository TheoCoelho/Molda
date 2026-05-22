import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Product } from './Product.entity';

@Entity('inventory')
export class Inventory {
  @PrimaryColumn({ type: 'uuid' })
  product_id: string;

  @Column({ type: 'int', default: 0 })
  on_hand: number;

  @Column({ type: 'int', default: 0 })
  reserved: number;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updated_at: Date;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;
}
