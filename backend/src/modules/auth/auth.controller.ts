import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { ClassSerializerInterceptor } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { GoogleRegisterDto } from './dto/google-register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

@ApiTags('auth')
@UseInterceptors(ClassSerializerInterceptor)
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new customer or seller account' })
  @ApiResponse({ status: 201, description: 'Account created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('google')
  @ApiOperation({
    summary: 'Sign in with a Google ID token',
    description:
      'Existing account: returns { isNewUser: false, user, tokens }. Unknown Google account: returns ' +
      '{ isNewUser: true, profile } and no session — finish with POST /auth/google/register.',
  })
  @ApiResponse({ status: 200, description: 'Signed in, or registration required' })
  @ApiResponse({ status: 401, description: 'Invalid/expired Google token or unverified Google email' })
  @ApiResponse({ status: 403, description: 'Account suspended' })
  @ApiResponse({ status: 503, description: 'GOOGLE_CLIENT_ID is not configured' })
  async google(@Body() dto: GoogleAuthDto) {
    return this.authService.googleSignIn(dto.idToken);
  }

  @Public()
  @Post('google/register')
  @ApiOperation({ summary: 'Create an account for a first-time Google sign-in' })
  @ApiResponse({ status: 201, description: 'Account created and signed in' })
  @ApiResponse({ status: 401, description: 'Invalid/expired Google token or unverified Google email' })
  @ApiResponse({ status: 409, description: 'An account already exists for this Google account' })
  async googleRegister(@Body() dto: GoogleRegisterDto) {
    return this.authService.googleRegister(dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  @ApiOperation({ summary: 'Exchange a refresh token for a new token pair' })
  @ApiResponse({ status: 200, description: 'New token pair issued' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  @ApiOperation({ summary: 'Revoke a refresh token' })
  @ApiResponse({ status: 200, description: 'Logged out' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async logout(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: RefreshTokenDto,
  ) {
    await this.authService.logout(user.id, dto.refreshToken);
    return { message: 'Logged out successfully' };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  @ApiOperation({ summary: 'Request a password reset link' })
  @ApiResponse({ status: 200, description: 'Reset link sent if the email exists' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto);
    return { message: 'If that email exists, a reset link has been sent' };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password using a reset token' })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto);
    return { message: 'Password reset successfully' };
  }

  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @Post('change-password')
  @ApiOperation({ summary: 'Change password while authenticated' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({ status: 400, description: 'Current password is incorrect' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async changePassword(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.authService.changePassword(user.id, dto);
    return { message: 'Password changed successfully' };
  }

  @Roles(Role.CUSTOMER)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @Post('become-seller')
  @ApiOperation({ summary: 'Self-service upgrade from customer to seller' })
  @ApiResponse({ status: 200, description: 'Role upgraded; a fresh token pair is issued' })
  @ApiResponse({ status: 403, description: 'Only customer accounts can self-upgrade' })
  async becomeSeller(@CurrentUser() user: CurrentUserPayload) {
    return this.authService.becomeSeller(user.id);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('verify-email')
  @ApiOperation({ summary: 'Verify email address using a verification token' })
  @ApiResponse({ status: 200, description: 'Email verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    await this.authService.verifyEmail(dto);
    return { message: 'Email verified successfully' };
  }

  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @Post('resend-verification')
  @ApiOperation({ summary: 'Resend the email verification link' })
  @ApiResponse({ status: 200, description: 'Verification email resent' })
  @ApiResponse({ status: 400, description: 'Email already verified' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async resendVerification(@CurrentUser() user: CurrentUserPayload) {
    await this.authService.resendVerification(user.id);
    return { message: 'Verification email resent' };
  }
}
