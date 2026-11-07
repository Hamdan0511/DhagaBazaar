import type { Payment, PaymentStatus, Prisma } from '@prisma/client';
import { PAYMENT_SETTLED_STATUSES, maskReference } from '@dhaaga/shared';
import { prisma } from '../prisma.js';
import { notify } from '../audit.js';
import { gatewayAvailable, manualUpiProvider, razorpayProvider } from './provider.js';

type Tx = Prisma.TransactionClient;

export const SETTINGS_ID = 'default';

export async function getPaymentSettings(db: Tx | typeof prisma = prisma) {
  return (await db.paymentSettings.findUnique({ where: { id: SETTINGS_ID } })) ?? (await db.paymentSettings.create({ data: { id: SETTINGS_ID } }));
}

/** Manual UPI can be offered only when an admin enabled it AND uploaded the business QR and payee name. */
export function manualUpiReady(s: { manualUpiEnabled: boolean; qrStorageKey: string | null; beneficiaryName: string | null }) {
  return s.manualUpiEnabled && !!s.qrStorageKey && !!s.beneficiaryName;
}

/** Online (Razorpay) payment is offered when an admin enabled it AND keys are configured on the server. */
export function gatewayReady(s: { gatewayEnabled: boolean }) {
  return s.gatewayEnabled && gatewayAvailable();
}

/** Statuses from which nothing more is expected from the retailer. */
/** The retailer still owes the money (a failed gateway attempt can be retried). */
export const OPEN_FOR_RETAILER: PaymentStatus[] = ['PENDING', 'REJECTED', 'FAILED'];
export const SETTLED: PaymentStatus[] = [...PAYMENT_SETTLED_STATUSES];

export async function logPaymentEvent(db: Tx, p: { paymentId: string; type: string; from?: PaymentStatus | null; to?: PaymentStatus | null; actorId?: string | null; note?: string | null; reference?: string | null }) {
  await db.paymentEvent.create({ data: { paymentId: p.paymentId, type: p.type, fromStatus: p.from ?? null, toStatus: p.to ?? null, actorId: p.actorId ?? null, note: p.note ?? null, reference: p.reference ?? null } });
}

/** Creates the order's payment inside the checkout transaction. Amount is the server-computed subtotal. */
export async function createOrderPayment(tx: Tx, order: { id: string; orderNumber: string; subtotalPaise: number }, idempotencyKey: string | undefined, actorId: string, method: 'UPI_QR' | 'RAZORPAY' = 'UPI_QR') {
  const payment = await tx.payment.create({
    data: {
      orderId: order.id,
      amountPaise: order.subtotalPaise,
      method: method === 'RAZORPAY' ? razorpayProvider.method : manualUpiProvider.method,
      provider: method === 'RAZORPAY' ? razorpayProvider.name : manualUpiProvider.name,
      status: 'PENDING',
      internalReference: `PAY-${order.orderNumber}`,
      idempotencyKey: idempotencyKey ?? null,
    },
  });
  await logPaymentEvent(tx, { paymentId: payment.id, type: 'CREATED', to: 'PENDING', actorId, note: method === 'RAZORPAY' ? 'Order placed with online payment (Razorpay)' : 'Order placed with UPI QR payment' });
  return payment;
}

/** Sum of supplier groups still being supplied (not rejected/cancelled). */
export async function activeOrderTotal(db: Tx | typeof prisma, orderId: string) {
  const groups = await db.supplierOrder.findMany({ where: { orderId }, select: { status: true, subtotalPaise: true } });
  return groups.filter((g) => g.status !== 'REJECTED' && g.status !== 'CANCELLED').reduce((s, g) => s + g.subtotalPaise, 0);
}

/**
 * Keeps an UNPAID payment in step with the order: while the retailer has not paid, a supplier's
 * rejection/cancellation lowers the amount due; if every group is gone the payment is cancelled.
 * Submitted or paid payments are never changed here — any overpayment becomes "refund due".
 */
