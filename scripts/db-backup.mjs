#!/usr/bin/env node
/**
 * Backup: PostgreSQL logical dump (custom format) + a copy of the uploads folder.
 * Read-only against the database. Output goes to ./backups/<timestamp>/.
 *
 *   node scripts/db-backup.mjs                 # uses DATABASE_URL, or server/.env
 *   node scripts/db-backup.mjs --no-uploads
 *
 * In production prefer your provider's automated backups + point-in-time recovery,
 * and run this as an additional off-site logical backup (e.g. nightly via cron),
 * copying ./backups to separate storage.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pgTool, readDatabaseUrl } from './pg-tools.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = new URL(readDatabaseUrl(root));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.join(root, 'backups', stamp);
mkdirSync(outDir, { recursive: true });
const dbName = url.pathname.slice(1);
const dumpFile = path.join(outDir, `${dbName}.dump`);
const env = { ...process.env, PGPASSWORD: decodeURIComponent(url.password) };
const conn = ['-h', url.hostname, '-p', url.port || '5432', '-U', decodeURIComponent(url.username)];

execFileSync(pgTool('pg_dump'), [...conn, '-d', dbName, '-Fc', '--no-owner', '--no-privileges', '-f', dumpFile], { env, stdio: 'inherit' });
// Verify the archive is readable and count its table data entries.
const toc = execFileSync(pgTool('pg_restore'), ['--list', dumpFile], { env, encoding: 'utf8' });
const tables = toc.split('\n').filter((l) => / TABLE DATA /.test(l)).length;

let uploads = 'skipped';
const uploadDir = path.join(root, 'server', process.env.UPLOAD_DIR ?? 'uploads');
if (!process.argv.includes('--no-uploads') && existsSync(uploadDir)) {
  cpSync(uploadDir, path.join(outDir, 'uploads'), { recursive: true });
  uploads = 'copied';
}
const manifest = { createdAt: new Date().toISOString(), database: dbName, host: url.hostname, dumpBytes: statSync(dumpFile).size, tablesWithData: tables, uploads };
writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Backup written to ${outDir}`);
console.log(JSON.stringify(manifest, null, 2));
void readFileSync;
