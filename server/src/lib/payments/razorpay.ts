import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import type { PaymentStatus, Prisma } from '@prisma/client';
import { formatINR } from '@dhaaga/shared';
import { config } from '../../config.js';
import { prisma } from '../prisma.js';
import { notify } from '../audit.js';
import { log } from '../logger.js';
import { logPaymentEvent, notifyAdmins } from './service.js';

/**
 * Razorpay Standard Checkout integration (server side).
 *
 * - Orders are created here for the payment's authoritative amount in paise.
 * - A payment is marked PAID only from data fetched from / signed by Razorpay: the checkout
 *   callback signature is verified AND the payment is fetched from the API; webhooks are verified
 *   against the raw body. Nothing the browser reports is trusted on its own.
 * - The key secret and webhook secret never leave the server; only the public key id is sent to Checkout.
 */

export interface RzOrder {
  id: string;
  amount: number;
  currency: string;
  receipt?: string | null;
  status: string;
}
export interface RzPayment {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed' | string;
  method?: string | null;
  error_description?: string | null;
  error_reason?: string | null;
}
export interface RzRefund {
  id: string;
  amount: number;
  status: 'pending' | 'processed' | 'failed' | string;
  payment_id: string;
}

/** The subset of the Razorpay API this app uses (swapped for a fake in automated tests). */
export interface RazorpayApi {
  createOrder(p: { amount: number; currency: 'INR'; receipt: string; notes: Record<string, string> }): Promise<RzOrder>;
  fetchPayment(id: string): Promise<RzPayment>;
  capturePayment(id: string, amount: number): Promise<RzPayment>;
  fetchOrderPayments(orderId: string): Promise<RzPayment[]>;
  refund(paymentId: string, p: { amount: number; notes: Record<string, string> }): Promise<RzRefund>;
}

interface RazorpayState {
  keyId: string | null;
  keySecret: string | null;
  webhookSecret: string | null;
  mode: 'test' | 'live' | null;
  configured: boolean;
  api: RazorpayApi | null;
}

function sdkApi(keyId: string, keySecret: string): RazorpayApi {
  const rz = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return {
    createOrder: async (p) => (await rz.orders.create(p)) as unknown as RzOrder,
    fetchPayment: async (id) => (await rz.payments.fetch(id)) as unknown as RzPayment,
    capturePayment: async (id, amount) => (await rz.payments.capture(id, amount, 'INR')) as unknown as RzPayment,
    fetchOrderPayments: async (orderId) => ((await rz.orders.fetchPayments(orderId)) as unknown as { items: RzPayment[] }).items ?? [],
    refund: async (paymentId, p) => (await rz.payments.refund(paymentId, { amount: p.amount, notes: p.notes, speed: 'normal' })) as unknown as RzRefund,
  };
}

let state: RazorpayState = {
  ...config.razorpay,
  api: config.razorpay.configured ? sdkApi(config.razorpay.keyId!, config.razorpay.keySecret!) : null,
};
if (config.razorpay.problem) console.warn(`[razorpay] ${config.razorpay.problem}`);

/** Test seam (automated tests only): fake API + test secrets, no network. */
export function setRazorpayForTests(s: Partial<RazorpayState> | null) {
  if (config.env !== 'test') throw new Error('setRazorpayForTests is only available in tests');
  state = s ? { keyId: null, keySecret: null, webhookSecret: null, mode: 'test', configured: false, api: null, ...s } : { ...config.razorpay, api: null };
}

export const razorpayConfigured = () => state.configured && !!state.api;
export const razorpayStatus = () => ({ configured: razorpayConfigured(), mode: state.mode, keyId: state.keyId, webhookConfigured: !!state.webhookSecret, problem: config.razorpay.problem });
export const razorpayKeyId = () => state.keyId;
function api() {
  if (!razorpayConfigured()) throw new Error('Razorpay is not configured');
  return state.api!;
}
export const razorpay = { createOrder: (p: Parameters<RazorpayApi['createOrder']>[0]) => api().createOrder(p), fetchPayment: (id: string) => api().fetchPayment(id), capturePayment: (id: string, a: number) => api().capturePayment(id, a), fetchOrderPayments: (id: string) => api().fetchOrderPayments(id), refund: (id: string, p: Parameters<RazorpayApi['refund']>[1]) => api().refund(id, p) };

