import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

/**
 * Creates a brand-new, uniquely named throwaway database for this test run,
 * applies migrations (non-destructive `migrate deploy`), seeds the taxonomy,
 * and drops ONLY that database afterwards. Development data is never touched.
 */
export default async function setup() {
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  const file = path.resolve(__dirname, '../../.env.test');
  if (!existsSync(file)) throw new Error('server/.env.test is missing: copy server/.env.test.example and set the database password.');
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  const baseUrl = new URL(env.DATABASE_URL);
  const dbName = `dhaaga_test_run_${Date.now()}`;
  const runUrl = new URL(baseUrl);
  runUrl.pathname = `/${dbName}`;
  const adminUrl = new URL(baseUrl);
  adminUrl.pathname = '/postgres';
  adminUrl.search = '';

  const admin = new PrismaClient({ datasourceUrl: adminUrl.toString() });
  await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);

  process.env.DATABASE_URL = runUrl.toString();
  const childEnv = { ...env, DATABASE_URL: runUrl.toString() };
  const cwd = path.resolve(__dirname, '../..');
  execSync('npx prisma migrate deploy', { cwd, env: childEnv, stdio: 'pipe' });
  execSync('npx tsx prisma/seed.ts', { cwd, env: { ...childEnv, ADMIN_EMAIL: 'admin@test.local', ADMIN_PASSWORD: 'Admin-test-password-1' }, stdio: 'pipe' });

  return async () => {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await admin.$disconnect();
  };
}
