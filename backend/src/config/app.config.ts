import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),
  apiPrefix: process.env.API_PREFIX || 'api/v1',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  storageDriver: (process.env.STORAGE_DRIVER || 'local') as 'local' | 's3',
  throttleTtl: parseInt(process.env.THROTTLE_TTL || '60', 10),
  throttleLimit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
  supportEmail: process.env.SUPPORT_EMAIL || 'support@boda.local',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  // Barcode lookup fallback for sellers adding products (free, no API key).
  // Open Food Facts asks every client to identify itself with a User-Agent.
  openFoodFactsBaseUrl: process.env.OPEN_FOOD_FACTS_BASE_URL || 'https://world.openfoodfacts.org',
  openFoodFactsUserAgent:
    process.env.OPEN_FOOD_FACTS_USER_AGENT || 'BODA/1.0 (support@boda.local)',
  seedAdminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@boda.local',
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!',
  s3: {
    endpoint: process.env.S3_ENDPOINT || undefined,
    region: process.env.S3_REGION || 'us-east-1',
    bucket: process.env.S3_BUCKET || 'boda-uploads',
    accessKeyId: process.env.S3_ACCESS_KEY_ID || undefined,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || undefined,
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE || 'true') === 'true',
    publicUrl: process.env.S3_PUBLIC_URL || undefined,
  },
}));
