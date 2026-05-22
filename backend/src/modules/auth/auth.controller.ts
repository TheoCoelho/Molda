import { Controller, Post, Body, HttpException, HttpStatus, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignUpDto } from './dtos/sign-up.dto';
import { SignInDto } from './dtos/sign-in.dto';
import { CheckAvailabilityDto } from './dtos/check-availability.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('sign-up')
  async signUp(@Body() dto: SignUpDto) {
    try {
      return await this.authService.signUp(dto);
    } catch (error: any) {
      if (error.message.includes('already registered')) {
        throw new HttpException('User already registered', HttpStatus.CONFLICT);
      }
      if (error.message.includes('unique')) {
        throw new HttpException('Email, username, or CPF already taken', HttpStatus.CONFLICT);
      }
      throw new HttpException(error.message || 'Sign up failed', HttpStatus.BAD_REQUEST);
    }
  }

  @Post('sign-in')
  async signIn(@Body() dto: SignInDto) {
    try {
      return await this.authService.signIn(dto);
    } catch (error: any) {
      throw new HttpException(error.message || 'Sign in failed', HttpStatus.UNAUTHORIZED);
    }
  }

  @Post('check-availability')
  async checkAvailability(@Body() dto: CheckAvailabilityDto) {
    try {
      return await this.authService.checkAvailability(dto);
    } catch (error: any) {
      throw new HttpException(error.message || 'Check failed', HttpStatus.BAD_REQUEST);
    }
  }

  @Post('refresh')
  async refresh(@Body('refreshToken') refreshToken: string) {
    try {
      return await this.authService.refresh(refreshToken);
    } catch (error: any) {
      throw new HttpException('Invalid or expired refresh token', HttpStatus.UNAUTHORIZED);
    }
  }

  @Post('sign-out')
  async signOut(@Body() body: { refreshToken: string }) {
    try {
      await this.authService.signOut(body.refreshToken);
      return { success: true };
    } catch (error: any) {
      return { success: false };
    }
  }
}
