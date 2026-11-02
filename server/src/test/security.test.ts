import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { H, JPEG, addAddress, approvedSupplier, publishedProduct, registerRetailer, uid, type Agent } from './helpers.js';

const app = createApp();
const admin: Agent = request.agent(app);

beforeAll(async () => {
  expect((await admin.post('/api/auth/login').set(H).send({ email: 'admin@test.local', password: 'Admin-test-password-1' })).status).toBe(200);
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe('authentication & sessions', () => {
  it('ignores a role smuggled into registration', async () => {
    const a = request.agent(app);
    const r = await a.post('/api/auth/register').set(H).send({
      fullName: 'Sneaky', phone: '9876543210', password: 'secret123', city: 'Pune', acceptTerms: true, addressLine: '1 Market Road', state: 'Karnataka', pincode: '560002', confirmPassword: 'secret123', 
      email: `${uid('x')}@retailer.test`, businessName: 'Sneaky Shop', businessType: 'RETAILER', role: 'ADMIN',
    });
    expect(r.status).toBe(201);
    expect(r.body.user.role).toBe('RETAILER');
    expect((await a.get('/api/admin/overview')).status).toBe(403);
  });

  it('rejects forged and unsigned session tokens', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { role: 'ADMIN' } });
    const forged = jwt.sign({ sub: user.id, ver: user.tokenVersion }, 'not-the-real-secret', { issuer: 'dhaaga-bazaar' });
    const unsigned = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, ver: 0, iss: 'dhaaga-bazaar' })).toString('base64url')}.`;
    for (const token of [forged, unsigned, 'garbage']) {
      const r = await request(app).get('/api/admin/overview').set('Cookie', `db_session=${token}`);
      expect(r.status).toBe(401);
    }
  });

  it('invalidates sessions of deactivated users', async () => {
    const a = request.agent(app);
    const u = await registerRetailer(app, a);
    expect((await a.get('/api/auth/me')).body.user).not.toBeNull();
    expect((await admin.post(`/api/admin/users/${u.id}/active`).set(H).send({ isActive: false })).status).toBe(200);
    expect((await a.get('/api/auth/me')).body.user).toBeNull();
  });

  it('locks login for an account after repeated failures, regardless of IP', async () => {
    const a = request.agent(app);
    const u = await registerRetailer(app, a);
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const r = await request(app).post('/api/auth/login').set(H).set('X-Forwarded-For', `10.0.0.${i}`).send({ email: u.email, password: 'wrong-password-1' });
      statuses.push(r.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });

  it('does not trust X-Forwarded-For unless configured', () => {
    expect(app.get('trust proxy')).toBeFalsy();
  });
});

describe('authorization (IDOR / role boundaries)', () => {
  it('keeps suppliers, retailers and admins in their own lanes', async () => {
    const supA = request.agent(app);
    const supB = request.agent(app);
    await approvedSupplier(supA, admin);
    await approvedSupplier(supB, admin);
    const pid = await publishedProduct(supA, admin, { title: 'IDOR Probe Saree' });
    expect((await supB.get(`/api/supplier/products/${pid}`)).status).toBe(404);
    expect((await supB.put(`/api/supplier/products/${pid}`).set(H).send({ title: 'Hijacked title', description: 'x'.repeat(30), categoryPath: 'womens-wear/sarees', price: 1, priceUnit: 'PIECE', moq: 1 })).status).toBe(404);

    const r1 = request.agent(app);
    const r2 = request.agent(app);
    await registerRetailer(app, r1);
    await registerRetailer(app, r2);
    await r1.post('/api/cart/items').set(H).send({ productId: pid, lines: [{ quantity: 2 }] });
    const orderAddr = await addAddress(r1);
    const order = await r1.post('/api/retailer/orders').set(H).send({ addressId: orderAddr });
    expect(order.status).toBe(201);
    expect((await r2.get(`/api/retailer/orders/${order.body.order.id}`)).status).toBe(404);
    expect((await r1.get('/api/supplier/me')).status).toBe(403);
    expect((await supA.get('/api/retailer/orders')).status).toBe(403);
    expect((await supA.get('/api/admin/suppliers')).status).toBe(403);
    const so = await prisma.supplierOrder.findFirstOrThrow({ where: { orderId: order.body.order.id } });
    expect((await supB.post(`/api/supplier/orders/${so.id}/status`).set(H).send({ status: 'CONFIRMED' })).status).toBe(404);
  });

  it('serves verification documents only to admins, never from a public path', async () => {
    const sup = request.agent(app);
    const sid = await approvedSupplier(sup, admin);
    const doc = await prisma.supplierDocument.findFirstOrThrow({ where: { supplierId: sid } });
    expect((await request(app).get(`/uploads/${doc.storageKey}`)).status).toBe(404);
    expect((await sup.get(`/api/admin/documents/${doc.id}/file`)).status).toBe(403);
    const asAdmin = await admin.get(`/api/admin/documents/${doc.id}/file`);
    expect(asAdmin.status).toBe(200);
    // PDFs can't be sandboxed (Chrome refuses to render them) — they may only be framed by our own admin page.
    expect(asAdmin.headers['content-security-policy']).toMatch(/default-src 'none'; frame-ancestors 'self'/);
    expect(asAdmin.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('uploads', () => {
  it('does not expose unapproved product photos publicly', async () => {
    const sup = request.agent(app);
    await approvedSupplier(sup, admin);
    const draft = await sup.post('/api/supplier/products').set(H).send({ title: 'Unreviewed photo listing', description: 'x'.repeat(30), categoryPath: 'accessories/belts', price: 50, priceUnit: 'PIECE', moq: 1 });
    const pid = draft.body.product.id;
    const up = await sup.post(`/api/supplier/products/${pid}/images`).set(H).field('usageRights', 'SUPPLIER_OWNED').attach('images', JPEG, 'p.jpg');
    const url = up.body.images[0].url as string;
    expect((await request(app).get(url)).status).toBe(404); // guest, pending review
    expect((await sup.get(url)).status).toBe(200); // owner can preview
    expect((await admin.get(url)).status).toBe(200); // reviewer can see it
    await sup.post(`/api/supplier/products/${pid}/submit`).set(H);
    await admin.post(`/api/admin/products/${pid}/decision`).set(H).send({ decision: 'APPROVED' });
    const pub = await request(app).get(url);
    expect(pub.status).toBe(200);
    expect(pub.headers['content-type']).toMatch(/image\/jpeg/);
  });

  it('rejects oversized files', async () => {
    const sup = request.agent(app);
    await approvedSupplier(sup, admin);
    const big = Buffer.concat([JPEG, Buffer.alloc(9 * 1024 * 1024)]);
    const r = await sup.post('/api/supplier/documents').set(H).field('type', 'OTHER').attach('file', big, 'big.jpg');
    expect(r.status).toBe(400);
  });
});

describe('input validation', () => {
  it('only accepts http(s) tracking links', async () => {
    const sup = request.agent(app);
    await approvedSupplier(sup, admin);
    const pid = await publishedProduct(sup, admin, { title: 'Tracking Probe Saree' });
    const r = request.agent(app);
    await registerRetailer(app, r);
    await r.post('/api/cart/items').set(H).send({ productId: pid, lines: [{ quantity: 1 }] });
    const oAddr = await addAddress(r);
    const o = await r.post('/api/retailer/orders').set(H).send({ addressId: oAddr });
    const so = await prisma.supplierOrder.findFirstOrThrow({ where: { orderId: o.body.order.id } });
    await sup.post(`/api/supplier/orders/${so.id}/status`).set(H).send({ status: 'CONFIRMED' });
    for (const bad of ['javascript:alert(document.cookie)', 'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)']) {
      expect((await sup.post(`/api/supplier/orders/${so.id}/dispatch`).set(H).send({ carrier: 'VRL', trackingNumber: 'LR1', trackingUrl: bad })).status).toBe(422);
    }
    expect((await sup.post(`/api/supplier/orders/${so.id}/dispatch`).set(H).send({ carrier: 'VRL', trackingNumber: 'LR1', trackingUrl: 'https://track.example.com/LR1' })).status).toBe(201);
  });

  it('caps collection sizes and body size', async () => {
    const sup = request.agent(app);
    await approvedSupplier(sup, admin);
    const many = Array.from({ length: 5000 }, (_, i) => `womens-wear/x${i}`);
    expect((await sup.put('/api/supplier/profile').set(H).send({ businessName: 'Cap Test', businessType: 'WHOLESALER', contactName: 'ab', phone: '9876543210', addressLine: 'abc', city: 'ab', state: 'Karnataka', pincode: '560001', categoryPaths: many })).status).toBe(422);
    const attrs = Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [`k${i}`, 'v']));
    expect((await sup.post('/api/supplier/products').set(H).send({ title: 'Attr flood', description: 'x'.repeat(30), categoryPath: 'womens-wear/sarees', price: 1, priceUnit: 'PIECE', moq: 1, attributes: attrs })).status).toBe(422);
    const huge = await sup.post('/api/supplier/products').set(H).set('Content-Type', 'application/json').send(JSON.stringify({ title: 'x'.repeat(2 * 1024 * 1024) }));
    expect(huge.status).toBe(413);
  });

  it('returns client errors (not 500) for bad filters and missing records', async () => {
    expect((await admin.get('/api/admin/suppliers?status=BOGUS')).status).toBe(400);
    expect((await admin.get('/api/admin/products?status=BOGUS')).status).toBe(400);
    expect((await admin.patch('/api/admin/complaints/does-not-exist').set(H).send({ status: 'RESOLVED' })).status).toBe(404);
    expect((await admin.post('/api/admin/messages/does-not-exist/handled').set(H)).status).toBe(404);
    expect((await request(app).get("/api/products?q=' OR 1=1 --")).status).toBe(200);
  });
});

describe('order integrity', () => {
  it('creates exactly one order when checkout is submitted twice concurrently', async () => {
    const sup = request.agent(app);
    await approvedSupplier(sup, admin);
    const pid = await publishedProduct(sup, admin, { title: 'Double Submit Saree' });
    const r = request.agent(app);
    const u = await registerRetailer(app, r);
    await r.post('/api/cart/items').set(H).send({ productId: pid, lines: [{ quantity: 3 }] });
    const addressId = await addAddress(r);
    const results = await Promise.all([0, 1, 2].map(() => r.post('/api/retailer/orders').set(H).send({ addressId })));
    expect(results.filter((x) => x.status === 201)).toHaveLength(1);
    expect(results.every((x) => x.status === 201 || x.status === 409 || x.status === 422)).toBe(true);
    const retailer = await prisma.retailer.findUniqueOrThrow({ where: { userId: u.id } });
    expect(await prisma.order.count({ where: { retailerId: retailer.id } })).toBe(1);
  });

  it('prices orders on the server and keeps stock, MOQ and prices out of reach of other roles', async () => {
    const sup = request.agent(app);
    await approvedSupplier(sup, admin);
    const pid = await publishedProduct(sup, admin, { title: 'Price Guard Belt', price: 100, moq: 2, stockQuantity: 50 });
    const r = request.agent(app);
    const u = await registerRetailer(app, r);
    // Client-supplied prices are ignored: only productId / variantId / quantity are read.
    const add = await r.post('/api/cart/items').set(H).send({ productId: pid, pricePaise: 1, unitPricePaise: 1, lines: [{ quantity: 4, unitPricePaise: 1, price: 0.01 }] });
    expect(add.status).toBe(201);
    const cart = (await r.get('/api/cart')).body;
    expect(cart.suppliers[0].lines[0]).toMatchObject({ unitPricePaise: 10000, lineTotalPaise: 40000 });
    const addressId = await addAddress(r);
    expect((await r.post('/api/retailer/orders').set(H).send({ addressId, subtotalPaise: 1, totalPaise: 1 })).status).toBe(201);
    const retailer = await prisma.retailer.findUniqueOrThrow({ where: { userId: u.id } });
    const order = await prisma.order.findFirstOrThrow({ where: { retailerId: retailer.id }, include: { supplierOrders: { include: { items: true } } } });
    expect(order.subtotalPaise).toBe(40000);
    expect(order.supplierOrders[0].items[0].unitPricePaise).toBe(10000);
    // Another supplier, a retailer and a guest cannot change the listing's stock, MOQ or price.
    const other = request.agent(app);
    await approvedSupplier(other, admin);
    expect((await other.patch(`/api/supplier/products/${pid}/stock`).set(H).send({ stockQuantity: 999999 })).status).toBe(404);
    expect((await other.put(`/api/supplier/products/${pid}`).set(H).send({ title: 'Hijacked listing', description: 'Attempt to edit another supplier listing.', categoryPath: 'accessories/belts', price: 1, priceUnit: 'PIECE', moq: 1 })).status).toBe(404);
    expect((await r.patch(`/api/supplier/products/${pid}/stock`).set(H).send({ stockQuantity: 999999 })).status).toBe(403);
    expect((await request(app).patch(`/api/supplier/products/${pid}/stock`).set(H).send({ stockQuantity: 999999 })).status).toBe(401);
    const after = await prisma.product.findUniqueOrThrow({ where: { id: pid } });
    expect(after).toMatchObject({ pricePaise: 10000, moq: 2, title: 'Price Guard Belt' });
    expect(after.stockQuantity).toBe(46); // 50 minus the 4 reserved by the order, untouched by the attempts
  });

  it('refuses order values that would overflow stored money columns', async () => {
    const sup = request.agent(app);
    await approvedSupplier(sup, admin);
    const pid = await publishedProduct(sup, admin, { title: 'Very Expensive Bridal Lehenga', price: 1_000_000, moq: 1 });
    const r = request.agent(app);
    await registerRetailer(app, r);
    await r.post('/api/cart/items').set(H).send({ productId: pid, lines: [{ quantity: 30 }] }); // ₹3 crore
    const cart = await r.get('/api/cart');
    expect(cart.body.canCheckout).toBe(false);
    const oAddr = await addAddress(r);
    const o = await r.post('/api/retailer/orders').set(H).send({ addressId: oAddr });
    expect(o.status).toBe(422);
  });

  it("enforces a supplier's minimum order value", async () => {
    const sup = request.agent(app);
    await approvedSupplier(sup, admin, { minOrderValue: 5000 });
    const pid = await publishedProduct(sup, admin, { title: 'Min Value Saree', price: 100, moq: 1 });
    const r = request.agent(app);
    await registerRetailer(app, r);
    const cart = (await r.post('/api/cart/items').set(H).send({ productId: pid, lines: [{ quantity: 10 }] })).body;
    expect(cart.canCheckout).toBe(false);
    expect(cart.suppliers[0].issues.join(' ')).toMatch(/minimum order value/i);
    const addr = await addAddress(r);
    expect((await r.post('/api/retailer/orders').set(H).send({ addressId: addr })).status).toBe(422);
    await r.post('/api/cart/items').set(H).send({ productId: pid, lines: [{ quantity: 40 }] }); // ₹5,000
    expect((await r.get('/api/cart')).body.canCheckout).toBe(true);
  });

  it("keeps retailers' cart lines when a supplier edits a listing's options", async () => {
    const sup = request.agent(app);
    await approvedSupplier(sup, admin);
    const pid = await publishedProduct(sup, admin, { title: 'Variant Edit Kurti', categoryPath: 'mens-wear/shirts', moq: 2, variants: [{ size: 'M' }, { size: 'L' }] });
    const product = (await sup.get(`/api/supplier/products/${pid}`)).body.product;
    const r = request.agent(app);
    await registerRetailer(app, r);
    await r.post('/api/cart/items').set(H).send({ productId: pid, lines: [{ variantId: product.variants[0].id, quantity: 2 }] });
    const edit = await sup.put(`/api/supplier/products/${pid}`).set(H).send({
      title: 'Variant Edit Kurti (updated)', description: product.description, categoryPath: 'mens-wear/shirts', price: 120, priceUnit: 'PIECE', moq: 2,
      variants: [...product.variants.map((v: { id: string; size: string }) => ({ id: v.id, size: v.size })), { size: 'XL' }],
    });
    expect(edit.status).toBe(200);
    expect(edit.body.product.variants.map((v: { id: string }) => v.id)).toEqual(expect.arrayContaining(product.variants.map((v: { id: string }) => v.id)));
    expect((await r.get('/api/cart')).body.itemCount).toBe(1);
  });
});
