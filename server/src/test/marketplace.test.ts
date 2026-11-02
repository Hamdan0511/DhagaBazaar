import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';

const app = createApp();
const H = { 'X-Requested-With': 'dhaaga' };
import { FAKE_JPEG, JPEG } from './helpers.js';
const PDF = Buffer.from('%PDF-1.4\n% test document\n');

const agents = {
  retailer: request.agent(app),
  supplierA: request.agent(app),
  supplierB: request.agent(app),
  admin: request.agent(app),
  guest: request.agent(app),
};

async function register(agent: ReturnType<typeof request.agent>, overrides: Record<string, unknown>) {
  return agent
    .post('/api/auth/register')
    .set(H)
    .send({ fullName: 'Test User', phone: '9876543210', password: 'secret123', confirmPassword: 'secret123', city: 'Bengaluru', addressLine: '1 Market Road', state: 'Karnataka', pincode: '560002', acceptTerms: true, ...overrides });
}

let supplierAId = '';
let supplierBId = '';
let productA1 = '';
let productA2 = '';
let productB1 = '';

async function onboardSupplier(agent: ReturnType<typeof request.agent>, name: string, city: string) {
  const r = await register(agent, { email: `${name.toLowerCase().replace(/\s/g, '')}@supplier.test`, businessName: name, businessType: 'MANUFACTURER', categoryPaths: ['womens-wear/sarees'], description: 'We manufacture and supply wholesale garments.', });
  expect(r.status).toBe(201);
  expect(r.body.user.role).toBe('SUPPLIER');
  expect(r.body.user.supplier.status).toBe('PENDING_REVIEW'); // complete registration awaits admin review — never auto-approved
  expect(r.body.user.supplier.isVerified).toBe(false);
  const profile = await agent.put('/api/supplier/profile').set(H).send({
    businessName: name, businessType: 'MANUFACTURER', contactName: 'Owner', phone: '9876543210', addressLine: '12 Market Road',
    city, state: 'Karnataka', pincode: '560002', categoryPaths: ['womens-wear/sarees', 'womens-wear/kurtis'],
  });
  expect(profile.status).toBe(200);
  // Already submitted at registration: resubmitting is rejected.
  expect((await agent.post('/api/supplier/submit').set(H)).status).toBe(422);
  const doc = await agent.post('/api/supplier/documents').set(H).field('type', 'GST_CERTIFICATE').attach('file', PDF, 'gst.pdf');
  expect(doc.status).toBe(201);
  return r.body.user.supplier.id as string;
}

async function createProduct(agent: ReturnType<typeof request.agent>, body: Record<string, unknown>) {
  const r = await agent.post('/api/supplier/products').set(H).send(body);
  expect(r.status).toBe(201);
  const id = r.body.product.id as string;
  const img = await agent.post(`/api/supplier/products/${id}/images`).set(H).field('usageRights', 'SUPPLIER_OWNED').attach('images', JPEG, 'photo.jpg');
  expect(img.status).toBe(201);
  return id;
}

beforeAll(async () => {
  const login = await agents.admin.post('/api/auth/login').set(H).send({ email: 'admin@test.local', password: 'Admin-test-password-1' });
  expect(login.status).toBe(200);
});

afterAll(async () => {
  await prisma.$disconnect();
  fs.rmSync(path.resolve(process.cwd(), 'uploads-test'), { recursive: true, force: true });
});

