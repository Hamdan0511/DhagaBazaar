import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { H, JPEG, addAddress, approvedSupplier, publishedProduct, registerRetailer, uid, type Agent } from './helpers.js';

const app = createApp();
const admin: Agent = request.agent(app);
const base = {
  fullName: 'Asha Rao', phone: '9845012345', password: 'Strong2024', confirmPassword: 'Strong2024', addressLine: '12 Commercial Street',
  city: 'Bengaluru', state: 'Karnataka', pincode: '560001', acceptTerms: true,
};

beforeAll(async () => {
  expect((await admin.post('/api/auth/login').set(H).send({ email: 'admin@test.local', password: 'Admin-test-password-1' })).status).toBe(200);
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe('registration for both portals', () => {
  it('validates confirm-password and supplier-only required fields', async () => {
    const a = request.agent(app);
    const mismatch = await a.post('/api/auth/register').set(H).send({ ...base, email: `${uid('m')}@retailer.test`, businessName: 'Asha Fashions', businessType: 'RETAILER', confirmPassword: 'Different1' });
    expect(mismatch.status).toBe(422);
    expect(mismatch.body.error.details.confirmPassword[0]).toMatch(/do not match/);
    const supplierMissing = await a.post('/api/auth/register').set(H).send({ ...base, email: `${uid('m')}@supplier.test`, businessName: 'Rao Textiles', businessType: 'MANUFACTURER' });
    expect(supplierMissing.status).toBe(422);
    expect(Object.keys(supplierMissing.body.error.details)).toEqual(expect.arrayContaining(['categoryPaths', 'description']));
    const badPin = await a.post('/api/auth/register').set(H).send({ ...base, pincode: '012345', email: `${uid('m')}@retailer.test`, businessName: 'Asha Fashions', businessType: 'RETAILER' });
    expect(badPin.status).toBe(422);
  });

  it('stores a complete retailer profile with a default shop address, and never returns password hashes', async () => {
    const a = request.agent(app);
    const email = `${uid('ret')}@retailer.test`;
    const r = await a.post('/api/auth/register').set(H).send({ ...base, email, businessName: 'Asha Fashions', businessType: 'BOUTIQUE_OWNER', gstin: '29ABCDE1234F1Z5', categoryPaths: ['womens-wear/sarees', 'not/a-category'] });
    expect(r.status).toBe(201);
    expect(JSON.stringify(r.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
    const profile = (await a.get('/api/retailer/profile')).body.profile;
    expect(profile).toMatchObject({ businessName: 'Asha Fashions', gstin: '29ABCDE1234F1Z5', state: 'Karnataka', interests: ['womens-wear/sarees'] });
    expect(profile.addresses).toHaveLength(1);
    expect(profile.addresses[0]).toMatchObject({ line1: '12 Commercial Street', pincode: '560001', isDefault: true });
    // Log out, log back in, session persists across requests.
    await a.post('/api/auth/logout').set(H);
    expect((await a.get('/api/auth/me')).body.user).toBeNull();
    const login = await a.post('/api/auth/login').set(H).send({ email, password: 'Strong2024' });
    expect(login.status).toBe(200);
    expect(JSON.stringify(login.body)).not.toMatch(/passwordHash/);
    expect((await a.get('/api/auth/me')).body.user.role).toBe('RETAILER');
    expect((await a.put('/api/auth/account').set(H).send({ fullName: 'Asha R. Rao' })).status).toBe(200);
    expect((await a.get('/api/auth/me')).body.user.fullName).toBe('Asha R. Rao');
  });

  it('stores a complete supplier profile pending admin review, never verified', async () => {
    const a = request.agent(app);
    const r = await a.post('/api/auth/register').set(H).send({
      ...base, email: `${uid('sup')}@supplier.test`, businessName: 'Rao Handlooms', businessType: 'MANUFACTURER',
      categoryPaths: ['womens-wear/sarees', 'fabrics/silk-fabrics'], description: 'Handloom silk sarees woven in Karnataka since 1998.',
    });
    expect(r.status).toBe(201);
    expect(r.body.user.supplier).toMatchObject({ status: 'PENDING_REVIEW', isVerified: false });
    const me = (await a.get('/api/supplier/me')).body.supplier;
    expect(me).toMatchObject({ addressLine: '12 Commercial Street', state: 'Karnataka', pincode: '560001', categoryPaths: ['womens-wear/sarees', 'fabrics/silk-fabrics'] });
    // Pending suppliers can submit listings for review, but nothing is published until the supplier is approved.
    const draft = await a.post('/api/supplier/products').set(H).send({ title: 'Mysore silk saree draft', description: 'x'.repeat(30), categoryPath: 'fabrics/linen', price: 900, priceUnit: 'PIECE', moq: 5 });
    expect(draft.status).toBe(201);
    const pid = draft.body.product.id;
    await a.post(`/api/supplier/products/${pid}/images`).set(H).field('usageRights', 'SUPPLIER_OWNED').attach('images', JPEG, 'p.jpg');
    expect((await a.post(`/api/supplier/products/${pid}/submit`).set(H)).status).toBe(200);
    const early = await admin.post(`/api/admin/products/${pid}/decision`).set(H).send({ decision: 'APPROVED' });
    expect(early.status).toBe(422);
    expect(early.body.error.message).toMatch(/supplier must be approved/);
    expect((await request(app).get(`/api/products/${pid}`)).status).toBe(404);
    expect((await a.post(`/api/admin/suppliers/${r.body.user.supplier.id}/decision`).set(H).send({ decision: 'APPROVED' })).status).toBe(403);
  });
});

describe('stock management', () => {
  it('blocks quantities above stock, reserves stock at checkout and releases it when declined', async () => {
    const sup = request.agent(app);
    await approvedSupplier(sup, admin);
    const pid = await publishedProduct(sup, admin, { title: 'Linen fabric bolt', categoryPath: 'fabrics/linen', price: 200, moq: 5, stockQuantity: 20 });
    const r1 = request.agent(app);
    await registerRetailer(app, r1);
    const over = await r1.post('/api/cart/items').set(H).send({ productId: pid, lines: [{ quantity: 25 }] });
    expect(over.status).toBe(422);
    expect(over.body.error.message).toMatch(/Only 20 units are in stock/);
    expect((await r1.post('/api/cart/items').set(H).send({ productId: pid, lines: [{ quantity: 20 }] })).status).toBe(201);
    const addr = await addAddress(r1);
    const order = await r1.post('/api/retailer/orders').set(H).send({ addressId: addr });
    expect(order.status).toBe(201);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: pid } })).stockQuantity).toBe(0);

    const r2 = request.agent(app);
    await registerRetailer(app, r2);
    const soldOut = await r2.post('/api/cart/items').set(H).send({ productId: pid, lines: [{ quantity: 5 }] });
    expect(soldOut.status).toBe(422);
    expect(soldOut.body.error.message).toMatch(/sold out/i);

    const so = await prisma.supplierOrder.findFirstOrThrow({ where: { orderId: order.body.order.id } });
    expect((await sup.post(`/api/supplier/orders/${so.id}/status`).set(H).send({ status: 'REJECTED' })).status).toBe(200);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: pid } })).stockQuantity).toBe(20);
  });

  it('tracks stock per size/colour option, and stock edits keep a live listing live', async () => {
    const sup = request.agent(app);
    await approvedSupplier(sup, admin);
    const pid = await publishedProduct(sup, admin, {
      title: 'Cotton sandals', categoryPath: 'footwear/sandals', price: 300, moq: 2,
      variants: [{ size: 'UK 6', stockQuantity: 3 }, { size: 'UK 7', stockQuantity: 10 }],
    });
    const product = (await sup.get(`/api/supplier/products/${pid}`)).body.product;
    const [uk6, uk7] = product.variants;
    const r = request.agent(app);
    await registerRetailer(app, r);
    const tooMany = await r.post('/api/cart/items').set(H).send({ productId: pid, lines: [{ variantId: uk6.id, quantity: 4 }] });
    expect(tooMany.status).toBe(422);
    expect(tooMany.body.error.message).toMatch(/Only 3 available for UK 6/);
    expect((await r.post('/api/cart/items').set(H).send({ productId: pid, lines: [{ variantId: uk6.id, quantity: 3 }, { variantId: uk7.id, quantity: 2 }] })).status).toBe(201);

    const upd = await sup.patch(`/api/supplier/products/${pid}/stock`).set(H).send({ variants: [{ id: uk6.id, stockQuantity: 50 }, { id: uk7.id, stockQuantity: null }] });
    expect(upd.status).toBe(200);
    const after = await prisma.product.findUniqueOrThrow({ where: { id: pid }, include: { variants: true } });
    expect(after.status).toBe('APPROVED');
    expect(after.variants.find((v) => v.id === uk6.id)!.stockQuantity).toBe(50);
    expect(after.variants.find((v) => v.id === uk7.id)!.stockQuantity).toBeNull();
  });
});

