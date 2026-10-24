import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';

export interface GoogleProfile {
  /** Google's stable account id (`sub`). Emails can change; this can't. */
  googleId: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
}

/**
 * Verifies the ID token ("credential") that Google Identity Services hands
 * the frontend after the user picks an account: signature against Google's
 * published keys, expiry, issuer, and that it was minted for *our* client ID.
 * Kept as its own provider so it can be swapped for a stub when exercising
 * the sign-in flow without a real Google account.
 */
@Injectable()
export class GoogleIdTokenVerifier {
  private readonly client = new OAuth2Client();

  constructor(private readonly configService: ConfigService) {}

  async verify(idToken: string): Promise<GoogleProfile> {
    const clientId = this.configService.get<string>('app.googleClientId');
    if (!clientId) {
      throw new ServiceUnavailableException('Google sign-in is not configured on the server');
    }

    let payload: TokenPayload | undefined;
    try {
      const ticket = await this.client.verifyIdToken({ idToken, audience: clientId });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Your Google sign-in has expired or is invalid. Please try again.');
    }

    if (!payload?.sub || !payload.email) {
      throw new UnauthorizedException('Google did not return an email address for this account');
    }
    // Accounts are matched by email, so only accept addresses Google has verified.
    if (!payload.email_verified) {
      throw new UnauthorizedException('Your Google account email address is not verified');
    }

    return {
      googleId: payload.sub,
      email: payload.email.toLowerCase(),
      fullName: payload.name?.trim() || payload.email.split('@')[0],
      avatarUrl: payload.picture ?? null,
    };
  }
}