describe('guest browsing', () => {
  it('serves the category taxonomy and an honest empty catalogue without login', async () => {
    const cats = await agents.guest.get('/api/categories');
    expect(cats.status).toBe(200);
    expect(cats.body.categories.find((c: { path: string }) => c.path === 'womens-wear/sarees')).toBeTruthy();
    expect(cats.body.categories.find((c: { path: string }) => c.path === 'footwear')).toBeTruthy();
    const list = await agents.guest.get('/api/products?category=womens-wear/sarees');
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(0);
    expect(list.body.facets.scopeTotal).toBe(0);
    expect(list.body.facets.price).toBeNull();
  });

  it('suggests categories from the taxonomy only', async () => {
    const r = await agents.guest.get('/api/search/suggest?q=kurti');
    expect(r.body.categories[0].path).toBe('womens-wear/kurtis');
    expect(r.body.suppliers).toEqual([]);
    expect(r.body.products).toEqual([]);
  });

  it('requires sign-in for commerce actions and the CSRF header for writes', async () => {
    expect((await agents.guest.get('/api/cart')).status).toBe(401);
    expect((await agents.guest.post('/api/cart/items').send({})).status).toBe(403);
    expect((await agents.guest.post('/api/cart/items').set(H).send({ productId: 'x', lines: [{ quantity: 1 }] })).status).toBe(401);
  });
});

describe('authentication', () => {
  it('registers a retailer, rejects duplicates and bad passwords', async () => {
    const r = await register(agents.retailer, { email: 'shop@retailer.test', businessName: 'Lakshmi Boutique', businessType: 'BOUTIQUE_OWNER' });
    expect(r.status).toBe(201);
    expect(r.body.user.role).toBe('RETAILER');
    expect(r.headers['set-cookie']?.[0]).toMatch(/HttpOnly/);
    expect((await register(request.agent(app), { email: 'shop@retailer.test', businessName: 'X Shop', businessType: 'RETAILER' })).status).toBe(409);
    expect((await register(request.agent(app), { email: 'weak@retailer.test', businessName: 'X Shop', businessType: 'RETAILER', password: 'short' })).status).toBe(422);
    const bad = await request(app).post('/api/auth/login').set(H).send({ email: 'shop@retailer.test', password: 'wrongpass1' });
    expect(bad.status).toBe(401);
    expect((await agents.retailer.get('/api/auth/me')).body.user.email).toBe('shop@retailer.test');
  });

  it('blocks non-admins from the admin API', async () => {
    expect((await agents.retailer.get('/api/admin/overview')).status).toBe(403);
    expect((await agents.guest.get('/api/admin/overview')).status).toBe(401);
  });
});

describe('supplier onboarding and approval', () => {
  it('keeps new suppliers pending until an admin approves them', async () => {
    supplierAId = await onboardSupplier(agents.supplierA, 'Silk House', 'Bengaluru');
    supplierBId = await onboardSupplier(agents.supplierB, 'Surat Weaves', 'Surat');
    expect((await agents.guest.get(`/api/suppliers/${supplierAId}`)).status).toBe(404);
    const pending = await agents.admin.get('/api/admin/suppliers?status=PENDING_REVIEW');
    const ours = pending.body.suppliers.filter((x: { id: string }) => [supplierAId, supplierBId].includes(x.id));
    expect(ours).toHaveLength(2);
    // Verification requires approval and an accepted document first.
    expect((await agents.admin.post(`/api/admin/suppliers/${supplierAId}/verification`).set(H).send({ verified: true })).status).toBe(422);
    for (const id of [supplierAId, supplierBId]) {
      expect((await agents.admin.post(`/api/admin/suppliers/${id}/decision`).set(H).send({ decision: 'APPROVED' })).status).toBe(200);
    }
    const s = await prisma.supplier.findUniqueOrThrow({ where: { id: supplierAId }, include: { documents: true } });
    expect(s.isVerified).toBe(false);
    await agents.admin.post(`/api/admin/documents/${s.documents[0].id}/review`).set(H).send({ status: 'ACCEPTED' });
    expect((await agents.admin.post(`/api/admin/suppliers/${supplierAId}/verification`).set(H).send({ verified: true })).status).toBe(200);
  });

  it('rejects product photos that are not real images or are too small to show garment detail', async () => {
    const draft = await agents.supplierA.post('/api/supplier/products').set(H).send({ title: 'Photo validation draft', description: 'Draft used to check photo validation rules.', categoryPath: 'accessories/belts', price: 100, priceUnit: 'PIECE', moq: 1 });
    expect(draft.status).toBe(201);
    const fake = await agents.supplierA.post(`/api/supplier/products/${draft.body.product.id}/images`).set(H).field('usageRights', 'SUPPLIER_OWNED').attach('images', FAKE_JPEG, 'fake.jpg');
    expect(fake.status).toBe(422);
    expect(fake.body.error.message).toMatch(/could not be read/);
    const ok = await agents.supplierA.post(`/api/supplier/products/${draft.body.product.id}/images`).set(H).field('usageRights', 'SUPPLIER_OWNED').attach('images', JPEG, 'ok.jpg');
    expect(ok.status).toBe(201);
    expect(ok.body.images[0]).toMatchObject({ width: 400, height: 400 });
    expect((await agents.supplierA.delete(`/api/supplier/products/${draft.body.product.id}`).set(H)).status).toBe(200);
  });

  it('rejects disguised files', async () => {
    const r = await agents.supplierA.post('/api/supplier/documents').set(H).field('type', 'PAN_CARD').attach('file', Buffer.from('not really a pdf at all'), 'fake.pdf');
    expect(r.status).toBe(400);
  });
});

