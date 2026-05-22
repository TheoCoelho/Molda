import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Request, Query } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GalleryService } from './gallery.service';

@Controller('gallery')
export class GalleryController {
  constructor(private readonly galleryService: GalleryService) {}

  @Get('my-items')
  @UseGuards(AuthGuard('jwt'))
  async getMyItems(@Request() req: any) {
    return this.galleryService.getUserGallery(req.user.userId);
  }

  @Get('public')
  async getPublicGallery(@Query('limit') limit?: string) {
    return this.galleryService.getPublicGallery(limit ? parseInt(limit) : 100);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  async createGalleryItem(@Body() dto: any, @Request() req: any) {
    return this.galleryService.createGalleryItem(req.user.userId, dto);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  async updateGalleryItem(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    return this.galleryService.updateGalleryItem(id, req.user.userId, dto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  async deleteGalleryItem(@Param('id') id: string, @Request() req: any) {
    return this.galleryService.deleteGalleryItem(id, req.user.userId);
  }
}
