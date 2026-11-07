import { Router } from 'express';
import type { Prisma, PaymentStatus } from '@prisma/client';
import { z } from 'zod';
import { formatINR, maskReference, paymentCancelSchema, paymentRefundSchema, paymentRejectSchema, paymentSettingsSchema, paymentVerifySchema } from '@dhaaga/shared';
import { prisma } from '../lib/prisma.js';
import { parse } from '../middleware/validate.js';
import { acceptFiles } from '../middleware/upload.js';
import { newKey, storage } from '../lib/storage.js';
import { conflict, notFound, paginate, unprocessable } from '../lib/http.js';
import { audit, notify } from '../lib/audit.js';
import { uploadLimiter } from '../lib/rateLimits.js';
import { imageDimensions } from '../lib/imageInfo.js';
import { releaseStock } from '../lib/stock.js';
import { recomputeOrderStatus } from './retailer.js';
import { gatewayAvailable } from '../lib/payments/provider.js';
import { applyRazorpayPayment, razorpay, razorpayStatus } from '../lib/payments/razorpay.js';
import { config } from '../config.js';
import { log } from '../lib/logger.js';
import { HttpError } from '../lib/http.js';
import { getPaymentSettings, logPaymentEvent, manualUpiReady, refundDuePaise, SETTINGS_ID, SETTLED } from '../lib/payments/service.js';

/** Admin-only payment configuration and verification (mounted inside adminRouter → ADMIN role). */
export const adminPaymentsRouter = Router();

const QR_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const QR_MAX_BYTES = 2 * 1024 * 1024;

const settingsView = (s: Awaited<ReturnType<typeof getPaymentSettings>>) => ({
  manualUpiEnabled: s.manualUpiEnabled,
  gatewayEnabled: s.gatewayEnabled,
  gatewayAvailable: gatewayAvailable(),
  hasQr: !!s.qrStorageKey,
  qrUrl: s.qrStorageKey ? `/api/admin/payment-settings/qr?v=${s.updatedAt.getTime()}` : null,
  upiId: s.upiId,
  beneficiaryName: s.beneficiaryName,
  instructions: s.instructions,
  supportPhone: s.supportPhone,
  supportEmail: s.supportEmail,
  paymentTerms: s.paymentTerms,
  refundPolicy: s.refundPolicy,
  ready: manualUpiReady(s),
  updatedAt: s.updatedAt,
  gateway: {
    provider: 'RAZORPAY',
    ...razorpayStatus(),
    keyId: razorpayStatus().keyId ? `${razorpayStatus().keyId!.slice(0, 13)}…` : null,
    webhookUrl: `${config.appUrl}/api/webhooks/razorpay`,
    ready: s.gatewayEnabled && gatewayAvailable(),
  },
});

// ─── Settings → Payments ──────────────────────────────────────────────────
adminPaymentsRouter.get('/payment-settings', async (_req, res) => {
  res.json({ settings: settingsView(await getPaymentSettings()) });
});

adminPaymentsRouter.put('/payment-settings', async (req, res) => {
  const data = parse(paymentSettingsSchema, req.body);
  if (data.gatewayEnabled && !gatewayAvailable()) throw unprocessable(razorpayStatus().problem ?? 'No payment gateway is configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET (test keys first) on the server, restart the API, then enable online payments.');
  const current = await getPaymentSettings();
  if (data.manualUpiEnabled && (!current.qrStorageKey || !data.beneficiaryName)) throw unprocessable('Upload the business UPI QR and enter the beneficiary name before enabling UPI QR payments.');
  const updated = await prisma.paymentSettings.update({ where: { id: SETTINGS_ID }, data: { ...data, updatedById: req.user!.id } });
  const changed = (Object.keys(data) as (keyof typeof data)[]).filter((k) => current[k] !== updated[k]);
  await audit(req.user!.id, 'payment_settings.updated', 'PaymentSettings', SETTINGS_ID, { changed });
  res.json({ settings: settingsView(updated) });
});

