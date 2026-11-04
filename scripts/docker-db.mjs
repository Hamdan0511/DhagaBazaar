#!/usr/bin/env node
/**
 * Backup and restore for the Docker Compose stack (binary-safe on Windows, macOS and Linux).
 *
 *   node scripts/docker-db.mjs backup [outDir]
 *       pg_dump (custom format) of the live database + a tar of the uploads volume
 *       → backups/docker-<timestamp>/{database.dump, uploads.tar, manifest.json}
 *
 *   node scripts/docker-db.mjs restore <backupDir> --into <new_database> [--with-uploads]
 *       Creates <new_database> and restores the dump into it. It NEVER overwrites an existing
 *       database: if <new_database> exists, it stops. Works with Docker backups (database.dump)
 *       and native backups from `npm run db:backup` (dhaaga_bazaar.dump), which is how the
 *       current local database is moved into Docker. --with-uploads adds the backup's files to
 *       the uploads volume (existing files are kept; names are random UUIDs so they do not clash).
 *       Afterwards set POSTGRES_DB=<new_database> in .env.docker, run the migrate step and restart.
 *
 * Reads POSTGRES_USER / POSTGRES_DB from .env.docker (or ENV_FILE). Compose project: COMPOSE_PROJECT_NAME or the file's `name`.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.resolve(root, process.env.ENV_FILE ?? '.env.docker');
if (!existsSync(envFile)) fail(`${path.relative(root, envFile)} not found. Copy .env.docker.example to .env.docker first.`);
const env = Object.fromEntries(
  readFileSync(envFile, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, '')]),
);
const PGUSER = env.POSTGRES_USER || 'dhaaga';
const PGDB = env.POSTGRES_DB || 'dhaaga_bazaar';
const compose = ['compose', '--env-file', envFile, '-f', path.join(root, 'docker-compose.yml')];

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}
function docker(args, opts = {}) {
  const r = spawnSync('docker', [...compose, ...args], { encoding: 'utf8', cwd: root, ...opts });
  if (r.status !== 0) fail(`docker ${args.slice(0, 4).join(' ')} failed:\n${r.stderr || r.stdout}`);
  return r.stdout;
}
const psql = (sql, db = 'postgres') => docker(['exec', '-T', 'db', 'psql', '-U', PGUSER, '-d', db, '-v', 'ON_ERROR_STOP=1', '-tAc', sql]).trim();

/** Streams a child's stdout into a file (binary-safe). */
function streamToFile(args, file) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', [...compose, ...args], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    const out = createWriteStream(file);
    let err = '';
    child.stdout.pipe(out);
    child.stderr.on('data', (d) => (err += d));
    child.on('close', (code) => out.close(() => (code === 0 ? resolve() : reject(new Error(err || `exit ${code}`)))));
  });
}
/** Streams a file (or a producer process) into a child's stdin. */
function streamFromFile(args, source) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', [...compose, ...args], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => (err += d));
    child.stdout.on('data', () => {});
    const input = typeof source === 'string' ? createReadStream(source) : source.stdout;
    input.pipe(child.stdin);
    child.on('close', (code) => (code === 0 ? resolve(err) : reject(new Error(err || `exit ${code}`))));
  });
}

function requireDbRunning() {
  const id = docker(['ps', '-q', 'db']).trim();
  if (!id) fail('The db service is not running. Start it with: docker compose --env-file .env.docker up -d db');
}

