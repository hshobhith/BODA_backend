import { registerAs } from '@nestjs/config';

export default registerAs('storage', () => ({
  driver: (process.env.STORAGE_DRIVER || 'local') as 'local' | 's3',
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  // Local driver only: never served statically (prescriptions are read back
  // through an ownership-checked endpoint instead).
  privateUploadDir: process.env.PRIVATE_UPLOAD_DIR || './private-uploads',
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
