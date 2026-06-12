import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request, Query } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DraftsService } from './drafts.service';

@Controller('drafts')
export class DraftsController {
  constructor(private readonly draftsService: DraftsService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  async getDrafts(@Request() req: any, @Query('limit') _limit?: string) {
    return this.draftsService.getUserDrafts(req.user.userId);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  async getDraft(@Param('id') id: string, @Request() req: any) {
    return this.draftsService.getDraft(id, req.user.userId);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  async createDraft(@Body() dto: any, @Request() req: any) {
    return this.draftsService.createDraft(req.user.userId, dto);
  }

  @Put(':id')
  @UseGuards(AuthGuard('jwt'))
  async updateDraft(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    return this.draftsService.updateDraft(id, req.user.userId, dto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  async deleteDraft(@Param('id') id: string, @Request() req: any) {
    return this.draftsService.deleteDraft(id, req.user.userId);
  }
}
