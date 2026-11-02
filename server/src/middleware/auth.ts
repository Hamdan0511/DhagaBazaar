import type { RequestHandler } from 'express';
import type { Role, User } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { SESSION_COOKIE, clearSessionCookie, verifySession } from '../lib/auth.js';
import { forbidden, unauthorized } from '../lib/http.js';

export type SessionUser = Pick<User, 'id' | 'email' | 'fullName' | 'role' | 'businessType' | 'phone'> & {
  retailerId: string | null;
  supplierId: string | null;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

/** Attaches req.user if a valid session cookie is present. Never rejects. */
export const loadUser: RequestHandler = async (req, res, next) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return next();
  const payload = verifySession(token);
  if (!payload) {
    clearSessionCookie(res);
    return next();
  }
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: { retailer: { select: { id: true } }, supplier: { select: { id: true } } },
  });
  if (!user || !user.isActive || user.tokenVersion !== payload.ver) {
    clearSessionCookie(res);
    return next();
  }
  req.user = {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    businessType: user.businessType,
    phone: user.phone,
    retailerId: user.retailer?.id ?? null,
    supplierId: user.supplier?.id ?? null,
  };
  next();
};

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  next();
};

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) {
      const msg =
        roles.includes('RETAILER') && req.user.role === 'SUPPLIER'
          ? 'Ordering is available to retailer accounts. Supplier accounts manage listings from the Supplier Portal.'
          : 'You do not have access to this area.';
      return next(forbidden(msg));
    }
    next();
  };

/**
 * CSRF defence: unsafe requests must carry a custom header. Browsers cannot send
 * custom headers cross-origin without a CORS preflight, which our CORS policy rejects.
 */
export const requireCsrfHeader: RequestHandler = (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-requested-with') !== 'dhaaga') return next(forbidden('Missing request header.'));
  next();
};
