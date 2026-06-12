import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GalleryItem } from '../../entities/GalleryItem.entity';
import { createHash, randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { extname, join, resolve } from 'path';

type PendingUpload = {
  userId: string;
  objectKey: string;
  expiresAt: number;
  contentType: string;
};

@Injectable()
export class GalleryService {
  private readonly storageRoot = resolve(process.cwd(), 'storage');
  private readonly pendingUploads = new Map<string, PendingUpload>();

  constructor(
    @InjectRepository(GalleryItem)
    private galleryRepository: Repository<GalleryItem>,
  ) {}

  private purgeExpiredUploads() {
    const now = Date.now();
    for (const [key, meta] of this.pendingUploads.entries()) {
      if (meta.expiresAt <= now) {
        this.pendingUploads.delete(key);
      }
    }
  }

  private toUrl(baseUrl: string, path: string) {
    if (/^https?:\/\//i.test(path)) return path;
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return `${baseUrl}${normalized}`;
  }

  private toImageUrl(baseUrl: string, item: GalleryItem) {
    const fallback = `/storage/${item.storage_path.replace(/^\/+/, '')}`;
    return this.toUrl(baseUrl, item.image_url || fallback);
  }

  private toClientItem(baseUrl: string, item: GalleryItem) {
    return {
      id: item.id,
      user_id: item.user_id,
      storage_path: item.storage_path,
      title: item.title ?? item.design_name ?? 'Design',
      image_url: this.toImageUrl(baseUrl, item),
      is_public: item.is_public,
      created_at: item.created_at,
      updated_at: item.updated_at,
      design_name: item.design_name,
      design_value: item.design_value,
    };
  }

  async createUploadTarget(userId: string, dto: any, baseUrl: string) {
    this.purgeExpiredUploads();

    const filename = typeof dto?.filename === 'string' && dto.filename.trim().length
      ? dto.filename.trim()
      : `${randomUUID()}.png`;
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `gallery/${userId}/${Date.now()}-${safeName}`;
    const token = createHash('sha256').update(`${key}:${randomUUID()}`).digest('hex');
    const contentType = typeof dto?.contentType === 'string' && dto.contentType.trim().length
      ? dto.contentType
      : 'application/octet-stream';

    this.pendingUploads.set(token, {
      userId,
      objectKey: key,
      expiresAt: Date.now() + 15 * 60 * 1000,
      contentType,
    });

    return {
      objectKey: key,
      uploadUrl: `${baseUrl}/gallery/upload?token=${encodeURIComponent(token)}`,
      expiresIn: 900,
    };
  }

  async uploadBinaryFromToken(token: string, bytes: Buffer, contentType?: string) {
    this.purgeExpiredUploads();
    const pending = this.pendingUploads.get(token);
    if (!pending) {
      throw new Error('Upload token invalido ou expirado');
    }

    const normalizedKey = pending.objectKey.replace(/^\/+/, '');
    const fullPath = join(this.storageRoot, normalizedKey);
    await mkdir(join(fullPath, '..'), { recursive: true });
    await writeFile(fullPath, bytes);

    this.pendingUploads.set(token, {
      ...pending,
      contentType: contentType && contentType.trim().length ? contentType : pending.contentType,
    });

    return {
      objectKey: pending.objectKey,
      contentType: pending.contentType,
      size: bytes.length,
    };
  }

  async confirmUpload(userId: string, dto: any, baseUrl: string) {
    this.purgeExpiredUploads();

    const objectKey = String(dto?.objectKey || '').trim();
    if (!objectKey) {
      throw new Error('objectKey obrigatorio');
    }

    const pending = Array.from(this.pendingUploads.values()).find(
      (entry) => entry.objectKey === objectKey,
    );

    if (!pending || pending.userId !== userId) {
      throw new Error('Upload nao encontrado para este usuario');
    }

    const item = this.galleryRepository.create({
      user_id: userId,
      storage_path: objectKey,
      title: (dto?.title && String(dto.title).trim()) || 'Design',
      image_url: `/storage/${objectKey.replace(/^\/+/, '')}`,
      design_name: (dto?.description && String(dto.description).trim()) || null,
      design_value: Number(dto?.designValue ?? 0) || 0,
      is_public: Boolean(dto?.isPublic ?? dto?.is_public ?? false),
    });

    const saved = await this.galleryRepository.save(item);
    return this.toClientItem(baseUrl, saved);
  }

  async getUserGallery(userId: string, limit = 100, baseUrl: string) {
    const items = await this.galleryRepository.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
      take: Math.min(Math.max(limit, 1), 200),
    });

    return { items: items.map((item) => this.toClientItem(baseUrl, item)) };
  }

  async getPublicGallery(limit: number, baseUrl: string, userId?: string) {
    const where: { is_public: boolean; user_id?: string } = { is_public: true };
    if (userId) where.user_id = userId;

    const items = await this.galleryRepository.find({
      where,
      order: { created_at: 'DESC' },
      take: Math.min(limit, 100),
    });

    return { items: items.map((item) => this.toClientItem(baseUrl, item)) };
  }

  async createGalleryItem(userId: string, dto: any, baseUrl: string) {
    const rawPath = String(dto.storage_path || dto.storagePath || '').trim();
    const fallbackStoragePath = rawPath || `gallery/${userId}/${Date.now()}-${randomUUID()}${extname(String(dto?.image_url || '')) || '.png'}`;
    const item = this.galleryRepository.create({
      user_id: userId,
      storage_path: fallbackStoragePath,
      title: dto.title,
      image_url: dto.image_url || `/storage/${fallbackStoragePath}`,
      design_name: dto.design_name,
      design_value: dto.design_value || 0,
      is_public: Boolean(dto.is_public ?? dto.isPublic ?? false),
    });

    const saved = await this.galleryRepository.save(item);
    return this.toClientItem(baseUrl, saved);
  }

  async updateGalleryItem(id: string, userId: string, dto: any, baseUrl: string) {
    const item = await this.galleryRepository.findOne({
      where: { id, user_id: userId },
    });

    if (!item) {
      throw new Error('Gallery item not found');
    }

    if (dto.is_public !== undefined) item.is_public = dto.is_public;
    if (dto.isPublic !== undefined) item.is_public = Boolean(dto.isPublic);
    if (dto.title !== undefined) item.title = dto.title;
    if (dto.design_name !== undefined) item.design_name = dto.design_name;

    const saved = await this.galleryRepository.save(item);
    return this.toClientItem(baseUrl, saved);
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
