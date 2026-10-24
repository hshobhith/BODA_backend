import * as Joi from 'joi';

/** The separate DB_* parts are only needed when DATABASE_URL isn't given. */
function dbPartRequiredWithoutUrl(schema: Joi.Schema): Joi.Schema {
  return schema.when('DATABASE_URL', { is: Joi.exist(), then: Joi.optional(), otherwise: Joi.required() });
}

export const validationSchema = Joi.object({
  // App
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(4000),
  API_PREFIX: Joi.string().default('api/v1'),
  FRONTEND_URL: Joi.string().uri().default('http://localhost:3000'),
  CORS_ORIGINS: Joi.string().default('http://localhost:3000'),

  // Database: either one DATABASE_URL (cloud providers) or the separate DB_* parts.
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .optional(),
  DB_HOST: dbPartRequiredWithoutUrl(Joi.string()),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: dbPartRequiredWithoutUrl(Joi.string()),
  DB_PASSWORD: dbPartRequiredWithoutUrl(Joi.string().allow('')),
  DB_NAME: dbPartRequiredWithoutUrl(Joi.string()),
  // Unset: on with DATABASE_URL, off otherwise (see database/connection-options.ts).
  DB_SSL: Joi.boolean().optional(),
  DB_SSL_REJECT_UNAUTHORIZED: Joi.boolean().default(true),
  DB_SYNCHRONIZE: Joi.boolean().default(false),
  DB_LOGGING: Joi.boolean().default(false),

  // Redis
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),

  // JWT
  JWT_ACCESS_SECRET: Joi.string().min(8).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(8).required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  // Storage
  STORAGE_DRIVER: Joi.string().valid('local', 's3').default('local'),
  UPLOAD_DIR: Joi.string().default('./uploads'),
  PRIVATE_UPLOAD_DIR: Joi.string().default('./private-uploads'),
  S3_ENDPOINT: Joi.string().allow('').optional(),
  S3_REGION: Joi.string().default('us-east-1'),
  S3_BUCKET: Joi.string().allow('').optional(),
  S3_ACCESS_KEY_ID: Joi.string().allow('').optional(),
  S3_SECRET_ACCESS_KEY: Joi.string().allow('').optional(),
  S3_FORCE_PATH_STYLE: Joi.boolean().default(true),
  S3_PUBLIC_URL: Joi.string().allow('').optional(),

  // Mail
  MAIL_HOST: Joi.string().required(),
  MAIL_PORT: Joi.number().default(1025),
  MAIL_USER: Joi.string().allow('').optional(),
  MAIL_PASSWORD: Joi.string().allow('').optional(),
  MAIL_FROM: Joi.string().default('"BODA" <no-reply@boda.local>'),
  MAIL_SECURE: Joi.boolean().default(false),
  // Inbox that receives contact-form messages (POST /contact)
  SUPPORT_EMAIL: Joi.string()
    .email({ tlds: { allow: false } })
    .default('support@boda.local'),

  // Google sign-in: OAuth 2.0 Web client ID from Google Cloud Console. Must be
  // the same ID the frontend uses (NEXT_PUBLIC_GOOGLE_CLIENT_ID). Optional so
  // the API still boots without it; POST /auth/google then answers 503.
  GOOGLE_CLIENT_ID: Joi.string().allow('').optional(),
  OPEN_FOOD_FACTS_BASE_URL: Joi.string().uri().default('https://world.openfoodfacts.org'),
  OPEN_FOOD_FACTS_USER_AGENT: Joi.string().default('BODA/1.0 (support@boda.local)'),

  // Throttle
  THROTTLE_TTL: Joi.number().default(60),
  THROTTLE_LIMIT: Joi.number().default(100),

  // Admin seed
  SEED_ADMIN_EMAIL: Joi.string()
    .email({ tlds: { allow: false } })
    .default('admin@boda.local'),
  SEED_ADMIN_PASSWORD: Joi.string().default('ChangeMe123!'),
});