adminPaymentsRouter.post('/payment-settings/qr', uploadLimiter, ...acceptFiles('qr', QR_TYPES, 1), async (req, res) => {
  const f = (req.files as Express.Multer.File[])[0]!;
  if (f.size > QR_MAX_BYTES) throw unprocessable('The QR image must be 2 MB or smaller.');
  const dims = imageDimensions(f.buffer, f.mimetype);
  if (!dims) throw unprocessable('The QR image could not be read.');
  if (Math.min(dims.width, dims.height) < 200) throw unprocessable(`The QR image is ${dims.width}×${dims.height}px. Upload the original QR (at least 200px) so it scans reliably.`);
  if (Math.max(dims.width, dims.height) > 4000) throw unprocessable('The QR image is larger than 4000px. Please upload a smaller copy.');
  const current = await getPaymentSettings();
  const key = newKey('private/payments/qr', f.mimetype);
  await storage.put(key, f.buffer);
  const updated = await prisma.paymentSettings.update({ where: { id: SETTINGS_ID }, data: { qrStorageKey: key, qrMime: f.mimetype, updatedById: req.user!.id } });
  if (current.qrStorageKey) await storage.delete(current.qrStorageKey).catch(() => undefined);
  await audit(req.user!.id, 'payment_settings.qr_uploaded', 'PaymentSettings', SETTINGS_ID, { width: dims.width, height: dims.height, replaced: !!current.qrStorageKey });
  res.status(201).json({ settings: settingsView(updated) });
});

adminPaymentsRouter.delete('/payment-settings/qr', async (req, res) => {
  const current = await getPaymentSettings();
  // Without a QR the manual method cannot be offered, so it is switched off too.
  const updated = await prisma.paymentSettings.update({ where: { id: SETTINGS_ID }, data: { qrStorageKey: null, qrMime: null, manualUpiEnabled: false, updatedById: req.user!.id } });
  if (current.qrStorageKey) await storage.delete(current.qrStorageKey).catch(() => undefined);
  await audit(req.user!.id, 'payment_settings.qr_removed', 'PaymentSettings', SETTINGS_ID);
  res.json({ settings: settingsView(updated) });
});

adminPaymentsRouter.get('/payment-settings/qr', async (_req, res) => {
  const s = await getPaymentSettings();
  if (!s.qrStorageKey || !s.qrMime) throw notFound('No QR uploaded.');
  res.setHeader('Content-Type', s.qrMime);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.send(await storage.get(s.qrStorageKey));
});

// ─── Payments list & detail ───────────────────────────────────────────────
const STATUSES = ['PENDING', 'SUBMITTED', 'PAID', 'REJECTED', 'FAILED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'CANCELLED'] as const;

adminPaymentsRouter.get('/payments', async (req, res) => {
  const q = parse(
    z.object({
      status: z.enum(STATUSES).optional(),
      q: z.string().trim().max(100).optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      minRupees: z.coerce.number().min(0).optional(),
      maxRupees: z.coerce.number().min(0).optional(),
      refunds: z.enum(['true']).optional(),
      provider: z.enum(['MANUAL_UPI', 'RAZORPAY']).optional(),
    }),
    req.query,
  );
  const { skip, take, page, pageSize } = paginate(req.query, { pageSize: 25, max: 100 });
  const search = q.q?.replace(/\s/g, '');
  const where: Prisma.PaymentWhereInput = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.refunds ? { refundedPaise: { gt: 0 } } : {}),
    ...(q.provider ? { provider: q.provider } : {}),
    ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lt: new Date(q.to.getTime() + 24 * 3600 * 1000) } : {}) } } : {}),
    ...(q.minRupees !== undefined || q.maxRupees !== undefined
      ? { amountPaise: { ...(q.minRupees !== undefined ? { gte: Math.round(q.minRupees * 100) } : {}), ...(q.maxRupees !== undefined ? { lte: Math.round(q.maxRupees * 100) } : {}) } }
      : {}),
    ...(q.q
      ? {
          OR: [
            { order: { orderNumber: { contains: search!, mode: 'insensitive' } } },
            { internalReference: { contains: search!, mode: 'insensitive' } },
            { reference: { contains: search!.toUpperCase() } },
            { providerPaymentId: { contains: search! } },
            { gatewayOrders: { some: { providerOrderId: { contains: search! } } } },
            { order: { retailer: { businessName: { contains: q.q, mode: 'insensitive' } } } },
          ],
        }
      : {}),
  };
  const [rows, total, grouped, refundCount] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: [{ submittedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      skip,
      take,
      include: { order: { select: { id: true, orderNumber: true, retailer: { select: { businessName: true, city: true } } } } },
    }),
    prisma.payment.count({ where }),
    prisma.payment.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.payment.count({ where: { refundedPaise: { gt: 0 } } }),
  ]);
  const counts = Object.fromEntries(STATUSES.map((s) => [s, grouped.find((g) => g.status === s)?._count._all ?? 0]));
  res.json({
    payments: rows.map((p) => ({
      id: p.id,
      status: p.status,
      amountPaise: p.amountPaise,
      refundedPaise: p.refundedPaise,
      method: p.method,
      provider: p.provider,
      internalReference: p.internalReference,
      reference: p.reference,
      providerPaymentId: p.providerPaymentId,
      submittedAt: p.submittedAt,
      createdAt: p.createdAt,
      order: { id: p.order.id, orderNumber: p.order.orderNumber, retailer: p.order.retailer },
    })),
    counts: { ...counts, withRefunds: refundCount },
    total,
    page,
    pageSize,
  });
});

