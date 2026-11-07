import { Router } from 'express';
import { formatINR, maskReference, paymentSubmitSchema } from '@dhaaga/shared';
import { prisma } from '../lib/prisma.js';
import { parse } from '../middleware/validate.js';
import { optionalFile } from '../middleware/upload.js';
import { newKey, storage } from '../lib/storage.js';
import { badRequest, conflict, HttpError, notFound, unprocessable } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { paymentLimiter } from '../lib/rateLimits.js';
import { z } from 'zod';
import { gatewayReady, getPaymentSettings, logPaymentEvent, manualUpiReady, notifyAdmins, OPEN_FOR_RETAILER, retailerPaymentView, syncOpenPayment } from '../lib/payments/service.js';
import { applyRazorpayPayment, razorpay, razorpayKeyId, razorpayStatus, verifyCheckoutSignature } from '../lib/payments/razorpay.js';
import { log } from '../lib/logger.js';

/**
 * Retailer payment endpoints, mounted under /api/retailer (RETAILER role already required).
 * Every lookup is scoped to the signed-in retailer's own orders; amounts and order ids come from
 * the database, never from the request body.
 */
export const retailerPaymentsRouter = Router();

const RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;

const retailerIdOf = (req: import('express').Request) => {
  if (!req.user?.retailerId) throw badRequest('Retailer profile missing.');
  return req.user.retailerId;
};

async function ownPayment(req: import('express').Request) {
  const order = await prisma.order.findFirst({ where: { id: String(req.params.orderId), retailerId: retailerIdOf(req) }, select: { id: true, orderNumber: true } });
  if (!order) throw notFound('Order not found.');
  const payment = await prisma.payment.findFirst({ where: { orderId: order.id }, orderBy: { createdAt: 'desc' }, include: { events: { orderBy: { createdAt: 'asc' } } } });
  if (!payment) throw notFound('This order has no online payment. Payment terms are agreed with your suppliers.');
  return { order, payment };
}

/** Which payment methods checkout can offer (no QR or account details here). */
retailerPaymentsRouter.get('/payment-options', async (_req, res) => {
  const s = await getPaymentSettings();
  res.json({ upiQr: manualUpiReady(s), gateway: gatewayReady(s) });
});

/** Payment status + instructions. The QR and UPI ID are only returned while the retailer still has to pay. */
retailerPaymentsRouter.get('/orders/:orderId/payment', async (req, res) => {
  const { order } = await ownPayment(req);
  await syncOpenPayment(order.id); // reflect supplier rejections in the amount due before showing it
  const { payment } = await ownPayment(req);
  const s = await getPaymentSettings();
  const mustPay = OPEN_FOR_RETAILER.includes(payment.status) && manualUpiReady(s);
  const upiUri =
    mustPay && s.upiId
      ? `upi://pay?${new URLSearchParams({ pa: s.upiId, pn: s.beneficiaryName ?? '', am: (payment.amountPaise / 100).toFixed(2), cu: 'INR', tn: `${payment.internalReference ?? order.orderNumber}` }).toString()}`
      : null;
  res.json({
    orderNumber: order.orderNumber,
    payment: retailerPaymentView(payment),
    instructions: mustPay
      ? {
          beneficiaryName: s.beneficiaryName,
          upiId: s.upiId,
          qrUrl: `/api/retailer/orders/${order.id}/payment/qr`,
          upiUri,
          instructions: s.instructions,
          paymentTerms: s.paymentTerms,
        }
      : null,
    paymentsAvailable: manualUpiReady(s) || gatewayReady(s),
    gateway: OPEN_FOR_RETAILER.includes(payment.status) && gatewayReady(s) ? { provider: 'RAZORPAY', mode: razorpayStatus().mode } : null,
    support: { phone: s.supportPhone, email: s.supportEmail },
    refundPolicy: s.refundPolicy,
    receiptUrl: payment.receiptKey ? `/api/retailer/orders/${order.id}/payment/receipt` : null,
  });
});

retailerPaymentsRouter.get('/orders/:orderId/payment/qr', async (req, res) => {
  const { payment } = await ownPayment(req);
  const s = await getPaymentSettings();
  if (!OPEN_FOR_RETAILER.includes(payment.status) || !manualUpiReady(s) || !s.qrStorageKey || !s.qrMime) throw notFound('No payment QR is available for this order.');
  const data = await storage.get(s.qrStorageKey);
  res.setHeader('Content-Type', s.qrMime);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.send(data);
});

/**
 * Records the retailer's UTR (and optional receipt) for admin verification. This NEVER marks the
 * payment paid. Resubmitting the same reference is idempotent; a reference already used on
 * another order is refused.
 */
