import crypto from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { setRazorpayForTests, type RazorpayApi, type RzPayment } from '../lib/payments/razorpay.js';
import { H, addAddress, approvedSupplier, publishedProduct, registerRetailer, type Agent } from './helpers.js';

/**
 * Razorpay integration with a MOCKED Razorpay API (no network, no real payments). Signatures are
 * real HMAC-SHA256 with test-only secrets, so verification code is exercised for real.
 */
const KEY_SECRET = 'test_key_secret_for_automated_tests_only';
const WEBHOOK_SECRET = 'test_webhook_secret_for_automated_tests_only';
const app = createApp();
const admin: Agent = request.agent(app);
const supA: Agent = request.agent(app);
const supB: Agent = request.agent(app);
const retailer: Agent = request.agent(app);
const other: Agent = request.agent(app);
let productA = '';
let productB = '';

const rid = (prefix: string) => `${prefix}_${crypto.randomBytes(7).toString('hex')}`;
const fake = {
  orders: new Map<string, { id: string; amount: number; currency: string; receipt: string; status: string }>(),
  payments: new Map<string, RzPayment>(),
  calls: { createOrder: 0, capture: 0, refund: 0 },
  refundStatus: 'pending' as string,
  failNext: false,
};
const api: RazorpayApi = {
  async createOrder(p) {
    fake.calls.createOrder++;
    if (fake.failNext) {
      fake.failNext = false;
      throw Object.assign(new Error('Bad request'), { error: { description: 'Authentication failed' } });
    }
    const o = { id: rid('order'), amount: p.amount, currency: p.currency, receipt: p.receipt, status: 'created' };
    fake.orders.set(o.id, o);
    return o;
  },
  async fetchPayment(id) {
    const p = fake.payments.get(id);
    if (!p) throw new Error('not found');
    return { ...p };
  },
  async capturePayment(id, amount) {
    fake.calls.capture++;
    const p = fake.payments.get(id)!;
    expect(amount).toBe(p.amount);
    p.status = 'captured';
    return { ...p };
  },
  async fetchOrderPayments(orderId) {
    return [...fake.payments.values()].filter((p) => p.order_id === orderId);
  },
  async refund(paymentId, p) {
    fake.calls.refund++;
    return { id: rid('rfnd'), amount: p.amount, status: fake.refundStatus, payment_id: paymentId };
  },
};
const configure = () => setRazorpayForTests({ keyId: 'rzp_test_AutomatedTest01', keySecret: KEY_SECRET, webhookSecret: WEBHOOK_SECRET, mode: 'test', configured: true, api });

/** Simulates the customer completing Checkout: Razorpay records a payment for the order. */
function customerPays(orderId: string, status: RzPayment['status'] = 'captured', amount?: number) {
  const o = fake.orders.get(orderId)!;
  const p: RzPayment = { id: rid('pay'), order_id: orderId, amount: amount ?? o.amount, currency: 'INR', status, method: 'upi', error_description: status === 'failed' ? 'Payment declined by the customer bank' : null };
  fake.payments.set(p.id, p);
  return p;
}
const sign = (orderId: string, paymentId: string, secret = KEY_SECRET) => crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
function webhook(body: unknown, opts: { eventId?: string; secret?: string; signature?: string } = {}) {
  const raw = JSON.stringify(body);
  const sig = opts.signature ?? crypto.createHmac('sha256', opts.secret ?? WEBHOOK_SECRET).update(raw).digest('hex');
  return request(app).post('/api/webhooks/razorpay').set('Content-Type', 'application/json').set('X-Razorpay-Signature', sig).set('x-razorpay-event-id', opts.eventId ?? rid('evt')).send(raw);
}
const paymentEvent = (event: string, p: RzPayment) => ({ entity: 'event', event, payload: { payment: { entity: p } } });

async function checkout(agent: Agent, qty = 2) {
  await agent.post('/api/cart/items').set(H).send({ productId: productA, lines: [{ quantity: qty }] });
  await agent.post('/api/cart/items').set(H).send({ productId: productB, lines: [{ quantity: qty }] });
  const addressId = (await agent.get('/api/retailer/profile')).body.profile.addresses[0].id;
  const r = await agent.post('/api/retailer/orders').set(H).send({ addressId, paymentMethod: 'RAZORPAY' });
  expect(r.status).toBe(201);
  return r.body.order.id as string;
}
const startPayment = (agent: Agent, orderId: string) => agent.post(`/api/retailer/orders/${orderId}/payment/razorpay/order`).set(H).send({});
const verify = (agent: Agent, orderId: string, b: Record<string, string>) => agent.post(`/api/retailer/orders/${orderId}/payment/razorpay/verify`).set(H).send(b);
const paymentOf = (orderId: string) => prisma.payment.findFirstOrThrow({ where: { orderId } });
const stockOf = async (pid: string) => (await prisma.product.findUniqueOrThrow({ where: { id: pid } })).stockQuantity!;