async function loadPayment(id: string) {
  const p = await prisma.payment.findUnique({
    where: { id },
    include: {
      order: {
        include: {
          retailer: { select: { id: true, businessName: true, businessType: true, gstin: true, phone: true, city: true, state: true, user: { select: { email: true, fullName: true, id: true } } } },
          supplierOrders: { select: { id: true, status: true, subtotalPaise: true, supplier: { select: { id: true, businessName: true, userId: true } } } },
        },
      },
      events: { orderBy: { createdAt: 'asc' } },
      refunds: { orderBy: { createdAt: 'asc' } },
      gatewayOrders: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!p) throw notFound('Payment not found.');
  return p;
}

adminPaymentsRouter.get('/payments/:id', async (req, res) => {
  const p = await loadPayment(String(req.params.id));
  const actorIds = [...new Set([...p.events.map((e) => e.actorId), ...p.refunds.map((r) => r.recordedById), p.verifiedById].filter((x): x is string => !!x))];
  const actors = new Map((await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, fullName: true, role: true } })).map((u) => [u.id, u]));
  // The same UTR on any other payment is a red flag for the verifier.
  const sameReference = p.reference
    ? await prisma.payment.findMany({ where: { reference: p.reference, id: { not: p.id } }, select: { id: true, status: true, order: { select: { orderNumber: true } } } })
    : [];
  res.json({
    payment: {
      id: p.id,
      status: p.status,
      method: p.method,
      provider: p.provider,
      amountPaise: p.amountPaise,
      refundedPaise: p.refundedPaise,
      refundDuePaise: await refundDuePaise(p),
      internalReference: p.internalReference,
      reference: p.reference,
      receiptUrl: p.receiptKey ? `/api/admin/payments/${p.id}/receipt` : null,
      receiptMime: p.receiptMime,
      submittedAt: p.submittedAt,
      submissionCount: p.submissionCount,
      verifiedAt: p.verifiedAt,
      verifiedBy: p.verifiedById ? (actors.get(p.verifiedById)?.fullName ?? p.verifiedById) : null,
      rejectionReason: p.rejectionReason,
      paidAt: p.paidAt,
      createdAt: p.createdAt,
      order: {
        id: p.order.id,
        orderNumber: p.order.orderNumber,
        status: p.order.status,
        subtotalPaise: p.order.subtotalPaise,
        createdAt: p.order.createdAt,
        shippingAddress: p.order.shippingAddress,
        retailer: { ...p.order.retailer, user: { email: p.order.retailer.user.email, fullName: p.order.retailer.user.fullName } },
        supplierOrders: p.order.supplierOrders.map((so) => ({ id: so.id, status: so.status, subtotalPaise: so.subtotalPaise, supplier: { id: so.supplier.id, businessName: so.supplier.businessName } })),
      },
      history: p.events.map((e) => ({ id: e.id, type: e.type, fromStatus: e.fromStatus, toStatus: e.toStatus, note: e.note, reference: e.reference, at: e.createdAt, actor: e.actorId ? (actors.get(e.actorId) ?? { id: e.actorId, fullName: 'Unknown', role: null }) : null })),
      refunds: p.refunds.map((r) => ({ ...r, recordedBy: actors.get(r.recordedById)?.fullName ?? r.recordedById })),
      sameReference: sameReference.map((x) => ({ id: x.id, status: x.status, orderNumber: x.order.orderNumber })),
      gateway: {
        providerPaymentId: p.providerPaymentId,
        method: p.gatewayMethod,
        failureReason: p.failureReason,
        mode: razorpayStatus().mode,
        orders: p.gatewayOrders.map((g) => ({ id: g.providerOrderId, amountPaise: g.amountPaise, status: g.status, createdAt: g.createdAt })),
        webhooks: await prisma.paymentWebhookEvent.findMany({ where: { paymentId: p.id }, orderBy: { receivedAt: 'desc' }, take: 20, select: { eventId: true, eventType: true, status: true, note: true, receivedAt: true } }),
      },
    },
  });
});