describe('listings, review and filters', () => {
  it('publishes products only after admin review', async () => {
    productA1 = await createProduct(agents.supplierA, {
      title: 'Soft Silk Saree with Zari Border', description: 'Soft silk saree with rich zari border, packed individually.', categoryPath: 'womens-wear/sarees',
      price: 1200, priceUnit: 'PIECE', moq: 10, attributes: { fabric: ['Silk'], occasion: ['Wedding'], work: ['Zari'], colour: ['Maroon'], bogus: ['x'] },
    });
    productA2 = await createProduct(agents.supplierA, {
      title: 'Printed Rayon Straight Kurti', description: 'Everyday printed rayon kurti in assorted sizes.', categoryPath: 'womens-wear/kurtis',
      price: 350, priceUnit: 'PIECE', moq: 30, orderStep: 5, attributes: { kurtiType: ['Straight'], fabric: ['Rayon'] },
      variants: [{ size: 'M', colour: 'Yellow' }, { size: 'L', colour: 'Yellow' }],
    });
    productB1 = await createProduct(agents.supplierB, {
      title: 'Georgette Party Saree', description: 'Georgette party saree with sequin work.', categoryPath: 'womens-wear/sarees',
      price: 800, priceUnit: 'PIECE', moq: 50, attributes: { fabric: ['Georgette'], occasion: ['Party'] },
    });
    expect((await agents.guest.get('/api/products?category=womens-wear')).body.total).toBe(0);
    for (const [agent, id] of [[agents.supplierA, productA1], [agents.supplierA, productA2], [agents.supplierB, productB1]] as const) {
      expect((await agent.post(`/api/supplier/products/${id}/submit`).set(H)).status).toBe(200);
      expect((await agents.admin.post(`/api/admin/products/${id}/decision`).set(H).send({ decision: 'APPROVED' })).status).toBe(200);
    }
    const all = await agents.guest.get('/api/products?category=womens-wear');
    expect(all.body.total).toBe(3);
    const stored = await prisma.product.findUniqueOrThrow({ where: { id: productA1 } });
    expect(stored.attributes).not.toHaveProperty('bogus'); // only category-defined attributes are kept
  });

  it('filters by category attributes, MOQ range, order quantity, price and city with real counts', async () => {
    const silk = await agents.guest.get('/api/products?category=womens-wear/sarees&attr.fabric=Silk');
    expect(silk.body.total).toBe(1);
    expect(silk.body.facets.attributes.fabric).toEqual({ Silk: 1, Georgette: 1 }); // disjunctive counts
    expect((await agents.guest.get('/api/products?category=womens-wear/sarees&moq=5-10')).body.total).toBe(1);
    expect((await agents.guest.get('/api/products?category=womens-wear/sarees&qty=20')).body.total).toBe(1); // MOQ 50 excluded
    expect((await agents.guest.get('/api/products?category=womens-wear/kurtis&qty=32')).body.total).toBe(0); // step of 5 above MOQ 30
    expect((await agents.guest.get('/api/products?category=womens-wear/kurtis&qty=35')).body.total).toBe(1);
    expect((await agents.guest.get('/api/products?category=womens-wear&priceMin=500&priceMax=1000')).body.total).toBe(1);
    expect((await agents.guest.get('/api/products?category=womens-wear&city=Surat')).body.total).toBe(1);
    expect((await agents.guest.get('/api/products?category=womens-wear/kurtis&attr.size=L')).body.total).toBe(1);
    const sorted = await agents.guest.get('/api/products?category=womens-wear&sort=price_asc');
    expect(sorted.body.items.map((p: { pricePaise: number }) => p.pricePaise)).toEqual([35000, 80000, 120000]);
    const suggest = await agents.guest.get('/api/search/suggest?q=georgette');
    expect(suggest.body.products).toHaveLength(1);
    const detail = await agents.guest.get(`/api/products/${productA1}`);
    expect(detail.body.product.supplier.isVerified).toBe(true);
    expect(detail.body.product.images).toHaveLength(1);
  });
});

