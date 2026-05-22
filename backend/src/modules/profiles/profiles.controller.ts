import { Controller, Get, Patch, Body, UseGuards, Request, Param } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ProfilesService } from './profiles.service';

@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  async getMe(@Request() req: any) {
    return this.profilesService.getProfile(req.user.userId);
  }

  @Patch('me')
  @UseGuards(AuthGuard('jwt'))
  async updateMe(@Body() dto: any, @Request() req: any) {
    return this.profilesService.updateProfile(req.user.userId, dto);
  }

  @Get('public/:userId')
  async getPublicProfile(@Param('userId') userId: string) {
    return this.profilesService.getPublicProfile(userId);
  }
}