adminPaymentsRouter.get('/payments/:id/receipt', async (req, res) => {
  const p = await prisma.payment.findUnique({ where: { id: String(req.params.id) }, select: { id: true, receiptKey: true, receiptMime: true } });
  if (!p?.receiptKey || !p.receiptMime) throw notFound('No receipt uploaded.');
  const data = await storage.get(p.receiptKey);
  await audit(req.user!.id, 'payment.receipt_viewed', 'Payment', p.id);
  res.setHeader('Content-Type', p.receiptMime);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(data);
});

/** Conditional transition: only succeeds if the payment is still in one of `from` (no double verification). */
async function transition(tx: Prisma.TransactionClient, id: string, from: PaymentStatus[], data: Prisma.PaymentUpdateManyMutationInput) {
  const r = await tx.payment.updateMany({ where: { id, status: { in: from } }, data });
  if (r.count !== 1) throw conflict('This payment was already updated by someone else. Please refresh.');
}

adminPaymentsRouter.post('/payments/:id/verify', async (req, res) => {
  const { reference, note } = parse(paymentVerifySchema, req.body);
  const p = await loadPayment(String(req.params.id));
  if (SETTLED.includes(p.status) || p.status === 'REFUNDED') throw conflict('This payment is already verified.');
  if (!['SUBMITTED', 'PENDING', 'REJECTED', 'FAILED'].includes(p.status)) throw unprocessable(`A ${p.status.toLowerCase()} payment cannot be verified.`);
  // Without a retailer submission the admin must record the bank reference they found.
  if (p.status !== 'SUBMITTED' && !reference) throw unprocessable('Enter the bank/UPI reference of the credit you found in the business account.');
  if (reference) {
    const dup = await prisma.payment.findFirst({ where: { reference, id: { not: p.id }, status: { in: ['SUBMITTED', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] } }, select: { order: { select: { orderNumber: true } } } });
    if (dup) throw conflict(`This reference is already used by order ${dup.order.orderNumber}.`);
  }
  if (p.amountPaise <= 0) throw unprocessable('No amount is due on this payment.');
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await transition(tx, p.id, [p.status], { status: 'PAID', paidAt: now, verifiedAt: now, verifiedById: req.user!.id, rejectionReason: null, ...(reference ? { reference } : {}) });
    await logPaymentEvent(tx, { paymentId: p.id, type: 'VERIFIED', from: p.status, to: 'PAID', actorId: req.user!.id, note: note ?? null, reference: reference ?? p.reference });
  });
  await audit(req.user!.id, 'payment.verified', 'Payment', p.id, { orderNumber: p.order.orderNumber, amountPaise: p.amountPaise, reference: maskReference(reference ?? p.reference) });
  await notify(p.order.retailer.user.id, 'PAYMENT_VERIFIED', 'Payment verified', `We received ${formatINR(p.amountPaise)} for order ${p.order.orderNumber}. Your suppliers can now prepare the order.`, `/account/orders/${p.order.id}`);
  for (const so of p.order.supplierOrders.filter((g) => g.status !== 'REJECTED' && g.status !== 'CANCELLED')) {
    await notify(so.supplier.userId, 'PAYMENT_VERIFIED', `Payment verified for ${p.order.orderNumber}`, 'Dhaaga Bazaar has verified the retailer’s payment. You may begin fulfilment once you have confirmed the order.', `/supplier/orders/${so.id}`);
  }
  res.json({ ok: true });
});

