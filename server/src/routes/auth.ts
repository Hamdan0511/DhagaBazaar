import { Router } from 'express';
import { authIpLimiter, loginAccountLimiter } from '../lib/rateLimits.js';
import {
  accountNameSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  isSupplierBusinessType,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '@dhaaga/shared';
import { prisma } from '../lib/prisma.js';
import { parse } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import {
  clearSessionCookie,
  createResetToken,
  hashPassword,
  hashToken,
  setSessionCookie,
  signSession,
  verifyPassword,
} from '../lib/auth.js';
import { badRequest, conflict, unauthorized } from '../lib/http.js';
import { config } from '../config.js';
import { audit, notify } from '../lib/audit.js';
import { Prisma } from '@prisma/client';
import { log } from '../lib/logger.js';

export const authRouter = Router();

const authLimiter = authIpLimiter;

async function sessionPayload(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      retailer: { select: { id: true, businessName: true, city: true } },
      supplier: { select: { id: true, businessName: true, status: true, isVerified: true } },
    },
  });
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    role: user.role,
    businessType: user.businessType,
    retailer: user.retailer,
    supplier: user.supplier,
  };
}

authRouter.get('/me', async (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({ user: await sessionPayload(req.user.id) });
});

authRouter.post('/register', authLimiter, async (req, res) => {
  const data = parse(registerSchema, req.body);
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw conflict('An account with this email already exists. Try signing in instead.');

  const isSupplier = isSupplierBusinessType(data.businessType);
  const passwordHash = await hashPassword(data.password);
  // Only categories that really exist are stored.
  const validPaths = new Set(
    (await prisma.category.findMany({ where: { path: { in: data.categoryPaths }, isActive: true }, select: { path: true } })).map((c) => c.path),
  );
  const categoryPaths = data.categoryPaths.filter((p) => validPaths.has(p));
  const gstin = data.gstin || null;
  let user;
  try {
    user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        fullName: data.fullName,
        phone: data.phone,
        role: isSupplier ? 'SUPPLIER' : 'RETAILER',
        businessType: data.businessType,
        lastLoginAt: new Date(),
        ...(isSupplier
          ? {
              supplier: {
                create: {
                  businessName: data.businessName,
                  businessType: data.businessType,
                  contactName: data.fullName,
                  phone: data.phone,
                  gstin,
                  description: data.description || null,
                  addressLine: data.addressLine,
                  city: data.city,
                  state: data.state,
                  pincode: data.pincode,
                  categoryPaths,
                  // A complete registration goes straight to admin review. Never auto-approved or auto-verified.
                  status: 'PENDING_REVIEW',
                  submittedAt: new Date(),
                },
              },
            }
          : {
              retailer: {
                create: {
                  businessName: data.businessName,
                  businessType: data.businessType,
                  phone: data.phone,
                  gstin,
                  city: data.city,
                  state: data.state,
                  interests: categoryPaths,
                  addresses: {
                    create: {
                      label: 'Shop',
                      contactName: data.fullName,
                      phone: data.phone,
                      line1: data.addressLine,
                      city: data.city,
                      state: data.state,
                      pincode: data.pincode,
                      isDefault: true,
                    },
                  },
                },
              },
            }),
      },
      include: { supplier: { select: { id: true, businessName: true } } },
    });
  } catch (e) {
    // Two simultaneous sign-ups with one email: the unique index wins, report it clearly.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw conflict('An account with this email already exists. Try signing in instead.');
    throw e;
  }
  if (user.supplier) {
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN', isActive: true }, select: { id: true } });
    for (const a of admins) await notify(a.id, 'SUPPLIER_SUBMITTED', 'New supplier registration', `${user.supplier.businessName} registered and is awaiting review.`, `/admin/suppliers/${user.supplier.id}`);
  }
  await audit(user.id, 'user.registered', 'User', user.id, { role: user.role });
  setSessionCookie(res, signSession(user.id, user.tokenVersion));
  res.status(201).json({ user: await sessionPayload(user.id) });
});

authRouter.post('/login', authLimiter, loginAccountLimiter, async (req, res) => {
  const { email, password } = parse(loginSchema, req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  // Same message for unknown email and wrong password to avoid account enumeration.
  if (!user || !user.isActive || !(await verifyPassword(password, user.passwordHash))) {
    throw unauthorized('Incorrect email or password.');
  }
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  setSessionCookie(res, signSession(user.id, user.tokenVersion));
  res.json({ user: await sessionPayload(user.id) });
});

authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.post('/forgot-password', authLimiter, async (req, res) => {
  const { email } = parse(forgotPasswordSchema, req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  if (user && user.isActive) {
    const { token, tokenHash } = createResetToken();
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    });
    const link = `${config.appUrl}/reset-password?token=${token}`;
    // No email provider is configured yet. In development the link is logged so the
    // flow can be tested end to end; production must wire an email service here.
    if (!config.isProd) console.info(`[auth] Password reset link for ${email}: ${link}`);
    else if (!config.emailConfigured) log('error', 'password reset requested but no email provider is configured', { user: user.id });
  }
  res.json({ ok: true, message: 'If an account exists for this email, a password reset link has been sent.' });
});

authRouter.post('/reset-password', authLimiter, async (req, res) => {
  const { token, password } = parse(resetPasswordSchema, req.body);
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw badRequest('This reset link is invalid or has expired. Please request a new one.');
  }
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: await hashPassword(password), tokenVersion: { increment: 1 } },
    }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);
  await audit(record.userId, 'user.password_reset', 'User', record.userId);
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = parse(changePasswordSchema, req.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (!(await verifyPassword(currentPassword, user.passwordHash))) throw badRequest('Your current password is incorrect.');
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword), tokenVersion: { increment: 1 } },
  });
  // Rotate the session: other devices are signed out, this one stays signed in.
  setSessionCookie(res, signSession(updated.id, updated.tokenVersion));
  res.json({ ok: true });
});

authRouter.put('/account', requireAuth, async (req, res) => {
  const { fullName } = parse(accountNameSchema, req.body);
  await prisma.user.update({ where: { id: req.user!.id }, data: { fullName } });
  res.json({ ok: true });
});