describe('B2B cart, MOQ validation and multi-supplier orders', () => {
  it('rejects quantities below MOQ and enforces MOQ across variants', async () => {
    const below = await agents.retailer.post('/api/cart/items').set(H).send({ productId: productA1, lines: [{ quantity: 5 }] });
    expect(below.status).toBe(422);
    expect(below.body.error.message).toMatch(/Minimum order quantity is 10/);
    const kurti = await prisma.product.findUniqueOrThrow({ where: { id: productA2 }, include: { variants: true } });
    const [m, l] = kurti.variants;
    // 15 + 15 = 30 meets MOQ across sizes.
    const ok = await agents.retailer.post('/api/cart/items').set(H).send({ productId: productA2, lines: [{ variantId: m.id, quantity: 15 }, { variantId: l.id, quantity: 15 }] });
    expect(ok.status).toBe(201);
    // A variant is required for products with options.
    expect((await agents.retailer.post('/api/cart/items').set(H).send({ productId: productA2, lines: [{ quantity: 40 }] })).status).toBe(422);
  });

  it('groups the cart by supplier and blocks checkout below MOQ', async () => {
    await agents.retailer.post('/api/cart/items').set(H).send({ productId: productA1, lines: [{ quantity: 10 }] });
    const cart = (await agents.retailer.post('/api/cart/items').set(H).send({ productId: productB1, lines: [{ quantity: 50 }] })).body;
    expect(cart.suppliers).toHaveLength(2);
    expect(cart.canCheckout).toBe(true);
    const groupA = cart.suppliers.find((g: { supplierId: string }) => g.supplierId === supplierAId);
    expect(groupA.lines).toHaveLength(3);
    expect(groupA.subtotalPaise).toBe(10 * 120000 + 30 * 35000);
    // Lowering a line so the product total falls below MOQ is refused.
    const line = cart.suppliers.find((g: { supplierId: string }) => g.supplierId === supplierBId).lines[0];
    expect((await agents.retailer.patch(`/api/cart/items/${line.id}`).set(H).send({ quantity: 20 })).status).toBe(422);
    // Suppliers cannot use the cart.
    expect((await agents.supplierA.get('/api/cart')).status).toBe(403);
  });

  it('creates one order group per supplier with price snapshots', async () => {
    const noAddress = await agents.retailer.post('/api/retailer/orders').set(H).send({ addressId: 'missing' });
    expect(noAddress.status).toBe(422);
    const addr = await agents.retailer.post('/api/retailer/addresses').set(H).send({
      label: 'Shop', contactName: 'Lakshmi', phone: '9876543210', line1: '45 Commercial Street', city: 'Bengaluru', state: 'Karnataka', pincode: '560001',
    });
    expect(addr.status).toBe(201);
    const placed = await agents.retailer.post('/api/retailer/orders').set(H).send({ addressId: addr.body.address.id, notes: 'Deliver before 10 am' });
    expect(placed.status).toBe(201);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: placed.body.order.id }, include: { supplierOrders: { include: { items: true } } } });
    expect(order.supplierOrders).toHaveLength(2);
    expect(order.supplierOrders.flatMap((s) => s.items).every((i) => i.unitPricePaise > 0 && i.productTitle)).toBe(true);
    expect((await agents.retailer.get('/api/cart')).body.itemCount).toBe(0);

    // Later price edits must not change the confirmed order snapshot.
    await prisma.product.update({ where: { id: productA1 }, data: { pricePaise: 999_999 } });
    const snapshot = await prisma.orderItem.findFirstOrThrow({ where: { productId: productA1 } });
    expect(snapshot.unitPricePaise).toBe(120000);

    // Supplier A confirms and dispatches; retailer sees tracking; order becomes in fulfilment.
    const soA = order.supplierOrders.find((s) => s.supplierId === supplierAId)!;
    expect((await agents.supplierB.post(`/api/supplier/orders/${soA.id}/status`).set(H).send({ status: 'CONFIRMED' })).status).toBe(404);
    expect((await agents.supplierA.post(`/api/supplier/orders/${soA.id}/status`).set(H).send({ status: 'CONFIRMED' })).status).toBe(200);
    expect((await agents.supplierA.post(`/api/supplier/orders/${soA.id}/dispatch`).set(H).send({ carrier: 'VRL Logistics', trackingNumber: 'LR12345' })).status).toBe(201);
    const view = await agents.retailer.get(`/api/retailer/orders/${order.id}`);
    expect(view.body.order.status).toBe('IN_FULFILMENT');
    expect(view.body.order.supplierOrders.find((s: { id: string }) => s.id === soA.id).shipments[0].trackingNumber).toBe('LR12345');

    // Admin records commission on the confirmed group.
    const comm = await agents.admin.post(`/api/admin/supplier-orders/${soA.id}/commission`).set(H).send({ rateBps: 500 });
    expect(comm.body.commission.amountPaise).toBe(Math.round(soA.subtotalPaise * 0.05));
    const notes = await agents.retailer.get('/api/notifications');
    expect(notes.body.unread).toBeGreaterThan(0);
  });
});

