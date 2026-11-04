import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { H, JPEG, PDF, addAddress, approvedSupplier, registerRetailer, uid, type Agent } from './helpers.js';

const app = createApp();
const admin: Agent = request.agent(app);

async function registerSupplier(agent: Agent) {
  const r = await agent.post('/api/auth/register').set(H).send({
    fullName: 'Meena Iyer', phone: '9845012345', password: 'Strong2024', confirmPassword: 'Strong2024', addressLine: '7 Chickpet Main Road',
    city: 'Bengaluru', state: 'Karnataka', pincode: '560053', acceptTerms: true, email: `${uid('review')}@supplier.test`, businessName: uid('Review Weavers'),
    businessType: 'MANUFACTURER', categoryPaths: ['womens-wear/sarees'], description: 'Handloom silk sarees woven in our own units.',
  });
  expect(r.status).toBe(201);
  return r.body.user as { id: string; supplier: { id: string; businessName: string } };
}

const notificationsFor = (userId: string) => prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
const auditFor = (supplierId: string) => prisma.auditLog.findMany({ where: { entityType: 'Supplier', entityId: supplierId }, orderBy: { createdAt: 'asc' } });

beforeAll(async () => {
  expect((await admin.post('/api/auth/login').set(H).send({ email: 'admin@test.local', password: 'Admin-test-password-1' })).status).toBe(200);
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe('supplier application review', () => {
  it('lists pending applications with search, filters and pagination', async () => {
    const a = request.agent(app);
    const user = await registerSupplier(a);
    const list = await admin.get(`/api/admin/suppliers?status=PENDING_REVIEW&q=${encodeURIComponent(user.supplier.businessName)}&pageSize=5`);
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(1);
    expect(list.body.suppliers[0]).toMatchObject({ businessName: user.supplier.businessName, contactName: 'Meena Iyer', city: 'Bengaluru', state: 'Karnataka', status: 'PENDING_REVIEW' });
    expect(list.body.suppliers[0].user.email).toMatch(/@supplier\.test$/);
    expect((await admin.get('/api/admin/suppliers?businessType=WHOLESALER&q=' + encodeURIComponent(user.supplier.businessName))).body.total).toBe(0);
    expect((await admin.get('/api/admin/suppliers?sort=bogus')).status).toBe(400);
  });

  it('requests more information, lets the supplier resubmit, then rejects with a saved reason', async () => {
    const a = request.agent(app);
    const user = await registerSupplier(a);
    const id = user.supplier.id;

    // A reason is mandatory for anything other than approval.
    expect((await admin.post(`/api/admin/suppliers/${id}/decision`).set(H).send({ decision: 'INFO_REQUESTED' })).status).toBe(422);
    const ask = await admin.post(`/api/admin/suppliers/${id}/decision`).set(H).send({ decision: 'INFO_REQUESTED', reason: 'Please add your GSTIN and a clearer shop address.' });
    expect(ask.status).toBe(200);
    let me = (await a.get('/api/supplier/overview')).body;
    expect(me).toMatchObject({ status: 'INFO_REQUESTED', infoRequest: 'Please add your GSTIN and a clearer shop address.' });
    expect((await notificationsFor(user.id)).at(-1)).toMatchObject({ type: 'SUPPLIER_INFO_REQUESTED', title: 'Additional information required' });

    // A supplier can't be approved by another role, and info can't be re-requested before they respond.
    expect((await a.post(`/api/admin/suppliers/${id}/decision`).set(H).send({ decision: 'APPROVED' })).status).toBe(403);
    expect((await admin.post(`/api/admin/suppliers/${id}/decision`).set(H).send({ decision: 'INFO_REQUESTED', reason: 'Again please' })).status).toBe(422);

    expect((await a.post('/api/supplier/submit').set(H)).status).toBe(200);
    me = (await a.get('/api/supplier/overview')).body;
    expect(me).toMatchObject({ status: 'PENDING_REVIEW', infoRequest: null });

    const reject = await admin.post(`/api/admin/suppliers/${id}/decision`).set(H).send({ decision: 'REJECTED', reason: 'GSTIN does not match the business name.' });
    expect(reject.status).toBe(200);
    const row = await prisma.supplier.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ status: 'REJECTED', rejectionReason: 'GSTIN does not match the business name.', isVerified: false, approvedAt: null });
    expect(row.reviewedById).toBeTruthy();
    expect((await notificationsFor(user.id)).at(-1)).toMatchObject({ type: 'SUPPLIER_REJECTED', title: 'Your application requires attention', body: 'GSTIN does not match the business name.' });
    expect((await auditFor(id)).map((l) => l.action)).toEqual(expect.arrayContaining(['supplier.info_requested', 'supplier.resubmitted', 'supplier.rejected']));
  });

  it('approves an application, records the reviewer and time, and notifies the supplier', async () => {
    const a = request.agent(app);
    const user = await registerSupplier(a);
    const before = Date.now();
    expect((await admin.post(`/api/admin/suppliers/${user.supplier.id}/decision`).set(H).send({ decision: 'APPROVED' })).status).toBe(200);
    const row = await prisma.supplier.findUniqueOrThrow({ where: { id: user.supplier.id } });
    const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@test.local' } });
    expect(row.status).toBe('APPROVED');
    expect(row.reviewedById).toBe(adminUser.id);
    expect(row.approvedAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
    // Approval is not verification.
    expect(row.isVerified).toBe(false);
    expect((await notificationsFor(user.id)).at(-1)).toMatchObject({ type: 'SUPPLIER_APPROVED', title: 'Your supplier account has been approved' });
    const log = (await auditFor(user.supplier.id)).at(-1)!;
    expect(log).toMatchObject({ action: 'supplier.approved', actorId: adminUser.id });
    expect(log.metadata).toMatchObject({ from: 'PENDING_REVIEW', to: 'APPROVED' });
    const detail = await admin.get(`/api/admin/suppliers/${user.supplier.id}`);
    expect(detail.body.reviewer.email).toBe('admin@test.local');
    expect(detail.body.history.some((h: { action: string }) => h.action === 'supplier.approved')).toBe(true);
  });

  it('keeps verification documents private and logs every admin view', async () => {
    const a = request.agent(app);
    const user = await registerSupplier(a);
    const up = await a.post('/api/supplier/documents').set(H).field('type', 'GST_CERTIFICATE').attach('file', PDF, 'gst.pdf');
    expect(up.status).toBe(201);
    const docId = up.body.document.id as string;
    const queue = await admin.get('/api/admin/documents?status=PENDING');
    expect(queue.body.documents.some((d: { id: string }) => d.id === docId)).toBe(true);
    // The supplier, another supplier, a retailer and a guest cannot read it.
    const other = request.agent(app);
    await registerSupplier(other);
    const retailer = request.agent(app);
    await registerRetailer(app, retailer);
    for (const agent of [a, other, retailer, request(app)]) expect([401, 403]).toContain((await agent.get(`/api/admin/documents/${docId}/file`)).status);
    expect((await other.get('/api/admin/documents')).status).toBe(403);
    const view = await admin.get(`/api/admin/documents/${docId}/file?download=1`);
    expect(view.status).toBe(200);
    expect(view.headers['content-disposition']).toMatch(/^attachment/);
    const logged = await prisma.auditLog.findFirst({ where: { entityType: 'SupplierDocument', entityId: docId, action: 'document.downloaded' } });
    expect(logged).toBeTruthy();
    // Rejecting a document tells the supplier why.
    expect((await admin.post(`/api/admin/documents/${docId}/review`).set(H).send({ status: 'REJECTED', note: 'The certificate is cropped.' })).status).toBe(200);
    expect((await notificationsFor(user.id)).at(-1)).toMatchObject({ type: 'DOCUMENT_REJECTED' });
  });

  it('reports genuine counts on the overview', async () => {
    const r = await admin.get('/api/admin/overview');
    expect(r.status).toBe(200);
    const s = r.body.stats;
    expect(s.totalSuppliers).toBe(await prisma.supplier.count({ where: { isFixture: false } }));
    expect(s.pendingSuppliers).toBe(await prisma.supplier.count({ where: { isFixture: false, status: 'PENDING_REVIEW' } }));
    expect(s.totalRetailers).toBe(await prisma.retailer.count());
    expect(s.publishedProducts).toBe(await prisma.product.count({ where: { isFixture: false, status: 'APPROVED' } }));
  });
});

describe('product photos and volume pricing', () => {
  it('reorders photos (first = primary) only for the owner', async () => {
    const a = request.agent(app);
    await approvedSupplier(a, admin);
    const p = await a.post('/api/supplier/products').set(H).send({ title: 'Photo order listing', description: 'Listing used to test photo ordering.', categoryPath: 'accessories/belts', price: 100, priceUnit: 'PIECE', moq: 1 });
    const id = p.body.product.id as string;
    const up = await a.post(`/api/supplier/products/${id}/images`).set(H).field('usageRights', 'SUPPLIER_OWNED').attach('images', JPEG, '1.jpg').attach('images', Buffer.concat([JPEG, Buffer.from('second')]), '2.jpg'); // two different photos (identical files are refused)
    expect(up.status).toBe(201);
    const [first, second] = up.body.images.map((i: { id: string }) => i.id);
    expect((await a.put(`/api/supplier/products/${id}/images/order`).set(H).send({ imageIds: [second, first] })).status).toBe(200);
    const imgs = await prisma.productImage.findMany({ where: { productId: id }, orderBy: { sortOrder: 'asc' } });
    expect(imgs.map((i) => i.id)).toEqual([second, first]);
    expect((await a.put(`/api/supplier/products/${id}/images/order`).set(H).send({ imageIds: [first] })).status).toBe(422);
    const intruder = request.agent(app);
    await approvedSupplier(intruder, admin);
    expect((await intruder.put(`/api/supplier/products/${id}/images/order`).set(H).send({ imageIds: [first, second] })).status).toBe(404);
  });

  it('validates price tiers and charges the tier price at checkout', async () => {
    const s = request.agent(app);
    await approvedSupplier(s, admin);
    // A category no other test file publishes into (test files share one database).
    const base = { title: 'Tiered handloom stole', description: 'Handloom stole with volume pricing for bulk buyers.', categoryPath: 'accessories/stoles', price: 500, priceUnit: 'PIECE', moq: 10 };
    expect((await s.post('/api/supplier/products').set(H).send({ ...base, priceTiers: [{ minQty: 5, price: 450 }] })).status).toBe(422);
    expect((await s.post('/api/supplier/products').set(H).send({ ...base, priceTiers: [{ minQty: 50, price: 550 }] })).status).toBe(422);
    const p = await s.post('/api/supplier/products').set(H).send({ ...base, priceTiers: [{ minQty: 100, price: 400 }, { minQty: 50, price: 450 }] });
    expect(p.status).toBe(201);
    expect(p.body.product.priceTiers).toEqual([{ minQty: 50, pricePaise: 45000 }, { minQty: 100, pricePaise: 40000 }]);
    const id = p.body.product.id as string;
    await s.post(`/api/supplier/products/${id}/images`).set(H).field('usageRights', 'SUPPLIER_OWNED').attach('images', JPEG, 'k.jpg');
    expect((await s.post(`/api/supplier/products/${id}/submit`).set(H)).status).toBe(200);
    expect((await admin.post(`/api/admin/products/${id}/decision`).set(H).send({ decision: 'APPROVED' })).status).toBe(200);

    const r = request.agent(app);
    await registerRetailer(app, r);
    const add = await r.post('/api/cart/items').set(H).send({ productId: id, lines: [{ quantity: 60 }] });
    expect(add.status, JSON.stringify(add.body)).toBe(201);
    const cart = (await r.get('/api/cart')).body;
    expect(cart.suppliers[0].lines[0]).toMatchObject({ unitPricePaise: 45000, basePricePaise: 50000, lineTotalPaise: 45000 * 60 });
    const addressId = await addAddress(r);
    const order = await r.post('/api/retailer/orders').set(H).send({ addressId });
    expect(order.status).toBe(201);
    const item = await prisma.orderItem.findFirstOrThrow({ where: { productId: id } });
    expect(item.unitPricePaise).toBe(45000);
  });
});