beforeAll(async () => {
  expect((await admin.post('/api/auth/login').set(H).send({ email: 'admin@test.local', password: 'Admin-test-password-1' })).status).toBe(200);
  await approvedSupplier(supA, admin);
  await approvedSupplier(supB, admin);
  productA = await publishedProduct(supA, admin, { title: 'Razorpay Test Belt A', price: 500, moq: 1, stockQuantity: 200 });
  productB = await publishedProduct(supB, admin, { title: 'Razorpay Test Belt B', price: 250, moq: 1, stockQuantity: 200 });
  for (const a of [retailer, other]) {
    await registerRetailer(app, a);
    await addAddress(a);
  }
});
beforeEach(() => configure());
afterAll(async () => {
  await prisma.paymentSettings.updateMany({ data: { gatewayEnabled: false } });
  setRazorpayForTests(null);
  await prisma.$disconnect();
});

describe('configuration', () => {
  it('cannot be enabled without server keys; with test keys the admin sees test mode and the webhook URL, never the secret', async () => {
    setRazorpayForTests(null);
    expect((await admin.put('/api/admin/payment-settings').set(H).send({ manualUpiEnabled: false, gatewayEnabled: true })).status).toBe(422);
    configure();
    const r = await admin.put('/api/admin/payment-settings').set(H).send({ manualUpiEnabled: false, gatewayEnabled: true });
    expect(r.status).toBe(200);
    expect(r.body.settings.gateway).toMatchObject({ provider: 'RAZORPAY', configured: true, mode: 'test', ready: true });
    expect(r.body.settings.gateway.webhookUrl).toMatch(/\/api\/webhooks\/razorpay$/);
    expect(JSON.stringify(r.body)).not.toContain(KEY_SECRET);
    expect(JSON.stringify(r.body)).not.toContain(WEBHOOK_SECRET);
    expect((await retailer.get('/api/retailer/payment-options')).body).toEqual({ upiQr: false, gateway: true });
    expect((await supA.put('/api/admin/payment-settings').set(H).send({ manualUpiEnabled: false, gatewayEnabled: true })).status).toBe(403);
  });
});

describe('creating a Razorpay order', () => {
  it('uses the server amount, reuses the open order, exposes only the key id, and is owner-only', async () => {
    const orderId = await checkout(retailer);
    const pay = await paymentOf(orderId);
    expect(pay).toMatchObject({ status: 'PENDING', method: 'RAZORPAY', provider: 'RAZORPAY', amountPaise: 150000 });
    const before = fake.calls.createOrder;
    const r = await startPayment(retailer, orderId);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ keyId: 'rzp_test_AutomatedTest01', amountPaise: 150000, currency: 'INR', mode: 'test' });
    expect(fake.orders.get(r.body.razorpayOrderId)!.amount).toBe(150000);
    expect(JSON.stringify(r.body)).not.toContain(KEY_SECRET);
    const again = await startPayment(retailer, orderId);
    expect(again.body.razorpayOrderId).toBe(r.body.razorpayOrderId);
    expect(fake.calls.createOrder).toBe(before + 1);
    expect((await startPayment(other, orderId)).status).toBe(404);
    expect((await startPayment(supA, orderId)).status).toBe(403);
    expect((await request(app).post(`/api/retailer/orders/${orderId}/payment/razorpay/order`).set(H)).status).toBe(401);
  });

  it('reports a gateway outage without exposing provider details', async () => {
    const orderId = await checkout(retailer);
    fake.failNext = true;
    const r = await startPayment(retailer, orderId);
    expect(r.status).toBe(502);
    expect(r.body.error.code).toBe('GATEWAY_UNAVAILABLE');
    expect(JSON.stringify(r.body)).not.toMatch(/Authentication failed/);
  });
});