adminPaymentsRouter.post('/payments/:id/reject', async (req, res) => {
  const { reason } = parse(paymentRejectSchema, req.body);
  const p = await loadPayment(String(req.params.id));
  if (p.status !== 'SUBMITTED') throw conflict(p.status === 'REJECTED' ? 'This submission was already rejected.' : 'Only submitted payments awaiting verification can be rejected.');
  await prisma.$transaction(async (tx) => {
    await transition(tx, p.id, ['SUBMITTED'], { status: 'REJECTED', rejectionReason: reason, verifiedAt: null, verifiedById: req.user!.id });
    await logPaymentEvent(tx, { paymentId: p.id, type: 'REJECTED', from: 'SUBMITTED', to: 'REJECTED', actorId: req.user!.id, note: reason, reference: p.reference });
  });
  await audit(req.user!.id, 'payment.rejected', 'Payment', p.id, { orderNumber: p.order.orderNumber, reason });
  await notify(p.order.retailer.user.id, 'PAYMENT_REJECTED', 'Payment could not be verified', `Order ${p.order.orderNumber}: ${reason} You can submit the correct transaction details again.`, `/account/orders/${p.order.id}/pay`);
  res.json({ ok: true });
});

adminPaymentsRouter.post('/payments/:id/refunds', async (req, res) => {
  const data = parse(paymentRefundSchema, req.body);
  const p = await loadPayment(String(req.params.id));
  if (!SETTLED.includes(p.status)) throw unprocessable('Refunds can only be recorded for verified payments.');
  if (data.supplierOrderId && !p.order.supplierOrders.some((so) => so.id === data.supplierOrderId)) throw notFound('That supplier group is not part of this order.');
  const remaining = p.amountPaise - p.refundedPaise;
  if (data.amountPaise > remaining) throw unprocessable(`The refund cannot exceed the remaining paid amount (${formatINR(remaining)}).`);
  const refunded = p.refundedPaise + data.amountPaise;
  const next: PaymentStatus = refunded >= p.amountPaise ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
  // Gateway payments are refunded through Razorpay (to the original method); manual UPI refunds are made outside and recorded.
  let gatewayRefund: { id: string; status: string } | null = null;
  if (p.provider === 'RAZORPAY' && p.providerPaymentId) {
    try {
      gatewayRefund = await razorpay.refund(p.providerPaymentId, { amount: data.amountPaise, notes: { paymentId: p.id, orderNumber: p.order.orderNumber, note: data.note.slice(0, 200) } });
    } catch (e) {
      log('error', 'razorpay refund failed', { paymentId: p.id, error: String((e as { error?: { description?: string } })?.error?.description ?? (e as Error)?.message ?? e).slice(0, 300) });
      throw new HttpError(502, 'Razorpay did not accept the refund. Check the Razorpay dashboard and try again.', 'GATEWAY_REFUND_FAILED');
    }
    if (gatewayRefund.status === 'failed') throw new HttpError(502, 'Razorpay rejected the refund. Nothing was recorded.', 'GATEWAY_REFUND_FAILED');
  }
  await prisma.$transaction(async (tx) => {
    // Conditional on refundedPaise so two admins cannot both record against the same balance.
    const r = await tx.payment.updateMany({ where: { id: p.id, status: p.status, refundedPaise: p.refundedPaise }, data: { refundedPaise: refunded, status: next } });
    if (r.count !== 1) {
      if (gatewayRefund) log('error', 'razorpay refund issued but not recorded (concurrent update)', { paymentId: p.id, refund: gatewayRefund.id });
      throw conflict('This payment was updated in the meantime. Please refresh.');
    }
    await tx.paymentRefund.create({
      data: {
        paymentId: p.id, supplierOrderId: data.supplierOrderId ?? null, amountPaise: data.amountPaise, reference: gatewayRefund?.id ?? data.reference ?? null, note: data.note, recordedById: req.user!.id,
        providerRefundId: gatewayRefund?.id ?? null, status: gatewayRefund ? (gatewayRefund.status === 'processed' ? 'PROCESSED' : 'PENDING') : 'PROCESSED',
      },
    });
    await logPaymentEvent(tx, { paymentId: p.id, type: 'REFUND', from: p.status, to: next, actorId: req.user!.id, note: `${formatINR(data.amountPaise)} refunded — ${data.note}`, reference: data.reference ?? null });
  });
  await audit(req.user!.id, 'payment.refund_recorded', 'Payment', p.id, { orderNumber: p.order.orderNumber, amountPaise: data.amountPaise, reference: maskReference(data.reference) });
  await notify(p.order.retailer.user.id, 'PAYMENT_REFUNDED', 'Refund issued', `${formatINR(data.amountPaise)} was refunded for order ${p.order.orderNumber}${data.reference ? ` (reference ${maskReference(data.reference)})` : ''}.`, `/account/orders/${p.order.id}`);
  res.status(201).json({ ok: true, status: next });
});

