import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GalleryItem } from '../../entities/GalleryItem.entity';

@Injectable()
export class GalleryService {
  constructor(
    @InjectRepository(GalleryItem)
    private galleryRepository: Repository<GalleryItem>,
  ) {}

  async getUserGallery(userId: string) {
    return this.galleryRepository.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
    });
  }

  async getPublicGallery(limit: number) {
    const items = await this.galleryRepository.find({
      where: { is_public: true },
      order: { created_at: 'DESC' },
      take: Math.min(limit, 100),
    });

    return { items };
  }

  async createGalleryItem(userId: string, dto: any) {
    const item = this.galleryRepository.create({
      user_id: userId,
      storage_path: dto.storage_path,
      title: dto.title,
      image_url: dto.image_url,
      design_name: dto.design_name,
      design_value: dto.design_value || 0,
      is_public: dto.is_public || false,
    });

    return this.galleryRepository.save(item);
  }

  async updateGalleryItem(id: string, userId: string, dto: any) {
    const item = await this.galleryRepository.findOne({
      where: { id, user_id: userId },
    });

    if (!item) {
      throw new Error('Gallery item not found');
    }

    if (dto.is_public !== undefined) item.is_public = dto.is_public;
    if (dto.title !== undefined) item.title = dto.title;
    if (dto.design_name !== undefined) item.design_name = dto.design_name;

    return this.galleryRepository.save(item);
  }

  async deleteGalleryItem(id: string, userId: string) {
    const item = await this.galleryRepository.findOne({
      where: { id, user_id: userId },
    });

    if (!item) {
      throw new Error('Gallery item not found');
    }

    await this.galleryRepository.remove(item);
    return { success: true };
  }
}