describe('checkout callback verification', () => {
  it('marks paid only after a valid signature AND Razorpay confirming the capture; replays are idempotent', async () => {
    const orderId = await checkout(retailer);
    const rzOrder = (await startPayment(retailer, orderId)).body.razorpayOrderId;
    const p = customerPays(rzOrder);
    // Forged / wrong signatures never mark paid.
    expect((await verify(retailer, orderId, { razorpay_order_id: rzOrder, razorpay_payment_id: p.id, razorpay_signature: sign(rzOrder, p.id, 'wrong-secret') })).status).toBe(400);
    expect((await verify(retailer, orderId, { razorpay_order_id: rzOrder, razorpay_payment_id: p.id, razorpay_signature: 'f'.repeat(64) })).status).toBe(400);
    expect((await paymentOf(orderId)).status).toBe('PENDING');
    // Another retailer cannot use this order's ids.
    expect((await verify(other, orderId, { razorpay_order_id: rzOrder, razorpay_payment_id: p.id, razorpay_signature: sign(rzOrder, p.id) })).status).toBe(404);

    const ok = await verify(retailer, orderId, { razorpay_order_id: rzOrder, razorpay_payment_id: p.id, razorpay_signature: sign(rzOrder, p.id) });
    expect(ok.status).toBe(200);
    expect(ok.body.outcome).toBe('paid');
    const paid = await paymentOf(orderId);
    expect(paid).toMatchObject({ status: 'PAID', providerPaymentId: p.id, gatewayMethod: 'upi', provider: 'RAZORPAY', amountPaise: 150000 });
    expect(paid.verifiedById).toBeNull(); // verified by the gateway, not a person
    const again = await verify(retailer, orderId, { razorpay_order_id: rzOrder, razorpay_payment_id: p.id, razorpay_signature: sign(rzOrder, p.id) });
    expect(again.body.outcome).toBe('paid');
    expect(await prisma.paymentEvent.count({ where: { paymentId: paid.id, type: 'GATEWAY_CAPTURED' } })).toBe(1);
    expect(await prisma.notification.count({ where: { type: 'PAYMENT_VERIFIED', link: `/account/orders/${orderId}` } })).toBe(1);
    // Suppliers may now fulfil.
    const soA = await prisma.supplierOrder.findFirstOrThrow({ where: { orderId, supplier: { products: { some: { id: productA } } } } });
    await supA.post(`/api/supplier/orders/${soA.id}/status`).set(H).send({ status: 'CONFIRMED' });
    expect((await supA.post(`/api/supplier/orders/${soA.id}/dispatch`).set(H).send({ carrier: 'VRL', trackingNumber: 'LR-RZ' })).status).toBe(201);
    // Retailer order detail reflects it.
    expect((await retailer.get(`/api/retailer/orders/${orderId}`)).body.order.payment).toMatchObject({ status: 'PAID', provider: 'RAZORPAY' });
  });

  it('does not trust a signed callback when Razorpay says the payment failed, and lets the retailer retry', async () => {
    const orderId = await checkout(retailer);
    const rzOrder = (await startPayment(retailer, orderId)).body.razorpayOrderId;
    const failed = customerPays(rzOrder, 'failed');
    const r = await verify(retailer, orderId, { razorpay_order_id: rzOrder, razorpay_payment_id: failed.id, razorpay_signature: sign(rzOrder, failed.id) });
    expect(r.body.outcome).toBe('failed');
    expect(await paymentOf(orderId)).toMatchObject({ status: 'FAILED', failureReason: 'Payment declined by the customer bank', paidAt: null });
    expect(await prisma.notification.count({ where: { type: 'PAYMENT_FAILED', link: `/account/orders/${orderId}/pay` } })).toBe(1);
    // Retry: the same order is reused (amount unchanged) and a second attempt succeeds.
    const retryOrder = (await startPayment(retailer, orderId)).body.razorpayOrderId;
    const ok = customerPays(retryOrder);
    expect((await verify(retailer, orderId, { razorpay_order_id: retryOrder, razorpay_payment_id: ok.id, razorpay_signature: sign(retryOrder, ok.id) })).body.outcome).toBe('paid');
    expect(await prisma.payment.count({ where: { orderId } })).toBe(1);
  });

  it('captures an authorized payment for exactly the order amount; refuses a mismatched amount', async () => {
    const o1 = await checkout(retailer);
    const z1 = (await startPayment(retailer, o1)).body.razorpayOrderId;
    const auth = customerPays(z1, 'authorized');
    const captures = fake.calls.capture;
    expect((await verify(retailer, o1, { razorpay_order_id: z1, razorpay_payment_id: auth.id, razorpay_signature: sign(z1, auth.id) })).body.outcome).toBe('paid');
    expect(fake.calls.capture).toBe(captures + 1);

    const o2 = await checkout(retailer);
    const z2 = (await startPayment(retailer, o2)).body.razorpayOrderId;
    const wrong = customerPays(z2, 'captured', 100);
    expect((await verify(retailer, o2, { razorpay_order_id: z2, razorpay_payment_id: wrong.id, razorpay_signature: sign(z2, wrong.id) })).body.outcome).toBe('amount_mismatch');
    expect((await paymentOf(o2)).status).toBe('PENDING');
    expect(await prisma.notification.count({ where: { type: 'PAYMENT_ATTENTION', title: 'Razorpay amount mismatch' } })).toBeGreaterThan(0);
  });
});

