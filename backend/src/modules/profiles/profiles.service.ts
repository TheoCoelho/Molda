import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Profile } from '../../entities/Profile.entity';
import { ProfileAddress } from '../../entities/ProfileAddress.entity';
import { mkdir, writeFile } from 'fs/promises';
import { basename, extname, join, resolve } from 'path';

type UploadedFileLike = {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
};

@Injectable()
export class ProfilesService {
  private readonly storageRoot = resolve(process.cwd(), 'storage');

  constructor(
    @InjectRepository(Profile)
    private profilesRepository: Repository<Profile>,
    @InjectRepository(ProfileAddress)
    private addressesRepository: Repository<ProfileAddress>,
  ) {}

  private toPublicUrl(baseUrl: string, value?: string | null) {
    if (!value) return null;
    if (/^https?:\/\//i.test(value)) return value;
    const normalized = value.startsWith('/') ? value : `/${value}`;
    return `${baseUrl}${normalized}`;
  }

  private serializeOwnProfile(profile: Profile, baseUrl: string) {
    return {
      ...profile,
      avatar_path: this.toPublicUrl(baseUrl, profile.avatar_path ?? null),
    };
  }

  async getProfile(userId: string, baseUrl: string) {
    const profile = await this.profilesRepository.findOne({
      where: { user_id: userId },
      relations: ['user'],
    });

    if (!profile) return null;
    return this.serializeOwnProfile(profile, baseUrl);
  }

  async getPublicProfile(userId: string, baseUrl: string) {
    const profile = await this.profilesRepository.findOne({
      where: { user_id: userId, is_public: true },
    });

    if (!profile) {
      throw new Error('Profile not found or not public');
    }

    return {
      user_id: profile.user_id,
      username: profile.username,
      nickname: profile.nickname,
      avatar_url: this.toPublicUrl(baseUrl, profile.avatar_path ?? null),
    };
  }

  async updateProfile(userId: string, dto: any, baseUrl: string) {
    const profile = await this.profilesRepository.findOne({
      where: { user_id: userId },
    });

    if (!profile) {
      throw new Error('Profile not found');
    }

    if (dto.nickname !== undefined) profile.nickname = dto.nickname;
    if (dto.username !== undefined) profile.username = dto.username;
    if (dto.bio !== undefined) profile.bio = dto.bio;
    if (dto.avatar_path !== undefined) profile.avatar_path = dto.avatar_path;
    if (dto.is_public !== undefined) profile.is_public = dto.is_public;

    const saved = await this.profilesRepository.save(profile);
    return this.serializeOwnProfile(saved, baseUrl);
  }

  async uploadAvatar(userId: string, file: UploadedFileLike, baseUrl: string) {
    const profile = await this.profilesRepository.findOne({
      where: { user_id: userId },
    });

    if (!profile) {
      throw new Error('Profile not found');
    }

    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new Error('Arquivo de avatar invalido');
    }

    const ext = extname(file.originalname || '').toLowerCase() || '.png';
    const safeBase = basename(file.originalname || 'avatar', ext).replace(/[^a-zA-Z0-9_-]/g, '_') || 'avatar';
    const relativePath = `avatars/${userId}/${Date.now()}-${safeBase}${ext}`;
    const fullPath = join(this.storageRoot, relativePath);

    await mkdir(join(fullPath, '..'), { recursive: true });
    await writeFile(fullPath, file.buffer);

    profile.avatar_path = `/storage/${relativePath}`;
    const saved = await this.profilesRepository.save(profile);
    return {
      avatar_path: this.toPublicUrl(baseUrl, saved.avatar_path),
      profile: this.serializeOwnProfile(saved, baseUrl),
    };
  }

  async getAddresses(userId: string) {
    return this.addressesRepository.find({
      where: { user_id: userId },
    });
  }

  async createAddress(userId: string, dto: any) {
    const address = this.addressesRepository.create({
      user_id: userId,
      ...dto,
    });

    return this.addressesRepository.save(address);
  }
}
