import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne } from 'typeorm';
import { Profile } from './Profile.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 255 })
  username: string;

  @Column({ type: 'text' })
  password_hash: string;

  @Column({ type: 'varchar', length: 50, default: 'active' })
  status: 'active' | 'inactive' | 'suspended';

  @Column({ type: 'varchar', length: 50, default: 'user', nullable: true })
  role?: 'admin' | 'editor' | 'viewer' | 'factory' | 'user';

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToOne(() => Profile, (profile) => profile.user, { cascade: true, eager: false })
  profile?: Profile;
}