function safeEqualHex(expectedHex: string, given: string) {
  const a = Buffer.from(expectedHex, 'utf8');
  const b = Buffer.from(String(given ?? ''), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Checkout callback: HMAC-SHA256(order_id + "|" + payment_id, key_secret) == razorpay_signature. */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string) {
  if (!state.keySecret) return false;
  const expected = crypto.createHmac('sha256', state.keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqualHex(expected, signature);
}

/** Webhook: HMAC-SHA256(raw body, webhook_secret) == X-Razorpay-Signature. The body must not be parsed first. */
export function verifyWebhookSignature(rawBody: Buffer, signature: string | undefined) {
  if (!state.webhookSecret || !signature) return false;
  const expected = crypto.createHmac('sha256', state.webhookSecret).update(rawBody).digest('hex');
  return safeEqualHex(expected, signature);
}
export const webhookConfigured = () => !!state.webhookSecret;

export type GatewayOutcome = 'paid' | 'pending' | 'failed' | 'ignored' | 'duplicate_payment' | 'amount_mismatch';

/** Statuses a successful gateway capture may move from. CANCELLED included: money received must be recorded (and refunded). */
const CAPTURABLE_FROM: PaymentStatus[] = ['PENDING', 'REJECTED', 'FAILED', 'SUBMITTED', 'CANCELLED'];

/**
 * Applies a Razorpay payment (fetched from the API or from a signed webhook) to our records.
 * Idempotent: replays, double delivery and the checkout callback racing the webhook all end in one PAID.
 */
export async function applyRazorpayPayment(rz: RzPayment, source: 'checkout' | 'webhook' | 'sync'): Promise<{ outcome: GatewayOutcome; paymentId: string | null }> {
  if (!rz.order_id) return { outcome: 'ignored', paymentId: null };
  const go = await prisma.paymentGatewayOrder.findUnique({ where: { providerOrderId: rz.order_id }, include: { payment: { include: { order: { include: { retailer: { select: { userId: true } }, supplierOrders: { select: { id: true, status: true, supplier: { select: { userId: true } } } } } } } } } });
  if (!go) return { outcome: 'ignored', paymentId: null }; // not an order this system created
  const p = go.payment;
  const order = p.order;

  if (rz.status === 'authorized') {
    // Account without auto-capture: capture exactly the order amount, then apply the captured payment.
    if (rz.amount !== go.amountPaise || rz.currency !== 'INR') return mismatch(p.id, rz, go.amountPaise, source);
    const captured = await razorpay.capturePayment(rz.id, go.amountPaise).catch((e: Error) => {
      log('error', 'razorpay capture failed', { paymentId: p.id, rzPayment: rz.id, error: e.message });
      return null;
    });
    if (!captured) return { outcome: 'pending', paymentId: p.id };
    return applyRazorpayPayment(captured, source);
  }

  if (rz.status === 'captured') {
    if (rz.amount !== go.amountPaise || rz.currency !== 'INR') return mismatch(p.id, rz, go.amountPaise, source);
    if (p.providerPaymentId === rz.id && ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(p.status)) return { outcome: 'paid', paymentId: p.id };
    if (['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(p.status)) {
      // A second successful payment for an order that is already paid: money to give back.
      const seen = await prisma.paymentEvent.findFirst({ where: { paymentId: p.id, type: 'DUPLICATE_GATEWAY_PAYMENT', reference: rz.id } });
      if (!seen) {
        await prisma.$transaction((tx) => logPaymentEvent(tx, { paymentId: p.id, type: 'DUPLICATE_GATEWAY_PAYMENT', from: p.status, to: p.status, reference: rz.id, note: `Razorpay captured another ${formatINR(rz.amount)} (${rz.id}) for an order that was already paid. Refund it from Razorpay.` }));
        await notifyAdmins('PAYMENT_DUPLICATE', `Duplicate payment on ${order.orderNumber}`, `Razorpay captured ${formatINR(rz.amount)} again (${rz.id}). Refund the duplicate.`, `/admin/payments/${p.id}`);
      }
      return { outcome: 'duplicate_payment', paymentId: p.id };
    }
    const now = new Date();
    const applied = await prisma.$transaction(async (tx) => {
      const r = await tx.payment.updateMany({
        where: { id: p.id, status: { in: CAPTURABLE_FROM } },
        data: { status: 'PAID', provider: 'RAZORPAY', method: 'RAZORPAY', providerPaymentId: rz.id, gatewayMethod: rz.method ?? null, amountPaise: rz.amount, paidAt: now, verifiedAt: now, verifiedById: null, failureReason: null, rejectionReason: null },
      });
      if (r.count !== 1) return false;
      await tx.paymentGatewayOrder.update({ where: { id: go.id }, data: { status: 'paid' } });
      await logPaymentEvent(tx, { paymentId: p.id, type: 'GATEWAY_CAPTURED', from: p.status, to: 'PAID', reference: rz.id, note: `Razorpay ${rz.method ?? 'payment'} captured (confirmed via ${source})${p.status === 'CANCELLED' ? ' — order had been cancelled: refund due' : ''}` });
      return true;
    });
    if (!applied) {
      const now2 = await prisma.payment.findUniqueOrThrow({ where: { id: p.id }, select: { status: true, providerPaymentId: true } });
      return { outcome: now2.providerPaymentId === rz.id ? 'paid' : 'duplicate_payment', paymentId: p.id };
    }
    await notify(order.retailer.userId, 'PAYMENT_VERIFIED', 'Payment received', `Razorpay confirmed ${formatINR(rz.amount)} for order ${order.orderNumber}.`, `/account/orders/${order.id}`);
    for (const so of order.supplierOrders.filter((g) => g.status !== 'REJECTED' && g.status !== 'CANCELLED')) {
      await notify(so.supplier.userId, 'PAYMENT_VERIFIED', `Payment received for ${order.orderNumber}`, 'The retailer has paid through Razorpay. You may begin fulfilment once you have confirmed the order.', `/supplier/orders/${so.id}`);
    }
    if (p.status === 'CANCELLED' || p.status === 'SUBMITTED') {
      await notifyAdmins('PAYMENT_ATTENTION', `Check payment on ${order.orderNumber}`, p.status === 'CANCELLED' ? 'Razorpay captured a payment for a cancelled order — refund it.' : 'Razorpay payment captured while a manual UPI submission was pending — make sure the manual transfer is refunded if it also arrived.', `/admin/payments/${p.id}`);
    }
    return { outcome: 'paid', paymentId: p.id };
  }

  if (rz.status === 'failed') {
    const reason = (rz.error_description ?? rz.error_reason ?? 'Payment failed').slice(0, 300);
    const changed = await prisma.$transaction(async (tx) => {
      const r = await tx.payment.updateMany({ where: { id: p.id, status: { in: ['PENDING', 'REJECTED', 'FAILED'] } }, data: { status: 'FAILED', failureReason: reason } });
      if (!r.count) return false;
      // One history entry per failed Razorpay payment id (webhook and callback may both report it).
      const seen = await tx.paymentEvent.findFirst({ where: { paymentId: p.id, type: 'GATEWAY_FAILED', reference: rz.id } });
      if (!seen) await logPaymentEvent(tx, { paymentId: p.id, type: 'GATEWAY_FAILED', from: p.status, to: 'FAILED', reference: rz.id, note: reason });
      return !seen;
    });
    if (changed) await notify(order.retailer.userId, 'PAYMENT_FAILED', 'Payment not completed', `Your payment for order ${order.orderNumber} did not go through (${reason}). You can try again — no money is taken for a failed payment.`, `/account/orders/${order.id}/pay`);
    return { outcome: 'failed', paymentId: p.id };
  }

  return { outcome: 'pending', paymentId: p.id }; // created / pending at Razorpay
}

async function mismatch(paymentId: string, rz: RzPayment, expected: number, source: string): Promise<{ outcome: GatewayOutcome; paymentId: string }> {
  log('error', 'razorpay amount mismatch', { paymentId, rzPayment: rz.id, amount: rz.amount, expected, currency: rz.currency, source });
  const seen = await prisma.paymentEvent.findFirst({ where: { paymentId, type: 'GATEWAY_AMOUNT_MISMATCH', reference: rz.id } });
  if (!seen) {
    await prisma.$transaction((tx: Prisma.TransactionClient) => logPaymentEvent(tx, { paymentId, type: 'GATEWAY_AMOUNT_MISMATCH', reference: rz.id, note: `Razorpay reported ${rz.amount} ${rz.currency}, expected ${expected} INR. Not marked paid — review in Razorpay.` }));
    await notifyAdmins('PAYMENT_ATTENTION', 'Razorpay amount mismatch', `Payment ${rz.id} does not match the order amount. It was not marked paid.`, `/admin/payments/${paymentId}`);
  }
  return { outcome: 'amount_mismatch', paymentId };
}
