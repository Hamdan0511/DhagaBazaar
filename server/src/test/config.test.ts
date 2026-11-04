import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** Loads src/config.ts in a fresh process with exactly the given environment. */
function loadConfig(env: Record<string, string>) {
  const r = spawnSync(process.execPath, ['--import', 'tsx', '-e', "await import('./src/config.ts'); console.log('CONFIG_OK');"], {
    cwd: path.resolve(__dirname, '../..'),
    env: { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '', DATABASE_URL: 'postgresql://u:p@db:5432/x', ...env },
    encoding: 'utf8',
  });
  return { ok: r.status === 0 && r.stdout.includes('CONFIG_OK'), output: `${r.stdout}${r.stderr}` };
}

const prod = { NODE_ENV: 'production', JWT_SECRET: 'a'.repeat(64) };

describe('production configuration guards', () => {
  it('refuses localhost origins and http URLs in production', () => {
    const r = loadConfig({ ...prod, CLIENT_ORIGIN: 'http://localhost:8080', APP_URL: 'http://localhost:8080' });
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/CLIENT_ORIGIN must be the public https origin/);
    expect(r.output).toMatch(/APP_URL must be an https URL/);
  });

  it('ALLOW_INSECURE_LOCALHOST allows only localhost for local Docker testing', () => {
    expect(loadConfig({ ...prod, ALLOW_INSECURE_LOCALHOST: 'true', CLIENT_ORIGIN: 'http://localhost:8080', APP_URL: 'http://localhost:8080' }).ok).toBe(true);
    const remote = loadConfig({ ...prod, ALLOW_INSECURE_LOCALHOST: 'true', CLIENT_ORIGIN: 'http://shop.example.com', APP_URL: 'http://shop.example.com' });
    expect(remote.ok).toBe(false);
    expect(remote.output).toMatch(/only allows localhost origins/);
  });

  it('still enforces a strong JWT secret with ALLOW_INSECURE_LOCALHOST', () => {
    const r = loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'change-me-to-a-long-random-string-change-me', ALLOW_INSECURE_LOCALHOST: 'true', CLIENT_ORIGIN: 'http://localhost:8080', APP_URL: 'http://localhost:8080' });
    expect(r.ok).toBe(false);
    expect(r.output).toMatch(/JWT_SECRET must be a unique random value/);
  });
});