export async function syncOpenPayment(orderId: string) {
  const payment = await prisma.payment.findFirst({ where: { orderId, status: { in: OPEN_FOR_RETAILER } }, orderBy: { createdAt: 'desc' } });
  if (!payment) return;
  const total = await activeOrderTotal(prisma, orderId);
  if (total === payment.amountPaise) return;
  await prisma.$transaction(async (tx) => {
    if (total === 0) {
      const r = await tx.payment.updateMany({ where: { id: payment.id, status: payment.status }, data: { status: 'CANCELLED', amountPaise: 0 } });
      if (r.count) await logPaymentEvent(tx, { paymentId: payment.id, type: 'CANCELLED', from: payment.status, to: 'CANCELLED', note: 'Every supplier group was rejected or cancelled before payment' });
    } else {
      const r = await tx.payment.updateMany({ where: { id: payment.id, status: payment.status, amountPaise: payment.amountPaise }, data: { amountPaise: total } });
      if (r.count) await logPaymentEvent(tx, { paymentId: payment.id, type: 'AMOUNT_UPDATED', from: payment.status, to: payment.status, note: `Amount due changed from ${payment.amountPaise} to ${total} paise after a supplier group was rejected or cancelled` });
    }
  });
}

/** Refund owed to the retailer on a settled payment: paid amount minus what is still being supplied, minus refunds recorded. */
export async function refundDuePaise(payment: Pick<Payment, 'orderId' | 'amountPaise' | 'refundedPaise' | 'status'>) {
  if (!SETTLED.includes(payment.status) && payment.status !== 'REFUNDED') return 0;
  const active = await activeOrderTotal(prisma, payment.orderId);
  return Math.max(0, payment.amountPaise - active - payment.refundedPaise);
}

/**
 * Fulfilment gate: an order placed with an online payment method may only move to processing /
 * dispatch once the payment is verified. Orders without a payment record (placed before payments
 * were enabled) keep the previous behaviour.
 */
export async function fulfilmentBlockedReason(orderId: string) {
  const payment = await prisma.payment.findFirst({ where: { orderId }, orderBy: { createdAt: 'desc' }, select: { status: true } });
  if (!payment || SETTLED.includes(payment.status)) return null;
  return 'Payment for this order has not been verified by Dhaaga Bazaar yet. You can confirm the order now; start processing or dispatch only after payment is verified.';
}

export const adminUserIds = async () => (await prisma.user.findMany({ where: { role: 'ADMIN', isActive: true }, select: { id: true } })).map((u) => u.id);

export async function notifyAdmins(type: string, title: string, body: string, link: string) {
  for (const id of await adminUserIds()) await notify(id, type, title, body, link);
}

/** Retailer-safe view of a payment (no admin notes beyond the rejection reason). */
export function retailerPaymentView(p: Payment & { events?: { type: string; toStatus: PaymentStatus | null; note: string | null; createdAt: Date }[] }) {
  return {
    id: p.id,
    status: p.status,
    method: p.method,
    amountPaise: p.amountPaise,
    refundedPaise: p.refundedPaise,
    internalReference: p.internalReference,
    reference: p.reference,
    hasReceipt: !!p.receiptKey,
    submittedAt: p.submittedAt,
    verifiedAt: p.verifiedAt,
    rejectionReason: p.status === 'REJECTED' ? p.rejectionReason : null,
    failureReason: p.status === 'FAILED' ? p.failureReason : null,
    provider: p.provider,
    gatewayMethod: p.gatewayMethod,
    submissionCount: p.submissionCount,
    createdAt: p.createdAt,
    history: (p.events ?? []).map((e) => ({ type: e.type, status: e.toStatus, note: e.type === 'REJECTED' || e.type === 'AMOUNT_UPDATED' || e.type === 'REFUND' || e.type === 'CANCELLED' ? e.note : null, at: e.createdAt })),
  };
}

export { maskReference };
