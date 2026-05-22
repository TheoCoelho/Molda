import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { ProductSubtype } from './ProductSubtype.entity';
import { Material } from './Material.entity';

@Entity('subtype_materials')
export class SubtypeMaterial {
  @PrimaryColumn({ type: 'uuid' })
  subtype_id: string;

  @PrimaryColumn({ type: 'uuid' })
  material_id: string;

  @ManyToOne(() => ProductSubtype, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subtype_id' })
  subtype: ProductSubtype;

  @ManyToOne(() => Material, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'material_id' })
  material: Material;
}
