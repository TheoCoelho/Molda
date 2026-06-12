import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Request, Query, Put, Req, HttpCode } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GalleryService } from './gallery.service';
import type { Request as ExpressRequest } from 'express';

@Controller('gallery')
export class GalleryController {
  constructor(private readonly galleryService: GalleryService) {}

  private getBaseUrl(req: ExpressRequest) {
    const protocol = req.protocol || 'http';
    const host = req.get('host') || 'localhost:3000';
    return `${protocol}://${host}`;
  }

  private async readRequestBody(req: ExpressRequest): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  }

  @Get('my-items')
  @UseGuards(AuthGuard('jwt'))
  async getMyItems(@Request() req: any, @Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : 100;
    return this.galleryService.getUserGallery(req.user.userId, parsedLimit, this.getBaseUrl(req));
  }

  @Get('public')
  async getPublicGallery(@Req() req: ExpressRequest, @Query('limit') limit?: string, @Query('userId') userId?: string) {
    return this.galleryService.getPublicGallery(limit ? parseInt(limit, 10) : 100, this.getBaseUrl(req), userId);
  }

  @Post('upload-url')
  @UseGuards(AuthGuard('jwt'))
  async getUploadUrl(@Body() dto: any, @Request() req: any) {
    return this.galleryService.createUploadTarget(req.user.userId, dto, this.getBaseUrl(req));
  }

  @Put('upload')
  @HttpCode(200)
  async uploadBinary(@Req() req: ExpressRequest, @Query('token') token?: string) {
    const uploadToken = typeof token === 'string' ? token : '';
    if (!uploadToken) {
      throw new Error('Token de upload ausente');
    }
    const body = await this.readRequestBody(req);
    return this.galleryService.uploadBinaryFromToken(uploadToken, body, req.headers['content-type']);
  }

  @Post('confirm-upload')
  @UseGuards(AuthGuard('jwt'))
  async confirmUpload(@Body() dto: any, @Request() req: any) {
    return this.galleryService.confirmUpload(req.user.userId, dto, this.getBaseUrl(req));
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  async createGalleryItem(@Body() dto: any, @Request() req: any) {
    return this.galleryService.createGalleryItem(req.user.userId, dto, this.getBaseUrl(req));
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  async updateGalleryItem(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    return this.galleryService.updateGalleryItem(id, req.user.userId, dto, this.getBaseUrl(req));
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  async deleteGalleryItem(@Param('id') id: string, @Request() req: any) {
    return this.galleryService.deleteGalleryItem(id, req.user.userId);
  }
}
