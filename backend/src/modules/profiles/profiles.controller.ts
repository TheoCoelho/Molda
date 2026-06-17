import { Controller, Get, Patch, Body, UseGuards, Request, Param, Post, UseInterceptors, UploadedFile, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ProfilesService } from './profiles.service';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request as ExpressRequest } from 'express';

@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  private getBaseUrl(req: ExpressRequest) {
    const protocol = req.protocol || 'http';
    const host = req.get('host') || 'localhost:3000';
    return `${protocol}://${host}`;
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  async getMe(@Request() req: any) {
    return this.profilesService.getProfile(req.user.userId, this.getBaseUrl(req));
  }

  @Patch('me')
  @UseGuards(AuthGuard('jwt'))
  async updateMe(@Body() dto: any, @Request() req: any) {
    return this.profilesService.updateProfile(req.user.userId, dto, this.getBaseUrl(req));
  }

  @Post('me/avatar')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(FileInterceptor('file'))
  async uploadMyAvatar(@UploadedFile() file: any, @Req() req: any) {
    return this.profilesService.uploadAvatar(req.user.userId, file, this.getBaseUrl(req));
  }

  @Get('public/:userId')
  async getPublicProfile(@Param('userId') userId: string, @Req() req: ExpressRequest) {
    return this.profilesService.getPublicProfile(userId, this.getBaseUrl(req));
  }
}
