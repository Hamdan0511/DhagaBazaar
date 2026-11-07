import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { H, JPEG, FAKE_JPEG, PDF, addAddress, approvedSupplier, publishedProduct, registerRetailer, uid, type Agent } from './helpers.js';

/**
 * Manual UPI QR payments. Uses a throwaway test database and a test image as the "QR" — no real
 * QR, UPI ID or money is involved. Payment settings are switched off again after this file so
 * other test files keep the pre-payments checkout behaviour.
 */
const app = createApp();
const admin: Agent = request.agent(app);
const supA: Agent = request.agent(app);
const supB: Agent = request.agent(app);
const retailer: Agent = request.agent(app);
const other: Agent = request.agent(app);
let productA = '';
let productB = '';

const SETTINGS = { manualUpiEnabled: true, gatewayEnabled: false, upiId: 'test-only@testbank', beneficiaryName: 'TEST BENEFICIARY (automated test)', instructions: 'Test instructions', supportPhone: '+91 90000 00000', supportEmail: 'payments@test.invalid', paymentTerms: 'Test terms', refundPolicy: 'Test refunds' };
const utr = () => String(Date.now()).slice(-8) + String(Math.floor(Math.random() * 9000) + 1000);

async function stockOf(pid: string) {
  return (await prisma.product.findUniqueOrThrow({ where: { id: pid }, select: { stockQuantity: true } })).stockQuantity;
}

/** Fills the cart with one line from each supplier and checks out. */
async function checkout(agent: Agent, extra: Record<string, unknown> = {}, qty = 2) {
  expect((await agent.post('/api/cart/items').set(H).send({ productId: productA, lines: [{ quantity: qty }] })).status).toBeLessThan(300);
  expect((await agent.post('/api/cart/items').set(H).send({ productId: productB, lines: [{ quantity: qty }] })).status).toBeLessThan(300);
  const addressId = (await agent.get('/api/retailer/profile')).body.profile.addresses[0].id;
  return agent.post('/api/retailer/orders').set(H).send({ addressId, paymentMethod: 'UPI_QR', ...extra });
}

const submit = (agent: Agent, orderId: string, reference: string, receipt?: { buf: Buffer; name: string }) => {
  const r = agent.post(`/api/retailer/orders/${orderId}/payment/submit`).set(H).field('reference', reference);
  return receipt ? r.attach('receipt', receipt.buf, receipt.name) : r;
};

beforeAll(async () => {
  expect((await admin.post('/api/auth/login').set(H).send({ email: 'admin@test.local', password: 'Admin-test-password-1' })).status).toBe(200);
  await approvedSupplier(supA, admin);
  await approvedSupplier(supB, admin);
  productA = await publishedProduct(supA, admin, { title: 'Payment Test Belt A', price: 500, moq: 1, stockQuantity: 100 });
  productB = await publishedProduct(supB, admin, { title: 'Payment Test Belt B', price: 250, moq: 1, stockQuantity: 100 });
  for (const a of [retailer, other]) {
    await registerRetailer(app, a);
    await addAddress(a);
  }
});

afterAll(async () => {
  await prisma.paymentSettings.updateMany({ data: { manualUpiEnabled: false } });
  await prisma.$disconnect();
});

