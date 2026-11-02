import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Locates PostgreSQL client binaries (override with PG_BIN). */
export function pgTool(name) {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  const dirs = [process.env.PG_BIN];
  if (process.platform === 'win32') for (const v of ['18', '17', '16', '15']) dirs.push(`C:/Program Files/PostgreSQL/${v}/bin`);
  else dirs.push('/usr/lib/postgresql/18/bin', '/usr/lib/postgresql/17/bin', '/usr/lib/postgresql/16/bin', '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin');
  for (const d of dirs) if (d && existsSync(path.join(d, exe))) return path.join(d, exe);
  return name;
}

/** DATABASE_URL from the environment, else from server/.env. */
export function readDatabaseUrl(root) {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envFile = path.join(root, 'server', '.env');
  if (existsSync(envFile)) {
    const m = readFileSync(envFile, 'utf8').match(/^DATABASE_URL="?([^"\r\n]+)"?/m);
    if (m) return m[1];
  }
  throw new Error('DATABASE_URL is not set (and server/.env has none).');
}
