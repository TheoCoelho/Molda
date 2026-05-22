import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { User } from '../../entities/User.entity';
import { RefreshToken } from '../../entities/RefreshToken.entity';
import { Profile } from '../../entities/Profile.entity';
import { SignUpDto } from './dtos/sign-up.dto';
import { SignInDto } from './dtos/sign-in.dto';
import { CheckAvailabilityDto } from './dtos/check-availability.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private refreshTokensRepository: Repository<RefreshToken>,
    @InjectRepository(Profile)
    private profilesRepository: Repository<Profile>,
    private jwtService: JwtService,
  ) {}

  async signUp(dto: SignUpDto) {
    const existingUser = await this.usersRepository.findOne({
      where: [{ email: dto.email }, { username: dto.username }],
    });

    if (existingUser) {
      throw new Error('User already registered with this email or username');
    }

    const existingProfile = await this.profilesRepository.findOne({
      where: [{ username: dto.username }, { cpf: dto.cpf }],
    });

    if (existingProfile) {
      throw new Error('Username or CPF already taken');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = this.usersRepository.create({
      email: dto.email,
      username: dto.username,
      password_hash: passwordHash,
      status: 'active',
      role: 'user',
    });

    const savedUser = await this.usersRepository.save(user);

    const profile = this.profilesRepository.create({
      user_id: savedUser.id,
      username: dto.username,
      nickname: dto.nickname || dto.username,
      email: dto.email,
      phone: dto.phone,
      birth_date: dto.birth_date ? new Date(dto.birth_date) : undefined,
      cpf: dto.cpf,
      is_public: false,
    });

    await this.profilesRepository.save(profile);

    const { accessToken, refreshToken } = await this.generateTokens(savedUser);

    return {
      user: {
        id: savedUser.id,
        email: savedUser.email,
        username: savedUser.username,
        role: savedUser.role,
        status: savedUser.status,
        createdAt: savedUser.created_at,
        updatedAt: savedUser.updated_at,
      },
      accessToken,
      refreshToken,
    };
  }

  async signIn(dto: SignInDto) {
    const user = await this.usersRepository.findOne({
      where: { email: dto.email },
    });

    if (!user) {
      throw new Error('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.password_hash);
    if (!passwordValid) {
      throw new Error('Invalid credentials');
    }

    const { accessToken, refreshToken } = await this.generateTokens(user);

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        status: user.status,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      },
      accessToken,
      refreshToken,
    };
  }

  async checkAvailability(dto: CheckAvailabilityDto) {
    const result = {
      email_taken: false,
      username_taken: false,
      cpf_taken: false,
      phone_taken: false,
    };

    if (dto.email) {
      const user = await this.usersRepository.findOne({
        where: { email: dto.email },
      });
      result.email_taken = !!user;
    }

    if (dto.username) {
      const profile = await this.profilesRepository.findOne({
        where: { username: dto.username },
      });
      result.username_taken = !!profile;
    }

    if (dto.cpf) {
      const profile = await this.profilesRepository.findOne({
        where: { cpf: dto.cpf },
      });
      result.cpf_taken = !!profile;
    }

    if (dto.phone) {
      const profile = await this.profilesRepository.findOne({
        where: { phone: dto.phone },
      });
      result.phone_taken = !!profile;
    }

    return result;
  }

  async refresh(refreshTokenValue: string) {
    const refreshTokenRecord = await this.refreshTokensRepository.findOne({
      where: { token_hash: refreshTokenValue },
      relations: ['user'],
    });

    if (!refreshTokenRecord || refreshTokenRecord.expires_at < new Date()) {
      throw new Error('Invalid or expired refresh token');
    }

    const user = await this.usersRepository.findOne({
      where: { id: refreshTokenRecord.user_id },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const { accessToken, refreshToken } = await this.generateTokens(user);

    await this.refreshTokensRepository.remove(refreshTokenRecord);

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        status: user.status,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      },
      accessToken,
      refreshToken,
    };
  }

  async signOut(refreshTokenValue: string) {
    await this.refreshTokensRepository.delete({
      token_hash: refreshTokenValue,
    });
  }

  private async generateTokens(user: User) {
    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
    });

    const refreshTokenHash = await bcrypt.hash(accessToken + user.id + Date.now(), 10);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const refreshToken = this.refreshTokensRepository.create({
      user_id: user.id,
      token_hash: refreshTokenHash,
      expires_at: expiresAt,
    });

    await this.refreshTokensRepository.save(refreshToken);

    return { accessToken, refreshToken: refreshTokenHash };
  }
}