describe('payment settings (admin only)', () => {
  it('keeps settings and QR management away from retailers, suppliers and guests', async () => {
    for (const a of [retailer, supA]) {
      expect((await a.get('/api/admin/payment-settings')).status).toBe(403);
      expect((await a.put('/api/admin/payment-settings').set(H).send(SETTINGS)).status).toBe(403);
      expect((await a.post('/api/admin/payment-settings/qr').set(H).attach('qr', JPEG, 'qr.jpg')).status).toBe(403);
    }
    expect((await request(app).get('/api/admin/payment-settings')).status).toBe(401);
  });

  it('requires a QR and beneficiary before enabling, validates the image, and never enables a gateway', async () => {
    expect((await admin.put('/api/admin/payment-settings').set(H).send(SETTINGS)).status).toBe(422); // no QR yet
    expect((await admin.post('/api/admin/payment-settings/qr').set(H).attach('qr', FAKE_JPEG, 'qr.jpg')).status).toBe(422);
    expect((await admin.post('/api/admin/payment-settings/qr').set(H).attach('qr', PDF, 'qr.pdf')).status).toBe(400);
    const up = await admin.post('/api/admin/payment-settings/qr').set(H).attach('qr', JPEG, 'qr.jpg');
    expect(up.status).toBe(201);
    expect(up.body.settings.hasQr).toBe(true);
    const key = (await prisma.paymentSettings.findUniqueOrThrow({ where: { id: 'default' } })).qrStorageKey!;
    expect(key.startsWith('private/payments/qr/')).toBe(true);
    expect((await request(app).get(`/uploads/${key}`)).status).toBe(404); // not public
    expect((await admin.get('/api/admin/payment-settings/qr')).status).toBe(200);
    expect((await admin.put('/api/admin/payment-settings').set(H).send({ ...SETTINGS, gatewayEnabled: true })).status).toBe(422);
    expect((await admin.put('/api/admin/payment-settings').set(H).send({ ...SETTINGS, upiId: 'not a upi id' })).status).toBe(422);
    const ok = await admin.put('/api/admin/payment-settings').set(H).send(SETTINGS);
    expect(ok.status).toBe(200);
    expect(ok.body.settings).toMatchObject({ ready: true, manualUpiEnabled: true, gatewayEnabled: false });
    expect((await retailer.get('/api/retailer/payment-options')).body).toEqual({ upiQr: true, gateway: false });
  });
});

describe('checkout with UPI QR', () => {
  it('creates exactly one order with one pending payment for the server-computed amount, and replays a retried request', async () => {
    const key = `ck-${uid('k')}-abcdef`;
    const sA = await stockOf(productA);
    const r = await checkout(retailer, { idempotencyKey: key, amountPaise: 1, subtotalPaise: 1 });
    expect(r.status).toBe(201);
    expect(r.body.payment.status).toBe('PENDING');
    const orderId = r.body.order.id;
    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId } });
    expect(payment.amountPaise).toBe(2 * 50000 + 2 * 25000); // client-supplied amounts ignored
    expect(payment).toMatchObject({ method: 'UPI_QR', provider: 'MANUAL_UPI', internalReference: `PAY-${r.body.order.orderNumber}` });
    expect(await stockOf(productA)).toBe(sA! - 2); // stock reserved as before

    // Retried request (refresh / double click): same order, no new order or payment.
    const addressId = (await retailer.get('/api/retailer/profile')).body.profile.addresses[0].id;
    const again = await retailer.post('/api/retailer/orders').set(H).send({ addressId, idempotencyKey: key, paymentMethod: 'UPI_QR' });
    expect(again.status).toBe(200);
    expect(again.body.order.id).toBe(orderId);
    expect(await prisma.order.count({ where: { id: orderId } })).toBe(1);
    expect(await prisma.payment.count({ where: { orderId } })).toBe(1);
    // Another retailer cannot replay someone else's key.
    expect((await other.post('/api/retailer/orders').set(H).send({ addressId: 'x', idempotencyKey: key })).status).toBe(409);

    // Retailer order detail reflects the payment.
    const detail = await retailer.get(`/api/retailer/orders/${orderId}`);
    expect(detail.body.order.payment).toMatchObject({ status: 'PENDING', amountPaise: 150000 });
  });

  it('shows the QR only to the ordering retailer, with the authoritative amount', async () => {
    const orderId = (await checkout(retailer)).body.order.id;
    const view = await retailer.get(`/api/retailer/orders/${orderId}/payment`);
    expect(view.status).toBe(200);
    expect(view.body.payment.amountPaise).toBe(150000);
    expect(view.body.instructions).toMatchObject({ beneficiaryName: SETTINGS.beneficiaryName, upiId: SETTINGS.upiId });
    expect(view.body.instructions.upiUri).toContain('am=1500.00');
    expect((await retailer.get(view.body.instructions.qrUrl)).status).toBe(200);
    expect((await other.get(`/api/retailer/orders/${orderId}/payment`)).status).toBe(404);
    expect((await other.get(`/api/retailer/orders/${orderId}/payment/qr`)).status).toBe(404);
    expect((await supA.get(`/api/retailer/orders/${orderId}/payment`)).status).toBe(403);
    expect((await request(app).get(`/api/retailer/orders/${orderId}/payment/qr`)).status).toBe(401);
  });
});

