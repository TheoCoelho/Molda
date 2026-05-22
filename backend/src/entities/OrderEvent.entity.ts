import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Order } from './Order.entity';
import { User } from './User.entity';

@Entity('order_events')
export class OrderEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  order_id: string;

  @Column({ type: 'varchar', length: 100 })
  event_type: string;

  @Column({ type: 'uuid', nullable: true })
  triggered_by?: string;

  @Column({ type: 'jsonb', default: '{}' })
  details: Record<string, any>;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  previous_status?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  new_status?: string;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Order, (order) => order.events, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'triggered_by' })
  triggered_by_user?: User;
}
