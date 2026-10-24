import { registerAs } from '@nestjs/config';
import { postgresConnectionTarget } from '../database/connection-options';

export default registerAs('database', () => ({
  connection: postgresConnectionTarget(),
  synchronize: (process.env.DB_SYNCHRONIZE || 'false') === 'true',
  logging: (process.env.DB_LOGGING || 'false') === 'true',
}));