describe('retailer submission', () => {
  it('records a UTR and receipt as pending verification — never as paid — and keeps the receipt private', async () => {
    const orderId = (await checkout(retailer)).body.order.id;
    const ref = utr();
    const r = await submit(retailer, orderId, ref, { buf: JPEG, name: 'receipt.jpg' });
    expect(r.status).toBe(200);
    expect(r.body.payment).toMatchObject({ status: 'SUBMITTED', reference: ref, hasReceipt: true });
    const p = await prisma.payment.findFirstOrThrow({ where: { orderId } });
    expect(p.status).toBe('SUBMITTED');
    expect(p.paidAt).toBeNull();
    expect(p.receiptKey!.startsWith('private/payments/receipts/')).toBe(true);
    // Same submission again is idempotent; a different one is refused while pending.
    expect((await submit(retailer, orderId, ref)).body.duplicate).toBe(true);
    expect((await submit(retailer, orderId, utr())).status).toBe(409);
    // Receipt: owner and admin only.
    expect((await retailer.get(`/api/retailer/orders/${orderId}/payment/receipt`)).status).toBe(200);
    expect((await other.get(`/api/retailer/orders/${orderId}/payment/receipt`)).status).toBe(404);
    expect((await supA.get(`/api/admin/payments/${p.id}/receipt`)).status).toBe(403);
    expect((await request(app).get(`/uploads/${p.receiptKey}`)).status).toBe(404);
    expect((await admin.get(`/api/admin/payments/${p.id}/receipt`)).status).toBe(200);
    // Admins were notified.
    expect(await prisma.notification.count({ where: { type: 'PAYMENT_SUBMITTED', link: `/admin/payments/${p.id}` } })).toBeGreaterThan(0);
  });

  it('rejects another retailer, bad references, unsafe receipts and a UTR already used on another order', async () => {
    const o1 = (await checkout(retailer)).body.order.id;
    const o2 = (await checkout(retailer)).body.order.id;
    expect((await submit(other, o1, utr())).status).toBe(404);
    expect((await submit(retailer, o1, '12')).status).toBe(422);
    expect((await submit(retailer, o1, utr(), { buf: Buffer.from('<script>alert(1)</script>'), name: 'r.jpg' })).status).toBe(400);
    const ref = utr();
    expect((await submit(retailer, o1, ref)).status).toBe(200);
    expect((await submit(retailer, o2, ref)).status).toBe(409);
    expect((await prisma.payment.findFirstOrThrow({ where: { orderId: o2 } })).status).toBe('PENDING');
  });

  it('gives retailers no way to mark a payment paid or change its amount', async () => {
    const orderId = (await checkout(retailer)).body.order.id;
    const p = await prisma.payment.findFirstOrThrow({ where: { orderId } });
    expect((await retailer.post(`/api/admin/payments/${p.id}/verify`).set(H).send({})).status).toBe(403);
    await retailer.post(`/api/retailer/orders/${orderId}/payment/submit`).set(H).send({ reference: utr(), amountPaise: 100, status: 'PAID' });
    const after = await prisma.payment.findUniqueOrThrow({ where: { id: p.id } });
    expect(after.amountPaise).toBe(150000);
    expect(after.status).toBe('SUBMITTED');
  });
});

