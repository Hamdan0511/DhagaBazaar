#!/usr/bin/env node
/**
 * Restore a backup into a NEW database. It never overwrites an existing database:
 * restore, verify, then point DATABASE_URL at the restored database to switch over.
 *
 *   node scripts/db-restore.mjs backups/<timestamp>/<db>.dump <new_database_name>
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pgTool, readDatabaseUrl } from './pg-tools.mjs';

const [dumpFile, target] = process.argv.slice(2);
if (!dumpFile || !target || !existsSync(dumpFile)) {
  console.error('Usage: node scripts/db-restore.mjs <dump-file> <new_database_name>');
  process.exit(1);
}
if (!/^[a-z_][a-z0-9_]{2,62}$/.test(target)) {
  console.error('Database name must be lowercase letters, digits and underscores.');
  process.exit(1);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = new URL(readDatabaseUrl(root));
const env = { ...process.env, PGPASSWORD: decodeURIComponent(url.password) };
const conn = ['-h', url.hostname, '-p', url.port || '5432', '-U', decodeURIComponent(url.username)];

const exists = spawnSync(pgTool('psql'), [...conn, '-d', 'postgres', '-tAc', `SELECT 1 FROM pg_database WHERE datname='${target}'`], { env, encoding: 'utf8' });
if (exists.stdout.includes('1')) {
  console.error(`Database "${target}" already exists. Refusing to overwrite — choose a new name.`);
  process.exit(1);
}
execFileSync(pgTool('createdb'), [...conn, target], { env, stdio: 'inherit' });
execFileSync(pgTool('pg_restore'), [...conn, '-d', target, '--no-owner', '--no-privileges', '--exit-on-error', dumpFile], { env, stdio: 'inherit' });
const counts = execFileSync(
  pgTool('psql'),
  [...conn, '-d', target, '-tAc', `SELECT 'users='||(SELECT count(*) FROM users)||' categories='||(SELECT count(*) FROM categories)||' products='||(SELECT count(*) FROM products)||' orders='||(SELECT count(*) FROM orders)`],
  { env, encoding: 'utf8' },
).trim();
console.log(`Restored into "${target}": ${counts}`);
console.log('To switch over, set DATABASE_URL to this database and restart the API. Restore uploads from the backup folder too.');
