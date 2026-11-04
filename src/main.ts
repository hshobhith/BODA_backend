import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';
import * as fs from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);

  // Behind a reverse proxy (Caddy/Nginx/Render) every request arrives from the
  // proxy's IP; trusting one hop makes req.ip the real client again, which the
  // rate limiter keys on. Leave off when the API is exposed directly, or
  // clients could spoof X-Forwarded-For.
  if (configService.get<boolean>('app.trustProxy')) {
    app.set('trust proxy', 1);
  }

  // Close DB/Redis/socket connections cleanly on `docker stop` (SIGTERM).
  app.enableShutdownHooks();

  app.use(helmet());
  app.use(compression());

  const corsOrigins = configService.get<string[]>('app.corsOrigins') ?? ['*'];
  app.enableCors({ origin: corsOrigins, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const apiPrefix = configService.get<string>('app.apiPrefix') ?? 'api/v1';
  app.setGlobalPrefix(apiPrefix);

  const uploadDir = configService.get<string>('app.uploadDir') ?? './uploads';
  const uploadPath = join(process.cwd(), uploadDir);
  if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
  }
  app.useStaticAssets(uploadPath, { prefix: '/uploads' });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('BODA API')
    .setDescription('BODA — Multi-Vendor Local Commerce & Delivery Platform API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = configService.get<number>('app.port') ?? 4000;
  await app.listen(port);
}

bootstrap();
