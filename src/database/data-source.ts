import { join } from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';
import * as dotenv from 'dotenv';
import { postgresConnectionTarget } from './connection-options';

dotenv.config();

// Resolves correctly whether this file is run via ts-node from `src/` (local
// CLI: migration:generate/run) or as compiled JS from `dist/` (production
// container: migration:run:prod) since both mirror the same relative layout.
const isCompiled = __filename.endsWith('.js');
const ext = isCompiled ? 'js' : 'ts';

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  ...postgresConnectionTarget(),
  synchronize: false,
  logging: (process.env.DB_LOGGING || 'false') === 'true',
  entities: [join(__dirname, '..', '**', `*.entity.${ext}`)],
  migrations: [join(__dirname, 'migrations', `*.${ext}`)],
};

const dataSource = new DataSource(dataSourceOptions);

export default dataSource;
