import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';

export type PostgresConnectionTarget = Pick<
  PostgresConnectionOptions,
  'url' | 'host' | 'port' | 'username' | 'password' | 'database' | 'ssl'
>;

/**
 * Where Postgres is and how to reach it, read straight from env. Shared by the
 * Nest app (config/database.config.ts) and the TypeORM CLI (data-source.ts, used
 * by migrations and seeds), so both always talk to the same database.
 *
 * DATABASE_URL — the single connection string cloud providers hand out — wins
 * over DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD/DB_NAME when it is set.
 */
export function postgresConnectionTarget(env: NodeJS.ProcessEnv = process.env): PostgresConnectionTarget {
  const url = env.DATABASE_URL?.trim();

  // Cloud databases expect TLS, so it defaults on with a URL and off for the
  // local host/port setup. The server certificate is verified unless
  // DB_SSL_REJECT_UNAUTHORIZED=false, for providers that sign with a private CA.
  const sslEnabled = env.DB_SSL ? env.DB_SSL === 'true' : Boolean(url);
  const ssl = sslEnabled
    ? { rejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
    : false;

  if (url) {
    return { url, ssl };
  }

  return {
    host: env.DB_HOST || 'localhost',
    port: parseInt(env.DB_PORT || '5432', 10),
    username: env.DB_USERNAME || 'boda',
    password: env.DB_PASSWORD || '',
    database: env.DB_NAME || 'boda_dev',
    ssl,
  };
}
