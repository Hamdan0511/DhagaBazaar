import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import type { Response } from 'express';
import { config } from '../config.js';

export const SESSION_COOKIE = 'db_session';

export const hashPassword = (password: string) => bcrypt.hash(password, 12);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

interface SessionPayload {
  sub: string;
  ver: number;
}

export function signSession(userId: string, tokenVersion: number) {
  return jwt.sign({ sub: userId, ver: tokenVersion } satisfies SessionPayload, config.jwtSecret, {
    expiresIn: `${config.sessionDays}d`,
    issuer: 'dhaaga-bazaar',
  });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    const payload = jwt.verify(token, config.jwtSecret, { issuer: 'dhaaga-bazaar' }) as jwt.JwtPayload;
    if (typeof payload.sub !== 'string' || typeof payload.ver !== 'number') return null;
    return { sub: payload.sub, ver: payload.ver };
  } catch {
    return null;
  }
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax',
    maxAge: config.sessionDays * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: config.isProd, sameSite: 'lax', path: '/' });
}

export function createResetToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}
export const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
