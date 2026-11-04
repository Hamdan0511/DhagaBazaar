import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Loads .env.test before any app module reads configuration. The per-run
 * DATABASE_URL created by global setup is kept rather than overwritten.
 */
const file = path.resolve(__dirname, '../../.env.test');
if (!existsSync(file)) throw new Error('server/.env.test is missing: copy server/.env.test.example and set the database password.');
for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (!m) continue;
  const [, key, raw] = m;
  if (key === 'DATABASE_URL' && process.env.DATABASE_URL?.includes('dhaaga_test_run_')) continue;
  process.env[key] = raw.replace(/^"|"$/g, '');
}
// Automated tests must never reach the real (paid) Gemini API. Prisma would otherwise load
// server/.env (with the real key) into the environment; dotenv does not override a set value.
process.env.GEMINI_API_KEY = '';
if (!process.env.DATABASE_URL?.includes('dhaaga_test_run_')) {
  throw new Error('Tests must run against the throwaway database created by global setup.');
}
