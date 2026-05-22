import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectDraft } from '../../entities/ProjectDraft.entity';
import { DraftsService } from './drafts.service';
import { DraftsController } from './drafts.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ProjectDraft])],
  controllers: [DraftsController],
  providers: [DraftsService],
  exports: [DraftsService],
})
export class DraftsModule {}