async function backup(outDir) {
  requireDbRunning();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.resolve(root, outDir ?? path.join('backups', `docker-${stamp}`));
  mkdirSync(dir, { recursive: true });
  const dump = path.join(dir, 'database.dump');
  await streamToFile(['exec', '-T', 'db', 'pg_dump', '-U', PGUSER, '-d', PGDB, '-Fc', '--no-owner'], dump);
  // Verify the archive is readable before reporting success.
  const list = spawnSync('docker', [...compose, 'exec', '-T', 'db', 'pg_restore', '--list'], { cwd: root, input: readFileSync(dump), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (list.status !== 0) fail(`The dump could not be read back:\n${list.stderr}`);
  const tables = (list.stdout.match(/TABLE DATA/g) ?? []).length;
  // Uploads volume, read through a throwaway container that mounts it.
  const tar = path.join(dir, 'uploads.tar');
  await streamToFile(['run', '--rm', '--no-deps', '-T', '--entrypoint', 'tar', 'server', '-C', '/app/server', '-cf', '-', 'uploads'], tar);
  const counts = psql(`SELECT (SELECT count(*) FROM users)||' users, '||(SELECT count(*) FROM suppliers)||' suppliers, '||(SELECT count(*) FROM products)||' products, '||(SELECT count(*) FROM orders)||' orders'`, PGDB);
  const manifest = { createdAt: new Date().toISOString(), database: PGDB, dumpBytes: statSync(dump).size, tablesWithData: tables, uploadsTarBytes: statSync(tar).size, records: counts };
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`✓ Backup written to ${path.relative(root, dir)}`);
  console.log(JSON.stringify(manifest, null, 2));
}

async function restore(source, into, withUploads) {
  if (!source) fail('Usage: node scripts/docker-db.mjs restore <backupDir> --into <new_database> [--with-uploads]');
  if (!into || !/^[a-z_][a-z0-9_]{0,62}$/.test(into)) fail('Pass --into <new_database> (lowercase letters, digits, underscores). Restores never overwrite an existing database.');
  requireDbRunning();
  const dir = path.resolve(root, source);
  const dump = [path.join(dir, 'database.dump'), path.join(dir, 'dhaaga_bazaar.dump'), dir].find((f) => existsSync(f) && statSync(f).isFile());
  if (!dump) fail(`No database.dump or dhaaga_bazaar.dump found in ${source}`);
  if (psql(`SELECT 1 FROM pg_database WHERE datname='${into}'`)) fail(`Database "${into}" already exists. Choose a new name — existing databases are never overwritten.`);

  psql(`CREATE DATABASE "${into}" OWNER "${PGUSER}"`);
  const warnings = await streamFromFile(['exec', '-T', 'db', 'pg_restore', '-U', PGUSER, '-d', into, '--no-owner', '--no-privileges', '--exit-on-error'], dump).catch((e) => fail(`pg_restore failed (the new database "${into}" was left for inspection; drop it manually if unwanted):\n${e.message}`));
  if (warnings?.trim()) console.warn(warnings.trim());
  const counts = psql(`SELECT (SELECT count(*) FROM users)||' users, '||(SELECT count(*) FROM suppliers)||' suppliers, '||(SELECT count(*) FROM products)||' products, '||(SELECT count(*) FROM orders)||' orders'`, into);
  console.log(`✓ Restored ${path.relative(root, dump)} into new database "${into}": ${counts}`);

  if (withUploads) {
    const tarFile = path.join(dir, 'uploads.tar');
    const nativeDir = path.join(dir, 'uploads');
    const target = ['run', '--rm', '--no-deps', '-T', '--entrypoint', 'tar', 'server', '-C', '/app/server', '-xf', '-', '--no-same-owner', '--skip-old-files'];
    if (existsSync(tarFile)) {
      await streamFromFile(target, tarFile).catch((e) => fail(`Restoring uploads failed: ${e.message}`));
    } else if (existsSync(nativeDir)) {
      // Native backup: pack its uploads folder with the system tar (Windows 10+, macOS, Linux).
      const pack = spawn('tar', ['-C', dir, '-cf', '-', 'uploads'], { stdio: ['ignore', 'pipe', 'inherit'] });
      await streamFromFile(target, pack).catch((e) => fail(`Restoring uploads failed: ${e.message}`));
    } else fail('No uploads.tar or uploads/ folder in the backup.');
    console.log('✓ Uploaded files added to the uploads volume (existing files kept).');
  }
  console.log(`\nNext steps:\n  1. Set POSTGRES_DB=${into} in .env.docker\n  2. docker compose --env-file .env.docker run --rm migrate      (applies any newer migrations)\n  3. docker compose --env-file .env.docker up -d                  (restarts the API on the restored data)\nThe previous database "${PGDB}" is untouched.`);
}

const [cmd, ...rest] = process.argv.slice(2);
const flag = (name) => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
};
if (cmd === 'backup') await backup(rest[0]);
else if (cmd === 'restore') await restore(rest.find((a, i) => !a.startsWith('--') && rest[i - 1] !== '--into'), flag('--into'), rest.includes('--with-uploads'));
else fail('Usage: node scripts/docker-db.mjs backup [outDir] | restore <backupDir> --into <new_database> [--with-uploads]');
