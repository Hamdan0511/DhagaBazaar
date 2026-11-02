#!/usr/bin/env node
/**
 * Local development PostgreSQL helper.
 *
 * Creates and runs a PRIVATE PostgreSQL cluster inside ./.pgdata using the
 * PostgreSQL binaries installed on this machine. It listens on 127.0.0.1:5433
 * so it never interferes with a system-wide PostgreSQL service on 5432.
 *
 *   node scripts/dev-db.mjs init    # create cluster + database (first time)
 *   node scripts/dev-db.mjs start
 *   node scripts/dev-db.mjs stop
 *   node scripts/dev-db.mjs status
 *
 * Override binary location with PG_BIN, port with DEV_DB_PORT. The password comes from
 * DEV_DB_PASSWORD, else from DATABASE_URL (environment or server/.env).
 * Production deployments should use a managed PostgreSQL via DATABASE_URL instead.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDatabaseUrl } from './pg-tools.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, '.pgdata');
const port = process.env.DEV_DB_PORT ?? '5433';
const user = 'dhaaga';
const database = 'dhaaga_bazaar';

function findBin() {
  const candidates = [process.env.PG_BIN];
  if (process.platform === 'win32') {
    for (const v of ['18', '17', '16', '15']) candidates.push(`C:/Program Files/PostgreSQL/${v}/bin`);
  } else {
    candidates.push('/usr/lib/postgresql/18/bin', '/usr/lib/postgresql/17/bin', '/usr/lib/postgresql/16/bin', '/opt/homebrew/bin', '/usr/local/bin');
  }
  const exe = process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl';
  for (const c of candidates) if (c && existsSync(path.join(c, exe))) return c;
  return ''; // rely on PATH
}
const bin = findBin();
const tool = (name) => (bin ? path.join(bin, process.platform === 'win32' ? `${name}.exe` : name) : name);

function run(name, args, opts = {}) {
  return execFileSync(tool(name), args, { stdio: 'inherit', ...opts });
}

function isRunning() {
  return spawnSync(tool('pg_ctl'), ['status', '-D', dataDir], { stdio: 'ignore' }).status === 0;
}

function start() {
  if (isRunning()) return console.log(`PostgreSQL dev cluster already running on 127.0.0.1:${port}`);
  // stdio must be ignored: on Windows the postmaster inherits handles and would block us forever.
  run('pg_ctl', ['start', '-D', dataDir, '-w', '-l', path.join(dataDir, 'server.log'), '-o', `-p ${port} -c listen_addresses=127.0.0.1`], { stdio: 'ignore' });
  console.log(`PostgreSQL dev cluster running on 127.0.0.1:${port}`);
}

function devPassword() {
  const password = process.env.DEV_DB_PASSWORD ?? decodeURIComponent(new URL(readDatabaseUrl(root)).password);
  if (!password || password === 'CHANGE_ME') {
    console.error('Set a database password in DATABASE_URL in server/.env (or DEV_DB_PASSWORD) before `npm run db:init`.');
    process.exit(1);
  }
  return password;
}

function init() {
  const password = devPassword();
  if (existsSync(path.join(dataDir, 'PG_VERSION'))) {
    console.log('Dev cluster already initialised.');
  } else {
    const tmp = mkdtempSync(path.join(tmpdir(), 'dhaaga-pw-'));
    const pwFile = path.join(tmp, 'pw');
    writeFileSync(pwFile, password);
    try {
      run('initdb', ['-D', dataDir, '-U', user, '--pwfile', pwFile, '-A', 'scram-sha-256', '-E', 'UTF8', '--locale=C']);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
  start();
  const env = { ...process.env, PGPASSWORD: password };
  const exists = spawnSync(tool('psql'), ['-h', '127.0.0.1', '-p', port, '-U', user, '-d', 'postgres', '-tAc', `SELECT 1 FROM pg_database WHERE datname='${database}'`], { env, encoding: 'utf8' });
  if (!exists.stdout?.includes('1')) run('createdb', ['-h', '127.0.0.1', '-p', port, '-U', user, database], { env });
  console.log(`\nDATABASE_URL="postgresql://${user}:${password}@127.0.0.1:${port}/${database}?schema=public"`);
}

const cmd = process.argv[2] ?? 'status';
if (cmd === 'init') init();
else if (cmd === 'start') start();
else if (cmd === 'stop') isRunning() ? run('pg_ctl', ['stop', '-D', dataDir, '-m', 'fast']) : console.log('Not running.');
else if (cmd === 'status') console.log(isRunning() ? `Running on 127.0.0.1:${port}` : 'Not running.');
else { console.error(`Unknown command: ${cmd}`); process.exit(1); }