describe('webhooks', () => {
  it('rejects unsigned, badly signed or unconfigured deliveries', async () => {
    const orderId = await checkout(retailer);
    const z = (await startPayment(retailer, orderId)).body.razorpayOrderId;
    const p = customerPays(z);
    expect((await webhook(paymentEvent('payment.captured', p), { secret: 'not-the-secret' })).status).toBe(400);
    expect((await request(app).post('/api/webhooks/razorpay').set('Content-Type', 'application/json').send(JSON.stringify(paymentEvent('payment.captured', p)))).status).toBe(400);
    setRazorpayForTests({ keyId: 'rzp_test_AutomatedTest01', keySecret: KEY_SECRET, webhookSecret: null, configured: true, api });
    expect((await webhook(paymentEvent('payment.captured', p))).status).toBe(503);
    configure();
    expect((await paymentOf(orderId)).status).toBe('PENDING');
  });

  it('applies payment.captured once, ignores duplicate deliveries, and agrees with the checkout callback', async () => {
    const orderId = await checkout(retailer);
    const z = (await startPayment(retailer, orderId)).body.razorpayOrderId;
    const p = customerPays(z);
    const eventId = rid('evt');
    const first = await webhook(paymentEvent('payment.captured', p), { eventId });
    expect(first.status).toBe(200);
    expect(first.body.status).toBe('PROCESSED');
    expect((await paymentOf(orderId)).status).toBe('PAID');
    const dup = await webhook(paymentEvent('payment.captured', p), { eventId });
    expect(dup.body.duplicate).toBe(true);
    // order.paid for the same payment with a new event id, and the late checkout callback: no change.
    expect((await webhook(paymentEvent('order.paid', p))).status).toBe(200);
    expect((await verify(retailer, orderId, { razorpay_order_id: z, razorpay_payment_id: p.id, razorpay_signature: sign(z, p.id) })).body.outcome).toBe('paid');
    const pay = await paymentOf(orderId);
    expect(await prisma.paymentEvent.count({ where: { paymentId: pay.id, type: 'GATEWAY_CAPTURED' } })).toBe(1);
    expect(await prisma.paymentWebhookEvent.count({ where: { eventId } })).toBe(1);
  });

  it('flags a second successful payment for an already-paid order instead of overwriting it', async () => {
    const orderId = await checkout(retailer);
    const z = (await startPayment(retailer, orderId)).body.razorpayOrderId;
    const first = customerPays(z);
    await webhook(paymentEvent('payment.captured', first));
    const second = customerPays(z);
    const r = await webhook(paymentEvent('payment.captured', second));
    expect(r.status).toBe(200);
    const pay = await paymentOf(orderId);
    expect(pay.providerPaymentId).toBe(first.id);
    expect(await prisma.paymentEvent.count({ where: { paymentId: pay.id, type: 'DUPLICATE_GATEWAY_PAYMENT', reference: second.id } })).toBe(1);
  });

  it('records payment.failed, ignores events for unknown orders and unhandled event types', async () => {
    const orderId = await checkout(retailer);
    const z = (await startPayment(retailer, orderId)).body.razorpayOrderId;
    const f = customerPays(z, 'failed');
    expect((await webhook(paymentEvent('payment.failed', f))).body.status).toBe('PROCESSED');
    expect((await paymentOf(orderId)).status).toBe('FAILED');
    const stranger: RzPayment = { id: rid('pay'), order_id: rid('order'), amount: 100, currency: 'INR', status: 'captured' };
    expect((await webhook(paymentEvent('payment.captured', stranger))).body.status).toBe('IGNORED');
    expect((await webhook({ event: 'subscription.charged', payload: {} })).body.status).toBe('IGNORED');
  });

  it('records money received after an order was cancelled as paid with a full refund due', async () => {
    const sA = await stockOf(productA);
    const orderId = await checkout(retailer);
    const z = (await startPayment(retailer, orderId)).body.razorpayOrderId;
    const pay = await paymentOf(orderId);
    expect((await admin.post(`/api/admin/payments/${pay.id}/cancel-order`).set(H).send({ reason: 'Not paid in time' })).status).toBe(200);
    expect(await stockOf(productA)).toBe(sA); // stock released as before
    const late = customerPays(z);
    await webhook(paymentEvent('payment.captured', late));
    const detail = (await admin.get(`/api/admin/payments/${pay.id}`)).body.payment;
    expect(detail.status).toBe('PAID');
    expect(detail.refundDuePaise).toBe(150000);
  });
});

