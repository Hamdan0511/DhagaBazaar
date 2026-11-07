import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { log } from '../lib/logger.js';
import { audit } from '../lib/audit.js';
import { applyRazorpayPayment, verifyWebhookSignature, webhookConfigured, type RzPayment, type RzRefund } from '../lib/payments/razorpay.js';
import { logPaymentEvent, notifyAdmins } from '../lib/payments/service.js';

/**
 * POST /api/webhooks/razorpay — mounted BEFORE express.json so the signature is checked against
 * the exact raw bytes Razorpay signed. No session, CSRF header or CORS: authenticity comes only
 * from X-Razorpay-Signature. Duplicate deliveries (same x-razorpay-event-id) are acknowledged and
 * ignored. A processing error returns 500 and is not recorded, so Razorpay retries it.
 */
export const webhookRouter = Router();

webhookRouter.post(
  '/razorpay',
  rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: 'draft-7', legacyHeaders: false }),
  express.raw({ type: '*/*', limit: '1mb' }),
  async (req, res) => {
    if (!webhookConfigured()) return res.status(503).json({ error: 'webhook not configured' });
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!verifyWebhookSignature(raw, req.header('x-razorpay-signature'))) {
      log('warn', 'razorpay webhook rejected: bad signature', { id: req.id });
      return res.status(400).json({ error: 'invalid signature' });
    }
    const eventId = req.header('x-razorpay-event-id');
    if (!eventId || eventId.length > 100) return res.status(400).json({ error: 'missing event id' });
    if (await prisma.paymentWebhookEvent.findUnique({ where: { provider_eventId: { provider: 'RAZORPAY', eventId } } })) return res.json({ ok: true, duplicate: true });

    let event: { event?: string; payload?: { payment?: { entity?: RzPayment }; refund?: { entity?: RzRefund } } };
    try {
      event = JSON.parse(raw.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'invalid json' });
    }
    const type = String(event.event ?? 'unknown');
    let status = 'IGNORED';
    let paymentId: string | null = null;
    let note: string | null = null;
    try {
      if (['payment.captured', 'payment.authorized', 'payment.failed', 'order.paid'].includes(type) && event.payload?.payment?.entity) {
        const r = await applyRazorpayPayment(event.payload.payment.entity, 'webhook');
        paymentId = r.paymentId;
        status = r.outcome === 'ignored' ? 'IGNORED' : 'PROCESSED';
        note = r.outcome;
      } else if ((type === 'refund.processed' || type === 'refund.failed') && event.payload?.refund?.entity) {
        const r = await applyRefundEvent(event.payload.refund.entity, type === 'refund.processed');
        paymentId = r.paymentId;
        status = r.paymentId ? 'PROCESSED' : 'IGNORED';
        note = r.note;
      }
    } catch (e) {
      log('error', 'razorpay webhook processing failed', { id: req.id, eventId, type, error: (e as Error).message });
      return res.status(500).json({ error: 'processing failed' }); // Razorpay retries
    }
    try {
      await prisma.paymentWebhookEvent.create({ data: { provider: 'RAZORPAY', eventId, eventType: type, paymentId, status, note } });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e; // concurrent duplicate delivery
    }
    res.json({ ok: true, status });
  },
);

/** refund.processed / refund.failed for a refund issued from the admin portal. */
async function applyRefundEvent(rf: RzRefund, processed: boolean): Promise<{ paymentId: string | null; note: string }> {
  const refund = await prisma.paymentRefund.findUnique({ where: { providerRefundId: rf.id }, include: { payment: { select: { id: true, status: true, refundedPaise: true, amountPaise: true, order: { select: { orderNumber: true } } } } } });
  if (!refund) return { paymentId: null, note: 'unknown refund' };
  if (refund.status !== 'PENDING') return { paymentId: refund.paymentId, note: `already ${refund.status.toLowerCase()}` };
  if (processed) {
    await prisma.paymentRefund.updateMany({ where: { id: refund.id, status: 'PENDING' }, data: { status: 'PROCESSED' } });
    return { paymentId: refund.paymentId, note: 'refund processed' };
  }
  // Failed: the money did not go back, so the refunded total and status are reversed.
  await prisma.$transaction(async (tx) => {
    const r = await tx.paymentRefund.updateMany({ where: { id: refund.id, status: 'PENDING' }, data: { status: 'FAILED' } });
    if (!r.count) return;
    const p = await tx.payment.findUniqueOrThrow({ where: { id: refund.paymentId } });
    const refunded = Math.max(0, p.refundedPaise - refund.amountPaise);
    const status = refunded === 0 ? 'PAID' : refunded >= p.amountPaise ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    await tx.payment.update({ where: { id: p.id }, data: { refundedPaise: refunded, status } });
    await logPaymentEvent(tx, { paymentId: p.id, type: 'REFUND_FAILED', from: p.status, to: status, reference: rf.id, note: `Razorpay refund of ${refund.amountPaise} paise failed` });
  });
  await audit(null, 'payment.refund_failed', 'Payment', refund.paymentId, { providerRefundId: rf.id });
  await notifyAdmins('PAYMENT_ATTENTION', `Refund failed on ${refund.payment.order.orderNumber}`, 'Razorpay could not process a refund. Retry it or refund manually.', `/admin/payments/${refund.paymentId}`);
  return { paymentId: refund.paymentId, note: 'refund failed' };
}