describe('admin verification', () => {
  it('verifies once, records who and when, notifies retailer and suppliers, and unlocks fulfilment', async () => {
    const orderId = (await checkout(retailer)).body.order.id;
    const so = await prisma.supplierOrder.findFirstOrThrow({ where: { orderId, supplier: { products: { some: { id: productA } } } } });
    // Supplier may confirm as before, but cannot process/dispatch before payment is verified.
    expect((await supA.post(`/api/supplier/orders/${so.id}/status`).set(H).send({ status: 'CONFIRMED' })).status).toBe(200);
    expect((await supA.post(`/api/supplier/orders/${so.id}/status`).set(H).send({ status: 'PROCESSING' })).status).toBe(422);
    expect((await supA.post(`/api/supplier/orders/${so.id}/dispatch`).set(H).send({ carrier: 'VRL', trackingNumber: 'LR-1' })).status).toBe(422);
    expect((await supA.get(`/api/supplier/orders/${so.id}`)).body.order.order.payments[0].status).toBe('PENDING');

    const ref = utr();
    await submit(retailer, orderId, ref);
    const p = await prisma.payment.findFirstOrThrow({ where: { orderId } });
    expect((await supA.post(`/api/admin/payments/${p.id}/verify`).set(H).send({})).status).toBe(403); // suppliers can't mark paid
    expect((await admin.post(`/api/admin/payments/${p.id}/verify`).set(H).send({ note: 'Seen in HDFC statement' })).status).toBe(200);
    expect((await admin.post(`/api/admin/payments/${p.id}/verify`).set(H).send({})).status).toBe(409); // only once
    expect((await admin.post(`/api/admin/payments/${p.id}/reject`).set(H).send({ reason: 'Changed my mind' })).status).toBe(409); // no conflicting transition
    const paid = await prisma.payment.findUniqueOrThrow({ where: { id: p.id } });
    expect(paid).toMatchObject({ status: 'PAID' });
    expect(paid.verifiedById).toBeTruthy();
    expect(paid.verifiedAt).toBeTruthy();
    expect(await prisma.auditLog.count({ where: { action: 'payment.verified', entityId: p.id } })).toBe(1);
    expect(await prisma.notification.count({ where: { type: 'PAYMENT_VERIFIED', link: `/account/orders/${orderId}` } })).toBe(1);
    expect(await prisma.notification.count({ where: { type: 'PAYMENT_VERIFIED', link: { startsWith: '/supplier/orders/' } } })).toBeGreaterThan(0);
    expect((await retailer.get(`/api/retailer/orders/${orderId}`)).body.order.payment.status).toBe('PAID');
    // Now the supplier may fulfil.
    expect((await supA.post(`/api/supplier/orders/${so.id}/dispatch`).set(H).send({ carrier: 'VRL', trackingNumber: 'LR-1' })).status).toBe(201);
  });

  it('requires a reason to reject; rejection does not mark paid and lets the retailer resubmit', async () => {
    const orderId = (await checkout(retailer)).body.order.id;
    await submit(retailer, orderId, utr());
    const p = await prisma.payment.findFirstOrThrow({ where: { orderId } });
    expect((await admin.post(`/api/admin/payments/${p.id}/reject`).set(H).send({})).status).toBe(422);
    expect((await admin.post(`/api/admin/payments/${p.id}/reject`).set(H).send({ reason: 'No' })).status).toBe(422);
    expect((await admin.post(`/api/admin/payments/${p.id}/reject`).set(H).send({ reason: 'No credit with this UTR was found.' })).status).toBe(200);
    const rejected = await prisma.payment.findUniqueOrThrow({ where: { id: p.id } });
    expect(rejected).toMatchObject({ status: 'REJECTED', paidAt: null, rejectionReason: 'No credit with this UTR was found.' });
    expect(await prisma.notification.count({ where: { type: 'PAYMENT_REJECTED', link: `/account/orders/${orderId}/pay` } })).toBe(1);
    const soA = await prisma.supplierOrder.findFirstOrThrow({ where: { orderId, supplier: { products: { some: { id: productA } } } } });
    expect((await supA.post(`/api/supplier/orders/${soA.id}/status`).set(H).send({ status: 'CONFIRMED' })).status).toBe(200);
    expect((await supA.post(`/api/supplier/orders/${soA.id}/dispatch`).set(H).send({ carrier: 'VRL', trackingNumber: 'X' })).status).toBe(422);
    // Resubmission reuses the same payment record.
    expect((await submit(retailer, orderId, utr())).status).toBe(200);
    expect(await prisma.payment.count({ where: { orderId } })).toBe(1);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: p.id } })).submissionCount).toBe(2);
  });

  it('lists and searches payments with counts', async () => {
    const list = await admin.get('/api/admin/payments?status=SUBMITTED');
    expect(list.status).toBe(200);
    expect(list.body.counts.SUBMITTED).toBeGreaterThan(0);
    expect(list.body.payments.every((p: { status: string }) => p.status === 'SUBMITTED')).toBe(true);
    const one = list.body.payments[0];
    const byOrder = await admin.get(`/api/admin/payments?q=${one.order.orderNumber}`);
    expect(byOrder.body.payments.map((p: { id: string }) => p.id)).toContain(one.id);
    const byUtr = await admin.get(`/api/admin/payments?q=${one.reference}`);
    expect(byUtr.body.payments.map((p: { id: string }) => p.id)).toContain(one.id);
    expect((await admin.get('/api/admin/payments?minRupees=999999')).body.payments).toHaveLength(0);
    expect((await supA.get('/api/admin/payments')).status).toBe(403);
  });
});

