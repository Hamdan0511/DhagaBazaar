import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';
import { config } from '../config.js';

/**
 * Rate limits. These use the in-memory store, which is correct for a single
 * API instance. When running more than one instance, plug a shared store
 * (e.g. rate-limit-redis) into each limiter.
 */
const tooMany = (message: string) => ({ error: { code: 'RATE_LIMITED', message } });
const isTest = config.env === 'test';
const userOrIp = (req: Request) => (req.user ? `u:${req.user.id}` : `ip:${ipKeyGenerator(req.ip ?? '')}`);

/** Whole-API ceiling per client IP. */
export const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: config.rateLimitApi,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooMany('Too many requests. Please slow down and try again shortly.'),
});

/** Registration / reset / login attempts per IP. */
export const authIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.authAttemptsPerIp,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooMany('Too many attempts. Please wait a few minutes and try again.'),
});

/** Failed sign-ins per account from any IP — blocks distributed password guessing. */
export const loginAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.loginFailuresPerAccount,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `login:${String(req.body?.email ?? '').trim().toLowerCase()}`,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooMany('Too many failed sign-in attempts for this account. Please wait 15 minutes or reset your password.'),
});

/** File uploads per user. */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: isTest ? 1000 : 120,
  keyGenerator: userOrIp,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooMany('Upload limit reached. Please try again later.'),
});

/** Enquiries, complaints and similar messages per user. */
export const messageLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: isTest ? 1000 : 30,
  keyGenerator: userOrIp,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooMany('You have sent a lot of messages recently. Please try again later.'),
});

/** Dhaaga Bazaar AI analysis/generation requests per user (cost protection on top of the daily caps). */
export const aiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: isTest ? 1000 : 20,
  keyGenerator: userOrIp,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooMany('Too many AI requests in a short time. Please wait a few minutes and try again.'),
});