describe('admin: reconciliation and refunds', () => {
  it('syncs a payment whose callback and webhook never arrived', async () => {
    const orderId = await checkout(retailer);
    const z = (await startPayment(retailer, orderId)).body.razorpayOrderId;
    customerPays(z);
    const pay = await paymentOf(orderId);
    expect((await supA.post(`/api/admin/payments/${pay.id}/sync`).set(H)).status).toBe(403);
    const r = await admin.post(`/api/admin/payments/${pay.id}/sync`).set(H);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('PAID');
    const detail = (await admin.get(`/api/admin/payments/${pay.id}`)).body.payment;
    expect(detail.gateway.orders[0]).toMatchObject({ id: z, amountPaise: 150000, status: 'paid' });
    expect(detail.gateway.providerPaymentId).toMatch(/^pay_/);
  });

  it('refunds through Razorpay and follows refund.processed / refund.failed webhooks', async () => {
    const orderId = await checkout(retailer);
    const z = (await startPayment(retailer, orderId)).body.razorpayOrderId;
    await webhook(paymentEvent('payment.captured', customerPays(z)));
    const pay = await paymentOf(orderId);
    const calls = fake.calls.refund;
    expect((await admin.post(`/api/admin/payments/${pay.id}/refunds`).set(H).send({ amountPaise: 50000, note: 'Supplier B rejected' })).status).toBe(201);
    expect(fake.calls.refund).toBe(calls + 1);
    const r1 = await prisma.paymentRefund.findFirstOrThrow({ where: { paymentId: pay.id } });
    expect(r1).toMatchObject({ status: 'PENDING', amountPaise: 50000 });
    expect(r1.providerRefundId).toMatch(/^rfnd_/);
    await webhook({ event: 'refund.processed', payload: { refund: { entity: { id: r1.providerRefundId, amount: 50000, status: 'processed', payment_id: pay.providerPaymentId } } } });
    expect((await prisma.paymentRefund.findUniqueOrThrow({ where: { id: r1.id } })).status).toBe('PROCESSED');

    await admin.post(`/api/admin/payments/${pay.id}/refunds`).set(H).send({ amountPaise: 30000, note: 'Goodwill credit' });
    expect((await paymentOf(orderId)).refundedPaise).toBe(80000);
    const r2 = await prisma.paymentRefund.findFirstOrThrow({ where: { paymentId: pay.id, amountPaise: 30000 } });
    await webhook({ event: 'refund.failed', payload: { refund: { entity: { id: r2.providerRefundId, amount: 30000, status: 'failed', payment_id: pay.providerPaymentId } } } });
    const after = await paymentOf(orderId);
    expect(after).toMatchObject({ refundedPaise: 50000, status: 'PARTIALLY_REFUNDED' });
    expect((await prisma.paymentRefund.findUniqueOrThrow({ where: { id: r2.id } })).status).toBe('FAILED');
    // The refund history is kept, including the failed attempt.
    expect((await admin.get(`/api/admin/payments/${pay.id}`)).body.payment.refunds).toHaveLength(2);
  });

  it('filters and searches gateway payments', async () => {
    const list = await admin.get('/api/admin/payments?provider=RAZORPAY');
    expect(list.status).toBe(200);
    expect(list.body.payments.length).toBeGreaterThan(0);
    expect(list.body.payments.every((p: { provider: string }) => p.provider === 'RAZORPAY')).toBe(true);
    const one = list.body.payments.find((p: { providerPaymentId: string | null }) => p.providerPaymentId);
    const found = await admin.get(`/api/admin/payments?q=${one.providerPaymentId}`);
    expect(found.body.payments.map((p: { id: string }) => p.id)).toContain(one.id);
  });
});
