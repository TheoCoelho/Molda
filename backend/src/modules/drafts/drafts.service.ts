import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProjectDraft } from '../../entities/ProjectDraft.entity';

@Injectable()
export class DraftsService {
  constructor(
    @InjectRepository(ProjectDraft)
    private draftsRepository: Repository<ProjectDraft>,
  ) {}

  private toIso(value?: Date | null) {
    if (!value) return null;
    return value.toISOString();
  }

  private resolveDraftData(dto: any): Record<string, unknown> {
    const data = dto?.designData ?? dto?.design_data ?? dto?.data;
    if (!data || typeof data !== 'object') return {};
    return data as Record<string, unknown>;
  }

  private resolveIsPublic(dto: any, fallback: boolean) {
    if (typeof dto?.is_public === 'boolean') return dto.is_public;
    if (typeof dto?.isPublic === 'boolean') return dto.isPublic;
    return fallback;
  }

  private resolveName(dto: any, fallback?: string | null) {
    if (typeof dto?.name === 'string' && dto.name.trim().length) return dto.name.trim();
    if (typeof dto?.title === 'string' && dto.title.trim().length) return dto.title.trim();
    if (fallback && fallback.trim().length) return fallback;
    return 'Untitled draft';
  }

  private resolveExpiresAt(data: Record<string, unknown>, dto: any): Date | null {
    const raw = data.ephemeralExpiresAt ?? dto?.expires_at ?? null;
    if (!raw || typeof raw !== 'string') return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private normalizeSavedDraft(saved: ProjectDraft | ProjectDraft[]): ProjectDraft {
    return Array.isArray(saved) ? saved[0] : saved;
  }

  private toVersion(updatedAt?: Date | null): number {
    if (!updatedAt) return 1;
    return Math.max(1, Math.floor(updatedAt.getTime() / 1000));
  }

  private toApiDraft(draft: ProjectDraft) {
    const data = (draft.data ?? {}) as Record<string, unknown>;
    const projectKey = String(data.projectKey ?? data.draftKey ?? draft.id);

    return {
      id: draft.id,
      name: draft.name ?? null,
      status: 'draft',
      is_public: draft.is_public,
      project_key: projectKey,
      version: this.toVersion(draft.updated_at),
      created_at: this.toIso(draft.created_at),
      updated_at: this.toIso(draft.updated_at),
      expires_at: this.toIso(draft.expires_at ?? null),
      data,
      design_data: data,
    };
  }

  async getUserDrafts(userId: string) {
    const items = await this.draftsRepository.find({
      where: { user_id: userId },
      order: { updated_at: 'DESC' },
    });

    return { items: items.map((draft) => this.toApiDraft(draft)) };
  }

  async getDraft(id: string, userId: string) {
    const draft = await this.draftsRepository.findOne({
      where: { id, user_id: userId },
    });

    if (!draft) {
      return null;
    }

    return this.toApiDraft(draft);
  }

  async createDraft(userId: string, dto: any) {
    const data = this.resolveDraftData(dto);
    const draft = this.draftsRepository.create({
      user_id: userId,
      name: this.resolveName(dto),
      data,
      is_public: this.resolveIsPublic(dto, false),
      expires_at: this.resolveExpiresAt(data, dto) ?? undefined,
    });

    const saved = this.normalizeSavedDraft(await this.draftsRepository.save(draft));
    return this.toApiDraft(saved);
  }

  async updateDraft(id: string, userId: string, dto: any) {
    let draft = await this.draftsRepository.findOne({
      where: { id, user_id: userId },
    });

    const incomingData = this.resolveDraftData(dto);

    if (!draft) {
      const created = this.draftsRepository.create({
        id,
        user_id: userId,
        name: this.resolveName(dto),
        data: incomingData,
        is_public: this.resolveIsPublic(dto, false),
        expires_at: this.resolveExpiresAt(incomingData, dto) ?? undefined,
      });

      const savedCreated = this.normalizeSavedDraft(await this.draftsRepository.save(created));
      return {
        id: savedCreated.id,
        version: this.toVersion(savedCreated.updated_at),
        status: 'draft',
      };
    }

    draft.name = this.resolveName(dto, draft.name);
    if (Object.keys(incomingData).length > 0) {
      draft.data = incomingData;
    }
    draft.is_public = this.resolveIsPublic(dto, draft.is_public);
    draft.expires_at = this.resolveExpiresAt((draft.data ?? {}) as Record<string, unknown>, dto) ?? undefined;

    draft = await this.draftsRepository.save(draft);

    return {
      id: draft.id,
      version: this.toVersion(draft.updated_at),
      status: 'draft',
    };
  }

  async deleteDraft(id: string, userId: string) {
    const draft = await this.draftsRepository.findOne({
      where: { id, user_id: userId },
    });

    if (!draft) {
      throw new Error('Draft not found');
    }

    await this.draftsRepository.remove(draft);
    return { success: true };
  }
}
