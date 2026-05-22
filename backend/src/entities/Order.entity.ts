import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from './User.entity';
import { Material } from './Material.entity';
import { OrderEvent } from './OrderEvent.entity';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  order_number: string;

  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'uuid', nullable: true })
  factory_user_id?: string;

  @Column({ type: 'varchar', length: 50, default: 'pending' })
  status: 'pending' | 'approved' | 'production' | 'quality_check' | 'ready_to_ship' | 'shipped' | 'delivered' | 'cancelled';

  @Column({ type: 'uuid', nullable: true })
  design_id?: string;

  @Column({ type: 'text', nullable: true })
  design_3d_model_path?: string;

  @Column({ type: 'text', nullable: true })
  design_preview_url?: string;

  @Column({ type: 'jsonb', default: '{}' })
  design_specifications: Record<string, any>;

  @Column({ type: 'uuid', nullable: true })
  material_id?: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  material_quantity?: number;

  @Column({ type: 'varchar', length: 20, nullable: true })
  material_unit?: string;

  @Column({ type: 'jsonb', default: '{}' })
  material_properties: Record<string, any>;

  @Column({ type: 'jsonb', default: '[]' })
  decals_paths: string[];

  @Column({ type: 'jsonb', default: '{}' })
  colors: Record<string, any>;

  @Column({ type: 'text', nullable: true })
  inscriptions?: string;

  @Column({ type: 'jsonb', default: '{}' })
  custom_metadata: Record<string, any>;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  unit_price: number;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  material_cost: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  production_cost: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  total_cost: number;

  @Column({ type: 'varchar', length: 50, default: 'standard' })
  delivery_type: 'standard' | 'express' | 'economy';

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  shipping_cost: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  tracking_number?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  shipping_address_street?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  shipping_address_number?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  shipping_address_complement?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  shipping_address_district?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  shipping_address_city?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  shipping_address_state?: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  shipping_address_postal_code?: string;

  @Column({ type: 'varchar', length: 100, default: 'BR' })
  shipping_address_country: string;

  @Column({ type: 'timestamptz', nullable: true })
  production_started_at?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  production_completed_at?: Date;

  @Column({ type: 'text', nullable: true })
  quality_check_notes?: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'factory_user_id' })
  factory_user?: User;

  @ManyToOne(() => Material, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'material_id' })
  material?: Material;

  @OneToMany(() => OrderEvent, (event) => event.order)
  events: OrderEvent[];
}