describe('listing lifecycle', () => {
  it('deletes never-ordered drafts, archives live listings, and lets admins unpublish', async () => {
    const sup = request.agent(app);
    const sid = await approvedSupplier(sup, admin);
    const draft = await sup.post('/api/supplier/products').set(H).send({ title: 'Draft to delete', description: 'x'.repeat(30), categoryPath: 'fabrics/linen', price: 10, priceUnit: 'PIECE', moq: 1 });
    expect((await sup.delete(`/api/supplier/products/${draft.body.product.id}`).set(H)).status).toBe(200);
    expect(await prisma.product.count({ where: { id: draft.body.product.id } })).toBe(0);

    const live = await publishedProduct(sup, admin, { title: 'Live polyester fabric', categoryPath: 'fabrics/polyester' });
    expect((await sup.delete(`/api/supplier/products/${live}`).set(H)).status).toBe(422);
    const listing = await request(app).get(`/api/products?category=fabrics/polyester&supplier=${sid}`);
    expect(listing.body.total).toBe(1);
    expect(listing.body.facets.suppliers[sid].count).toBe(1);

    // Suppliers cannot publish; only admins can.
    expect((await sup.post(`/api/admin/products/${live}/decision`).set(H).send({ decision: 'APPROVED' })).status).toBe(403);
    expect((await admin.post(`/api/admin/products/${live}/decision`).set(H).send({ decision: 'UNPUBLISHED' })).status).toBe(422); // reason required
    expect((await admin.post(`/api/admin/products/${live}/decision`).set(H).send({ decision: 'UNPUBLISHED', reason: 'Photo shows a branded logo' })).status).toBe(200);
    expect((await request(app).get(`/api/products/${live}`)).status).toBe(404);
    expect((await sup.get(`/api/supplier/products/${live}`)).body.product.rejectionReason).toMatch(/branded logo/);
    expect((await sup.post(`/api/supplier/products/${live}/submit`).set(H)).status).toBe(200);
    expect((await admin.post(`/api/admin/products/${live}/decision`).set(H).send({ decision: 'APPROVED' })).status).toBe(200);
    expect((await request(app).get(`/api/products/${live}`)).status).toBe(200);

    expect((await sup.post(`/api/supplier/products/${live}/archive`).set(H)).status).toBe(200);
    expect((await request(app).get(`/api/products/${live}`)).status).toBe(404);
  });

  it("prevents editing another retailer's addresses", async () => {
    const a = request.agent(app);
    const b = request.agent(app);
    await registerRetailer(app, a);
    await registerRetailer(app, b);
    const addr = await addAddress(a);
    const hijack = await b.put(`/api/retailer/addresses/${addr}`).set(H).send({ label: 'Mine', contactName: 'X Y', phone: '9876543210', line1: 'Elsewhere', city: 'Pune', state: 'Maharashtra', pincode: '411001' });
    expect(hijack.status).toBe(404);
    await b.delete(`/api/retailer/addresses/${addr}`).set(H);
    expect(await prisma.address.count({ where: { id: addr } })).toBe(1);
  });
});
