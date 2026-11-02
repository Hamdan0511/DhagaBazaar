import crypto from 'node:crypto';
import type { RequestHandler } from 'express';
import { config } from '../config.js';

type Level = 'debug' | 'info' | 'warn' | 'error';

/**
 * Minimal structured logger: one JSON object per line in production (easy to
 * ship to any log platform), readable lines in development, silent in tests.
 */
export function log(level: Level, msg: string, fields: Record<string, unknown> = {}) {
  if (config.env === 'test' && level !== 'error') return;
  if (config.isProd) {
    const line = JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields });
    (level === 'error' || level === 'warn' ? process.stderr : process.stdout).write(line + '\n');
  } else {
    const extra = Object.keys(fields).length ? ` ${JSON.stringify(fields)}` : '';
    (level === 'error' ? console.error : level === 'warn' ? console.warn : console.info)(`[${level}] ${msg}${extra}`);
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

/** Assigns a request id (echoed as X-Request-Id) and logs each API request on completion. */
export const requestLogger: RequestHandler = (req, res, next) => {
  const incoming = req.get('x-request-id');
  req.id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const fullPath = req.originalUrl.split('?')[0];
    if (fullPath === '/api/health') return;
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const level: Level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    // Never log bodies, cookies or query strings that may contain tokens.
    log(level, 'request', { id: req.id, method: req.method, path: fullPath, status: res.statusCode, ms: Math.round(ms), user: req.user?.id });
  });
  next();
};
