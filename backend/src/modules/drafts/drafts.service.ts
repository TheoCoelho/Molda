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

  async getUserDrafts(userId: string) {
    return this.draftsRepository.find({
      where: { user_id: userId },
      order: { updated_at: 'DESC' },
    });
  }

  async getDraft(id: string, userId: string) {
    return this.draftsRepository.findOne({
      where: { id, user_id: userId },
    });
  }

  async createDraft(userId: string, dto: any) {
    const draft = this.draftsRepository.create({
      user_id: userId,
      name: dto.name,
      data: dto.data || {},
      is_public: dto.is_public || false,
    });

    return this.draftsRepository.save(draft);
  }

  async updateDraft(id: string, userId: string, dto: any) {
    const draft = await this.draftsRepository.findOne({
      where: { id, user_id: userId },
    });

    if (!draft) {
      throw new Error('Draft not found');
    }

    if (dto.name !== undefined) draft.name = dto.name;
    if (dto.data !== undefined) draft.data = dto.data;
    if (dto.is_public !== undefined) draft.is_public = dto.is_public;

    return this.draftsRepository.save(draft);
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
