import { env } from '../env';
import { createSqliteDatabase } from './sqlite';

export function createTenantRegistryDatabase() {
  return createSqliteDatabase(env.CONTROL_PLANE_DB_PATH);
}
