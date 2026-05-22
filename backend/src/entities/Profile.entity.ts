import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn } from 'typeorm';
import { User } from './User.entity';

@Entity('profiles')
export class Profile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  user_id: string;

  @Column({ type: 'varchar', length: 255 })
  nickname: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  username: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email?: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone?: string;

  @Column({ type: 'date', nullable: true })
  birth_date?: Date;

  @Column({ type: 'varchar', length: 14, nullable: true })
  cpf?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  role?: 'admin' | 'editor' | 'viewer' | 'factory';

  @Column({ type: 'text', nullable: true })
  avatar_path?: string;

  @Column({ type: 'text', nullable: true })
  bio?: string;

  @Column({ type: 'boolean', default: false })
  is_public: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToOne(() => User, (user) => user.profile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
