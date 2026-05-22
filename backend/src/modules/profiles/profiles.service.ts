import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Profile } from '../../entities/Profile.entity';
import { ProfileAddress } from '../../entities/ProfileAddress.entity';

@Injectable()
export class ProfilesService {
  constructor(
    @InjectRepository(Profile)
    private profilesRepository: Repository<Profile>,
    @InjectRepository(ProfileAddress)
    private addressesRepository: Repository<ProfileAddress>,
  ) {}

  async getProfile(userId: string) {
    return this.profilesRepository.findOne({
      where: { user_id: userId },
      relations: ['user'],
    });
  }

  async getPublicProfile(userId: string) {
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
      avatar_url: profile.avatar_path,
    };
  }

  async updateProfile(userId: string, dto: any) {
    const profile = await this.profilesRepository.findOne({
      where: { user_id: userId },
    });

    if (!profile) {
      throw new Error('Profile not found');
    }

    if (dto.nickname !== undefined) profile.nickname = dto.nickname;
    if (dto.bio !== undefined) profile.bio = dto.bio;
    if (dto.avatar_path !== undefined) profile.avatar_path = dto.avatar_path;
    if (dto.is_public !== undefined) profile.is_public = dto.is_public;

    return this.profilesRepository.save(profile);
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
