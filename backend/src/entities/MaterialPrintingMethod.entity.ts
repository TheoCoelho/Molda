import { Entity, Column, ManyToOne, JoinColumn, PrimaryColumn } from 'typeorm';
import { Material } from './Material.entity';
import { PrintingMethod } from './PrintingMethod.entity';

@Entity('material_printing_methods')
export class MaterialPrintingMethod {
  @PrimaryColumn({ type: 'uuid' })
  material_id: string;

  @PrimaryColumn({ type: 'uuid' })
  printing_method_id: string;

  @ManyToOne(() => Material, (material) => material.printing_methods, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'material_id' })
  material: Material;

  @ManyToOne(() => PrintingMethod, (method) => method.materials, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'printing_method_id' })
  printing_method: PrintingMethod;
}