describe('supplier changes, refunds and cancellation', () => {
  it('lowers the amount due when a supplier rejects before payment, and returns stock', async () => {
    const orderId = (await checkout(retailer)).body.order.id;
    const soB = await prisma.supplierOrder.findFirstOrThrow({ where: { orderId, supplier: { products: { some: { id: productB } } } } });
    const before = await stockOf(productB);
    expect((await supB.post(`/api/supplier/orders/${soB.id}/status`).set(H).send({ status: 'REJECTED' })).status).toBe(200);
    expect(await stockOf(productB)).toBe(before! + 2);
    expect((await retailer.get(`/api/retailer/orders/${orderId}/payment`)).body.payment.amountPaise).toBe(100000);
  });

  it('records refund due after payment when a group is cancelled, caps refunds, and closes fully refunded payments', async () => {
    const orderId = (await checkout(retailer)).body.order.id;
    await submit(retailer, orderId, utr());
    const p = await prisma.payment.findFirstOrThrow({ where: { orderId } });
    expect((await admin.post(`/api/admin/payments/${p.id}/refunds`).set(H).send({ amountPaise: 100, note: 'Too early' })).status).toBe(422); // not verified yet
    await admin.post(`/api/admin/payments/${p.id}/verify`).set(H).send({});
    const soB = await prisma.supplierOrder.findFirstOrThrow({ where: { orderId, supplier: { products: { some: { id: productB } } } } });
    expect((await supB.post(`/api/supplier/orders/${soB.id}/status`).set(H).send({ status: 'REJECTED' })).status).toBe(200);
    const detail = await admin.get(`/api/admin/payments/${p.id}`);
    expect(detail.body.payment.amountPaise).toBe(150000); // a paid amount is never rewritten
    expect(detail.body.payment.refundDuePaise).toBe(50000);
    expect((await admin.post(`/api/admin/payments/${p.id}/refunds`).set(H).send({ amountPaise: 999999, note: 'Too much' })).status).toBe(422);
    expect((await admin.post(`/api/admin/payments/${p.id}/refunds`).set(H).send({ amountPaise: 50000, supplierOrderId: soB.id, note: 'Supplier B rejected the group', reference: utr() })).status).toBe(201);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe('PARTIALLY_REFUNDED');
    expect((await admin.get(`/api/admin/payments/${p.id}`)).body.payment.refundDuePaise).toBe(0);
    expect((await admin.post(`/api/admin/payments/${p.id}/refunds`).set(H).send({ amountPaise: 100000, note: 'Rest of the order' })).status).toBe(201);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe('REFUNDED');
    expect(await prisma.notification.count({ where: { type: 'PAYMENT_REFUNDED', link: `/account/orders/${orderId}` } })).toBe(2);
  });

  it('cancels an unpaid order for non-payment and releases all reserved stock', async () => {
    const sA = await stockOf(productA);
    const orderId = (await checkout(retailer)).body.order.id;
    expect(await stockOf(productA)).toBe(sA! - 2);
    const p = await prisma.payment.findFirstOrThrow({ where: { orderId } });
    expect((await admin.post(`/api/admin/payments/${p.id}/cancel-order`).set(H).send({})).status).toBe(422);
    expect((await admin.post(`/api/admin/payments/${p.id}/cancel-order`).set(H).send({ reason: 'Not paid within 7 days' })).status).toBe(200);
    expect(await stockOf(productA)).toBe(sA);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('CANCELLED');
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe('CANCELLED');
    expect((await submit(retailer, orderId, utr())).status).toBe(422);
  });
});

describe('when payments are switched off', () => {
  it('checkout keeps the previous order-request behaviour (no payment record, fulfilment not gated)', async () => {
    await admin.put('/api/admin/payment-settings').set(H).send({ ...SETTINGS, manualUpiEnabled: false });
    expect((await retailer.get('/api/retailer/payment-options')).body.upiQr).toBe(false);
    expect((await checkout(retailer, {}, 1)).status).toBe(422); // UPI explicitly requested but unavailable
    const addressId = (await retailer.get('/api/retailer/profile')).body.profile.addresses[0].id;
    const r = await retailer.post('/api/retailer/orders').set(H).send({ addressId });
    expect(r.status).toBe(201);
    expect(r.body.payment).toBeNull();
    expect(await prisma.payment.count({ where: { orderId: r.body.order.id } })).toBe(0);
    expect((await retailer.get(`/api/retailer/orders/${r.body.order.id}/payment`)).status).toBe(404);
  });
});
