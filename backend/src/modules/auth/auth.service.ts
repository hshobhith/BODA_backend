import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { nanoid } from 'nanoid';
import { IsNull, QueryFailedError, Repository } from 'typeorm';
import { Role } from '../../common/enums/role.enum';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { GoogleRegisterDto } from './dto/google-register.dto';
import { RefreshToken } from './entities/refresh-token.entity';
import { User, UserStatus } from './entities/user.entity';
import { GoogleIdTokenVerifier, GoogleProfile } from './google-id-token.verifier';

const BCRYPT_SALT_ROUNDS = 10;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DELETED_ACCOUNT_MESSAGE = 'This account has been deleted. Please contact support if you think this is a mistake.';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Result of POST /auth/google. A Google account with no BODA account yet gets
 * `isNewUser: true` plus what Google told us, and no session — the frontend
 * then collects the remaining sign-up details and calls POST /auth/google/register.
 */
export type GoogleSignInResult =
  | { isNewUser: false; user: Partial<User>; tokens: TokenPair }
  | { isNewUser: true; profile: Pick<GoogleProfile, 'email' | 'fullName' | 'avatarUrl'> };

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokensRepository: Repository<RefreshToken>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    private readonly googleVerifier: GoogleIdTokenVerifier,
  ) {}

  private stripSensitive(user: User): Omit<
    User,
    | 'passwordHash'
    | 'googleId'
    | 'passwordResetTokenHash'
    | 'passwordResetExpiresAt'
    | 'emailVerificationTokenHash'
    | 'emailVerificationExpiresAt'
  > {
    const {
      passwordHash,
      googleId,
      passwordResetTokenHash,
      passwordResetExpiresAt,
      emailVerificationTokenHash,
      emailVerificationExpiresAt,
      ...safe
    } = user;
    return safe;
  }

  private async issueTokenPair(user: User): Promise<TokenPair> {
    const accessToken = this.jwtService.sign(
      { sub: user.id, email: user.email, role: user.role },
      {
        secret: this.configService.get<string>('jwt.accessSecret'),
        expiresIn: this.configService.get<string>('jwt.accessExpiresIn') as any,
      },
    );

    const rawRefreshToken = nanoid(48);
    const expiresAt = this.parseExpiryToDate(
      this.configService.get<string>('jwt.refreshExpiresIn') ?? '7d',
    );

    const refreshTokenEntity = this.refreshTokensRepository.create({
      userId: user.id,
      tokenHash: hashToken(rawRefreshToken),
      expiresAt,
    });
    await this.refreshTokensRepository.save(refreshTokenEntity);

    return { accessToken, refreshToken: rawRefreshToken };
  }

  private parseExpiryToDate(expiresIn: string): Date {
    const match = /^(\d+)([smhd])$/.exec(expiresIn.trim());
    const now = Date.now();
    if (!match) {
      // fallback: treat as seconds
      const seconds = parseInt(expiresIn, 10) || 7 * 24 * 60 * 60;
      return new Date(now + seconds * 1000);
    }
    const value = parseInt(match[1], 10);
    const unitMs: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };
    return new Date(now + value * unitMs[match[2]]);
  }

  async register(dto: RegisterDto): Promise<{ user: Partial<User>; tokens: TokenPair }> {
    const existing = await this.usersRepository.findOne({
      where: { email: dto.email },
      withDeleted: true,
    });
    if (existing?.deletedAt) {
      throw new ForbiddenException(DELETED_ACCOUNT_MESSAGE);
    }
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);

    const user = this.usersRepository.create({
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
      phone: dto.phone,
      role: dto.role === Role.SELLER ? Role.SELLER : Role.CUSTOMER,
    });

    const savedUser = await this.usersRepository.save(user);

    await this.sendVerificationEmail(savedUser);

    const tokens = await this.issueTokenPair(savedUser);
    return { user: this.stripSensitive(savedUser), tokens };
  }

  /**
   * Self-service customer -> seller upgrade. Deliberately one-directional
   * and customer-only (enforced by `@Roles(Role.CUSTOMER)` at the
   * controller) — upgrading to admin is a privilege escalation and stays an
   * admin-only action (see AdminService.changeUserRole).
   *
   * Role is embedded in the JWT payload, so the old access token would keep
   * reporting `customer` until it expired; a fresh token pair is issued here
   * (same shape as register/login) so the frontend can swap the session in
   * immediately instead of forcing a re-login.
   */
  async becomeSeller(userId: string): Promise<{ user: Partial<User>; tokens: TokenPair }> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    user.role = Role.SELLER;
    const savedUser = await this.usersRepository.save(user);

    const tokens = await this.issueTokenPair(savedUser);
    return { user: this.stripSensitive(savedUser), tokens };
  }

  async login(dto: LoginDto): Promise<{ user: Partial<User>; tokens: TokenPair }> {
    const user = await this.usersRepository.findOne({ where: { email: dto.email } });
    // Google-only accounts have no password to check against.
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new ForbiddenException('This account has been suspended');
    }

    const tokens = await this.issueTokenPair(user);
    return { user: this.stripSensitive(user), tokens };
  }

  /**
   * Sign in with a Google ID token. Signs in an existing account (matched by
   * Google id, else by email — Google has verified the address, so a matching
   * email is the same person, and their account gets linked on first use).
   * Unknown Google accounts get `isNewUser: true` instead of a session.
   */
  async googleSignIn(idToken: string): Promise<GoogleSignInResult> {
    const profile = await this.googleVerifier.verify(idToken);
    const user = await this.findUserForGoogle(profile);

    if (!user) {
      const { email, fullName, avatarUrl } = profile;
      return { isNewUser: true, profile: { email, fullName, avatarUrl } };
    }

    if (user.deletedAt) {
      throw new ForbiddenException(DELETED_ACCOUNT_MESSAGE);
    }
    if (user.status === UserStatus.SUSPENDED) {
      throw new ForbiddenException('This account has been suspended');
    }

    if (!user.googleId || !user.emailVerifiedAt || (!user.avatarUrl && profile.avatarUrl)) {
      user.googleId = profile.googleId;
      user.emailVerifiedAt ??= new Date();
      user.avatarUrl ??= profile.avatarUrl ?? undefined;
      await this.usersRepository.save(user);
    }

    const tokens = await this.issueTokenPair(user);
    return { isNewUser: false, user: this.stripSensitive(user), tokens };
  }

  /** Create the account for a first-time Google sign-in, then sign it in. */
  async googleRegister(dto: GoogleRegisterDto): Promise<{ user: Partial<User>; tokens: TokenPair }> {
    const profile = await this.googleVerifier.verify(dto.idToken);
    const existing = await this.findUserForGoogle(profile);
    if (existing?.deletedAt) {
      throw new ForbiddenException(DELETED_ACCOUNT_MESSAGE);
    }
    if (existing) {
      throw new ConflictException('An account already exists for this Google account. Sign in instead.');
    }

    const user = this.usersRepository.create({
      email: profile.email,
      googleId: profile.googleId,
      passwordHash: null,
      fullName: dto.fullName.trim(),
      phone: dto.phone || undefined,
      avatarUrl: profile.avatarUrl ?? undefined,
      role: dto.role === Role.SELLER ? Role.SELLER : Role.CUSTOMER,
      // Google only issues tokens for addresses it has verified.
      emailVerifiedAt: new Date(),
    });

    let savedUser: User;
    try {
      savedUser = await this.usersRepository.save(user);
    } catch (error) {
      // Lost a race with a concurrent registration for the same email/Google id.
      if (error instanceof QueryFailedError && (error as QueryFailedError & { code?: string }).code === '23505') {
        throw new ConflictException('An account already exists for this Google account. Sign in instead.');
      }
      throw error;
    }

    const tokens = await this.issueTokenPair(savedUser);
    return { user: this.stripSensitive(savedUser), tokens };
  }

  /** Includes soft-deleted accounts, so callers can refuse them instead of signing up a duplicate. */
  private async findUserForGoogle(profile: GoogleProfile): Promise<User | null> {
    const byGoogleId = await this.usersRepository.findOne({
      where: { googleId: profile.googleId },
      withDeleted: true,
    });
    if (byGoogleId) {
      return byGoogleId;
    }

    const byEmail = await this.usersRepository
      .createQueryBuilder('user')
      .withDeleted()
      .where('LOWER(user.email) = :email', { email: profile.email })
      .getOne();
    // Already linked to a *different* Google account (e.g. the address was
    // deleted and re-created at Google) — don't hand that account over.
    if (byEmail?.googleId && byEmail.googleId !== profile.googleId) {
      throw new UnauthorizedException(
        'This email is linked to a different Google account. Please contact support.',
      );
    }
    return byEmail;
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const tokenHash = hashToken(refreshToken);
    const existingToken = await this.refreshTokensRepository.findOne({
      where: { tokenHash },
      relations: ['user'],
    });

    // `user` is null when the account was deleted (soft-deleted rows drop out of joins).
    if (!existingToken || existingToken.revokedAt || existingToken.expiresAt < new Date() || !existingToken.user) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    existingToken.revokedAt = new Date();
    await this.refreshTokensRepository.save(existingToken);

    return this.issueTokenPair(existingToken.user);
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    const tokenHash = hashToken(refreshToken);
    await this.refreshTokensRepository.update(
      { userId, tokenHash, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { email: dto.email } });
    // Do not reveal whether the email exists.
    if (!user) {
      return;
    }

    const rawToken = nanoid(48);
    user.passwordResetTokenHash = hashToken(rawToken);
    user.passwordResetExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await this.usersRepository.save(user);

    const frontendUrl = this.configService.get<string>('app.frontendUrl');
    const link = `${frontendUrl}/auth/reset-password?token=${rawToken}`;

    try {
      await this.mailService.send(
        user.email,
        'Reset your BODA password',
        `<p>Hi ${user.fullName},</p><p>Click the link below to reset your password. This link expires in 1 hour.</p><p><a href="${link}">${link}</a></p>`,
      );
    } catch (error) {
      this.logger.error(`Failed to send password reset email: ${(error as Error).message}`);
    }
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const tokenHash = hashToken(dto.token);
    const user = await this.usersRepository.findOne({
      where: { passwordResetTokenHash: tokenHash },
    });

    if (
      !user ||
      !user.passwordResetExpiresAt ||
      user.passwordResetExpiresAt < new Date()
    ) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    user.passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_SALT_ROUNDS);
    user.passwordResetTokenHash = null;
    user.passwordResetExpiresAt = null;
    await this.usersRepository.save(user);

    // Invalidate all existing refresh tokens for security.
    await this.refreshTokensRepository.update(
      { userId: user.id, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (!user.passwordHash) {
      throw new BadRequestException('This account signs in with Google and has no password');
    }

    const matches = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!matches) {
      throw new BadRequestException('Current password is incorrect');
    }

    user.passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_SALT_ROUNDS);
    await this.usersRepository.save(user);
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<void> {
    const tokenHash = hashToken(dto.token);
    const user = await this.usersRepository.findOne({
      where: { emailVerificationTokenHash: tokenHash },
    });

    if (
      !user ||
      !user.emailVerificationExpiresAt ||
      user.emailVerificationExpiresAt < new Date()
    ) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    user.emailVerifiedAt = new Date();
    user.emailVerificationTokenHash = null;
    user.emailVerificationExpiresAt = null;
    await this.usersRepository.save(user);
  }

  async resendVerification(userId: string): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.emailVerifiedAt) {
      throw new BadRequestException('Email is already verified');
    }

    await this.sendVerificationEmail(user);
  }

  private async sendVerificationEmail(user: User): Promise<void> {
    const rawToken = nanoid(48);
    user.emailVerificationTokenHash = hashToken(rawToken);
    user.emailVerificationExpiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);
    await this.usersRepository.save(user);

    const frontendUrl = this.configService.get<string>('app.frontendUrl');
    const link = `${frontendUrl}/auth/verify-email?token=${rawToken}`;

    try {
      await this.mailService.send(
        user.email,
        'Verify your BODA email address',
        `<p>Hi ${user.fullName},</p><p>Click the link below to verify your email. This link expires in 24 hours.</p><p><a href="${link}">${link}</a></p>`,
      );
    } catch (error) {
      this.logger.error(`Failed to send verification email: ${(error as Error).message}`);
    }
  }
}