/**
 * Cancels an unpaid order (e.g. the retailer never paid): every group not yet in fulfilment is
 * cancelled, reserved stock is returned and the payment is closed.
 */
adminPaymentsRouter.post('/payments/:id/cancel-order', async (req, res) => {
  const { reason } = parse(paymentCancelSchema, req.body);
  const p = await loadPayment(String(req.params.id));
  if (!['PENDING', 'REJECTED', 'FAILED'].includes(p.status)) throw unprocessable('Only orders whose payment is still outstanding can be cancelled for non-payment.');
  const groups = p.order.supplierOrders.filter((so) => so.status === 'REQUESTED' || so.status === 'CONFIRMED');
  await prisma.$transaction(async (tx) => {
    await transition(tx, p.id, [p.status], { status: 'CANCELLED' });
    for (const so of groups) {
      const r = await tx.supplierOrder.updateMany({ where: { id: so.id, status: so.status }, data: { status: 'CANCELLED', supplierNote: `Cancelled by Dhaaga Bazaar: ${reason}` } });
      if (r.count !== 1) throw conflict('A supplier updated this order in the meantime. Please refresh.');
      const items = await tx.orderItem.findMany({ where: { supplierOrderId: so.id } });
      await releaseStock(tx, items.filter((i) => i.productId).map((i) => ({ productId: i.productId!, variantId: i.variantId, quantity: i.quantity })));
    }
    await logPaymentEvent(tx, { paymentId: p.id, type: 'CANCELLED', from: p.status, to: 'CANCELLED', actorId: req.user!.id, note: reason });
  });
  await recomputeOrderStatus(p.order.id);
  await audit(req.user!.id, 'payment.order_cancelled', 'Payment', p.id, { orderNumber: p.order.orderNumber, reason, groups: groups.length });
  await notify(p.order.retailer.user.id, 'ORDER_CANCELLED', `Order ${p.order.orderNumber} cancelled`, `The order was cancelled because payment was not received: ${reason}`, `/account/orders/${p.order.id}`);
  for (const so of groups) await notify(so.supplier.userId, 'ORDER_CANCELLED', `Order ${p.order.orderNumber} cancelled`, `Dhaaga Bazaar cancelled this order (payment not received). Reserved stock has been released.`, `/supplier/orders/${so.id}`);
  res.json({ ok: true });
});

/** Reconciliation: re-reads this payment's Razorpay orders and applies whatever Razorpay reports. */
adminPaymentsRouter.post('/payments/:id/sync', async (req, res) => {
  const p = await prisma.payment.findUnique({ where: { id: String(req.params.id) }, include: { gatewayOrders: { orderBy: { createdAt: 'desc' }, take: 5 } } });
  if (!p) throw notFound('Payment not found.');
  if (!p.gatewayOrders.length) throw unprocessable('This payment has no Razorpay attempts to check.');
  const outcomes: string[] = [];
  for (const go of p.gatewayOrders) {
    let items;
    try {
      items = await razorpay.fetchOrderPayments(go.providerOrderId);
    } catch {
      throw new HttpError(502, 'Could not reach Razorpay. Try again shortly.', 'GATEWAY_UNAVAILABLE');
    }
    // Captured first, so a later failed retry never hides a successful payment.
    for (const rz of [...items].sort((a, b) => Number(b.status === 'captured') - Number(a.status === 'captured'))) outcomes.push((await applyRazorpayPayment(rz, 'sync')).outcome);
  }
  await audit(req.user!.id, 'payment.gateway_synced', 'Payment', p.id, { outcomes });
  const fresh = await prisma.payment.findUniqueOrThrow({ where: { id: p.id }, select: { status: true } });
  res.json({ ok: true, status: fresh.status, outcomes });
});