describe('development fixtures', () => {
  it('never appear in the public catalogue when fixtures are disabled', async () => {
    const user = await prisma.user.create({
      data: {
        email: 'fixture@dev.invalid', passwordHash: 'x', fullName: 'Fixture', role: 'SUPPLIER',
        supplier: { create: { businessName: '[DEV FIXTURE] Test', businessType: 'WHOLESALER', contactName: 'x', phone: '9000000000', status: 'APPROVED', isFixture: true } },
      },
      include: { supplier: true },
    });
    const cat = await prisma.category.findUniqueOrThrow({ where: { path: 'womens-wear/sarees' } });
    const fixture = await prisma.product.create({ data: { supplierId: user.supplier!.id, categoryId: cat.id, title: '[DEV FIXTURE] Saree', slug: 'x', description: 'fixture', pricePaise: 100, moq: 1, status: 'APPROVED', isFixture: true } });
    // Not reachable directly, not suggested, and cannot be bought.
    expect((await agents.guest.get(`/api/products/${fixture.id}`)).status).toBe(404);
    expect((await agents.guest.get(`/api/suppliers/${user.supplier!.id}`)).status).toBe(404);
    const suggest = await agents.guest.get('/api/search/suggest?q=FIXTURE');
    expect(JSON.stringify(suggest.body)).not.toMatch(/FIXTURE/);
    expect((await agents.retailer.post('/api/cart/items').set(H).send({ productId: fixture.id, lines: [{ quantity: 1 }] })).status).toBe(404);
    const list = await agents.guest.get('/api/products?category=womens-wear/sarees');
    expect(list.body.items.some((p: { title: string }) => p.title.includes('FIXTURE'))).toBe(false);
    expect((await agents.guest.get('/api/suppliers')).body.suppliers.some((s: { businessName: string }) => s.businessName.includes('FIXTURE'))).toBe(false);
  });
});