retailerPaymentsRouter.post('/orders/:orderId/payment/submit', paymentLimiter, ...optionalFile('receipt', RECEIPT_TYPES, RECEIPT_MAX_BYTES), async (req, res) => {
  const { reference } = parse(paymentSubmitSchema, req.body);
  await syncOpenPayment(String(req.params.orderId)).catch(() => undefined);
  const { order, payment } = await ownPayment(req);

  if (payment.status === 'SUBMITTED') {
    if (payment.reference === reference) return res.json({ payment: retailerPaymentView(payment), duplicate: true });
    throw conflict('Payment details for this order were already submitted and are awaiting verification. Contact support if you need to correct them.');
  }
  if (!OPEN_FOR_RETAILER.includes(payment.status)) {
    throw unprocessable(payment.status === 'CANCELLED' ? 'This order was cancelled, so no payment is due.' : 'This payment has already been verified.');
  }
  const s = await getPaymentSettings();
  if (!manualUpiReady(s)) throw unprocessable('UPI payments are not available right now. Please contact Dhaaga Bazaar support.');
  if (payment.amountPaise <= 0) throw unprocessable('No payment is due for this order.');

  const usedElsewhere = await prisma.payment.findFirst({ where: { reference, id: { not: payment.id }, status: { in: ['SUBMITTED', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] } }, select: { id: true } });
  if (usedElsewhere) throw conflict('This transaction reference has already been submitted for another order. Check the UTR in your UPI app, or contact support.');

  const file = req.file;
  const receiptKey = file ? newKey('private/payments/receipts', file.mimetype) : null;
  if (file && receiptKey) await storage.put(receiptKey, file.buffer);
  try {
    await prisma.$transaction(async (tx) => {
      // Conditional on the status we read: a concurrent submit or an admin decision makes this fail cleanly.
      const r = await tx.payment.updateMany({
        where: { id: payment.id, status: payment.status },
        data: {
          status: 'SUBMITTED',
          reference,
          submittedAt: new Date(),
          rejectionReason: null,
          submissionCount: { increment: 1 },
          ...(receiptKey ? { receiptKey, receiptMime: file!.mimetype } : {}),
        },
      });
      if (r.count !== 1) throw conflict('This payment was updated in the meantime. Please refresh the page.');
      await logPaymentEvent(tx, { paymentId: payment.id, type: 'SUBMITTED', from: payment.status, to: 'SUBMITTED', actorId: req.user!.id, reference, note: receiptKey ? 'Receipt attached' : null });
    });
  } catch (e) {
    if (receiptKey) await storage.delete(receiptKey).catch(() => undefined);
    throw e;
  }
  // Replace an older receipt only after the new submission succeeded.
  if (receiptKey && payment.receiptKey) await storage.delete(payment.receiptKey).catch(() => undefined);

  await audit(req.user!.id, 'payment.submitted', 'Payment', payment.id, { orderNumber: order.orderNumber, reference: maskReference(reference), receipt: !!receiptKey });
  await notifyAdmins('PAYMENT_SUBMITTED', 'Payment to verify', `Order ${order.orderNumber}: ${formatINR(payment.amountPaise)} — retailer submitted UTR ${maskReference(reference)}.`, `/admin/payments/${payment.id}`);
  const fresh = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id }, include: { events: { orderBy: { createdAt: 'asc' } } } });
  res.json({ payment: retailerPaymentView(fresh), duplicate: false });
});

retailerPaymentsRouter.get('/orders/:orderId/payment/receipt', async (req, res) => {
  const { payment } = await ownPayment(req);
  if (!payment.receiptKey || !payment.receiptMime) throw notFound('No receipt uploaded.');
  const data = await storage.get(payment.receiptKey);
  res.setHeader('Content-Type', payment.receiptMime);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(data);
});

// ─── Razorpay (online payment) ────────────────────────────────────────────
/** A Razorpay order is reused for this long if the amount has not changed (repeat "Pay now" clicks). */
const REUSE_ORDER_MS = 6 * 60 * 60 * 1000;

/**
 * Creates (or reuses) the Razorpay order for this payment's authoritative amount and returns the
 * options Checkout needs. Only the public key id leaves the server.
 */
