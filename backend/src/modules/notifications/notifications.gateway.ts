import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: (process.env.CORS_ORIGINS || 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    credentials: true,
  },
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  handleConnection(client: Socket) {
    const token = this.extractToken(client);

    if (!token) {
      client.emit('error', { message: 'Authentication token is required' });
      client.disconnect(true);
      return;
    }

    try {
      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret: this.configService.get<string>('jwt.accessSecret'),
      });

      if (!payload?.sub) {
        throw new Error('Invalid token payload');
      }

      client.data.userId = payload.sub;
      client.join(`user:${payload.sub}`);
      this.logger.debug(`Client ${client.id} authenticated as user ${payload.sub}`);
    } catch (error) {
      this.logger.warn(`Rejected websocket connection: ${(error as Error).message}`);
      client.emit('error', { message: 'Invalid or expired authentication token' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client ${client.id} disconnected`);
  }

  emitToUser(userId: string, event: string, payload: any) {
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  private extractToken(client: Socket): string | undefined {
    const authToken = client.handshake.auth?.token as string | undefined;
    if (authToken) {
      return authToken.startsWith('Bearer ') ? authToken.slice(7) : authToken;
    }

    const authHeader =
      (client.handshake.headers?.authorization as string | undefined) ??
      (client.handshake.headers?.Authorization as unknown as string | undefined);

    if (authHeader) {
      return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    }

    return undefined;
  }
}
