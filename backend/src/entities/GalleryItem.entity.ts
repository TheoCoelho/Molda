import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from './User.entity';

@Entity('gallery_visibility')
export class GalleryItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'text' })
  storage_path: string;

  @Column({ type: 'boolean', default: false })
  is_public: boolean;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  design_value: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  design_name?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  title?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  image_url?: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