retailerPaymentsRouter.post('/orders/:orderId/payment/razorpay/order', paymentLimiter, async (req, res) => {
  await syncOpenPayment(String(req.params.orderId)).catch(() => undefined);
  const { order, payment } = await ownPayment(req);
  const s = await getPaymentSettings();
  if (!gatewayReady(s)) throw unprocessable('Online payment is not available right now. Please use the UPI QR option or contact support.');
  if (payment.status === 'SUBMITTED') throw conflict('You have already submitted UPI payment details for this order. Wait for verification before paying again.');
  if (!OPEN_FOR_RETAILER.includes(payment.status)) throw unprocessable(payment.status === 'CANCELLED' ? 'This order was cancelled, so no payment is due.' : 'This order is already paid.');
  if (payment.amountPaise < 100) throw unprocessable('No payment is due for this order.');

  const latest = await prisma.paymentGatewayOrder.findFirst({ where: { paymentId: payment.id, provider: 'RAZORPAY' }, orderBy: { createdAt: 'desc' } });
  let gatewayOrder = latest && latest.amountPaise === payment.amountPaise && latest.status !== 'paid' && Date.now() - latest.createdAt.getTime() < REUSE_ORDER_MS ? latest : null;
  if (!gatewayOrder) {
    const attempt = (await prisma.paymentGatewayOrder.count({ where: { paymentId: payment.id } })) + 1;
    let rz;
    try {
      rz = await razorpay.createOrder({
        amount: payment.amountPaise,
        currency: 'INR',
        receipt: `${payment.internalReference ?? order.orderNumber}-${attempt}`.slice(0, 40),
        notes: { paymentId: payment.id, orderNumber: order.orderNumber },
      });
    } catch (e) {
      log('error', 'razorpay order create failed', { id: req.id, paymentId: payment.id, error: String((e as { error?: { description?: string } })?.error?.description ?? (e as Error)?.message ?? e).slice(0, 300) });
      throw new HttpError(502, 'We could not start the online payment. Please try again in a moment.', 'GATEWAY_UNAVAILABLE');
    }
    if (rz.amount !== payment.amountPaise || rz.currency !== 'INR') throw new HttpError(502, 'The payment gateway returned an unexpected amount. Please contact support.', 'GATEWAY_MISMATCH');
    gatewayOrder = await prisma.paymentGatewayOrder.create({ data: { paymentId: payment.id, provider: 'RAZORPAY', providerOrderId: rz.id, amountPaise: rz.amount, currency: rz.currency, status: rz.status } });
    await prisma.$transaction((tx) => logPaymentEvent(tx, { paymentId: payment.id, type: 'GATEWAY_ORDER_CREATED', from: payment.status, to: payment.status, actorId: req.user!.id, reference: rz.id, note: `Razorpay order for ${formatINR(rz.amount)}` }));
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { fullName: true, email: true, phone: true, retailer: { select: { businessName: true, phone: true } } } });
  res.json({
    keyId: razorpayKeyId(),
    mode: razorpayStatus().mode,
    razorpayOrderId: gatewayOrder.providerOrderId,
    amountPaise: gatewayOrder.amountPaise,
    currency: 'INR',
    name: 'Dhaaga Bazaar',
    description: `Order ${order.orderNumber}`,
    prefill: { name: user.fullName, email: user.email, contact: user.phone ?? user.retailer?.phone ?? '' },
    notes: { orderNumber: order.orderNumber },
  });
});

/**
 * Checkout success callback. The signature proves the ids came from Razorpay; the payment is then
 * FETCHED from Razorpay and only its server-side status/amount decide the outcome.
 */
retailerPaymentsRouter.post('/orders/:orderId/payment/razorpay/verify', paymentLimiter, async (req, res) => {
  const body = parse(
    z.object({
      razorpay_order_id: z.string().regex(/^order_[A-Za-z0-9]{6,40}$/),
      razorpay_payment_id: z.string().regex(/^pay_[A-Za-z0-9]{6,40}$/),
      razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/),
    }),
    req.body,
  );
  const { payment } = await ownPayment(req);
  const go = await prisma.paymentGatewayOrder.findFirst({ where: { providerOrderId: body.razorpay_order_id, paymentId: payment.id } });
  if (!go) throw notFound('Payment attempt not found.');
  if (!verifyCheckoutSignature(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature)) {
    log('warn', 'razorpay signature mismatch', { id: req.id, paymentId: payment.id });
    throw badRequest('Payment verification failed. If money was deducted, it will be confirmed automatically or refunded by Razorpay.');
  }
  let rz;
  try {
    rz = await razorpay.fetchPayment(body.razorpay_payment_id);
  } catch {
    // The webhook will still confirm it; tell the retailer we are checking.
    return res.status(202).json({ outcome: 'pending' });
  }
  if (rz.order_id !== go.providerOrderId) throw badRequest('Payment verification failed.');
  const { outcome } = await applyRazorpayPayment(rz, 'checkout');
  const fresh = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id }, include: { events: { orderBy: { createdAt: 'asc' } } } });
  res.json({ outcome, payment: retailerPaymentView(fresh) });
});
