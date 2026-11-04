import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { AiGarmentAnalysis } from '@dhaaga/shared';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { AiError, classifyAiError, closestAspectRatio, setAiClientForTests, type AiClient } from '../lib/ai/gemini.js';
import { buildEditPrompt } from '../lib/ai/prompts.js';
import { aiMaintenance } from '../lib/ai/maintenance.js';
import { H, JPEG, FAKE_JPEG, PDF, approvedSupplier, registerRetailer, type Agent } from './helpers.js';

/**
 * Dhaaga Bazaar AI Studio API. These tests use a FAKE Gemini client (no network, no cost) to
 * exercise our own logic: permissions, ownership, validation, duplicate protection, output
 * checks, error mapping and listing integration. The real Gemini integration is exercised
 * separately against the live API (see docs/AI_STUDIO.md).
 */

const app = createApp();
const admin: Agent = request.agent(app);
const supplierA: Agent = request.agent(app);
const supplierB: Agent = request.agent(app);
const retailer: Agent = request.agent(app);
const CATEGORY = 'mens-wear/t-shirts/polo-t-shirts';

/** Valid JPEGs with different bytes (data after the end-of-image marker is ignored by decoders). */
const jpeg = (tag: string) => Buffer.concat([JPEG, Buffer.from(`\n${tag}`)]);

const ANALYSIS: AiGarmentAnalysis = {
  garmentType: 'half-sleeve polo T-shirt', dominantColour: 'navy blue', otherColours: ['white'], fabricAppearance: 'pique knit look', pattern: 'solid', printOrEmbroidery: 'small chest logo',
  neckline: 'polo collar', sleeves: 'half sleeves', closures: 'two buttons', wrinkles: 'moderate', lightingIssues: ['dim'], backgroundDistractions: ['bedsheet'], possibleDefects: [],
  imageQuality: 'good', confidence: 'high', safeToEnhance: true, notes: 'Clear photo.',
};

let calls = { analyse: 0, enhance: 0 };
let lastPrompt = '';
let enhanceImpl: AiClient['enhance'] = async () => ({ mimeType: 'image/jpeg', data: jpeg('enhanced') });
let analysisImpl: () => AiGarmentAnalysis = () => ANALYSIS;
const fake: AiClient = {
  async analyse() {
    calls.analyse++;
    return analysisImpl();
  },
  async enhance(image, prompt, ratio) {
    calls.enhance++;
    lastPrompt = prompt;
    return enhanceImpl(image, prompt, ratio);
  },
};

async function waitForGeneration(agent: Agent, id: string) {
  for (let i = 0; i < 100; i++) {
    const r = await agent.get(`/api/supplier/ai/generations/${id}`);
    if (r.body.generation.status !== 'GENERATING') return r.body.generation;
    await new Promise((res) => setTimeout(res, 20));
  }
  throw new Error('generation did not finish');
}

async function newProduct(agent: Agent, title = 'AI Studio Polo Listing') {
  const r = await agent.post('/api/supplier/products').set(H).send({ title, description: 'Navy pique polo T-shirts for wholesale buyers.', categoryPath: CATEGORY, price: 250, priceUnit: 'PIECE', moq: 10 });
  expect(r.status).toBe(201);
  return r.body.product.id as string;
}

async function uploadSource(agent: Agent, buf: Buffer, productId?: string) {
  const req = agent.post('/api/supplier/ai/sources').set(H);
  if (productId) req.field('productId', productId);
  return req.attach('image', buf, 'garment.jpg');
}

async function analysedSource(agent: Agent, tag: string, productId?: string) {
  const up = await uploadSource(agent, jpeg(tag), productId);
  expect(up.status).toBe(201);
  const an = await agent.post(`/api/supplier/ai/sources/${up.body.source.id}/analyse`).set(H);
  expect(an.status).toBe(200);
  return up.body.source.id as string;
}

const generate = (agent: Agent, sourceId: string, extra: Record<string, unknown> = {}) =>
  agent.post('/api/supplier/ai/generations').set(H).send({ sourceId, garmentType: 'polo T-shirt', colour: 'navy blue', background: 'PURE_WHITE', mode: 'FULL', level: 'BALANCED', ...extra });

beforeAll(async () => {
  expect((await admin.post('/api/auth/login').set(H).send({ email: 'admin@test.local', password: 'Admin-test-password-1' })).status).toBe(200);
  await approvedSupplier(supplierA, admin);
  await approvedSupplier(supplierB, admin);
  await registerRetailer(app, retailer);
});
afterEach(() => {
  setAiClientForTests(null);
  enhanceImpl = async () => ({ mimeType: 'image/jpeg', data: jpeg('enhanced') });
  analysisImpl = () => ANALYSIS;
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe('AI Studio access control', () => {
  it('requires a signed-in supplier for every AI endpoint', async () => {
    expect((await request(app).get('/api/supplier/ai/status').set(H)).status).toBe(401);
    expect((await request(app).post('/api/supplier/ai/generations').set(H).send({})).status).toBe(401);
    expect((await retailer.get('/api/supplier/ai/status').set(H)).status).toBe(403);
    expect((await retailer.post('/api/supplier/ai/sources').set(H).attach('image', jpeg('r'), 'x.jpg')).status).toBe(403);
    expect((await admin.get('/api/supplier/ai/generations').set(H)).status).toBe(403);
  });

  it('reports AI as not configured (no fake results) when no Gemini key is set', async () => {
    expect(config.ai.apiKey).toBeNull();
    const st = await supplierA.get('/api/supplier/ai/status');
    expect(st.status).toBe(200);
    expect(st.body).toMatchObject({ configured: false, imageModel: config.ai.imageModel });
    const up = await uploadSource(supplierA, jpeg('no-key'));
    expect(up.status).toBe(201);
    const an = await supplierA.post(`/api/supplier/ai/sources/${up.body.source.id}/analyse`).set(H);
    expect(an.status).toBe(503);
    expect(an.body.error.code).toBe('AI_NOT_CONFIGURED');
    expect(JSON.stringify(an.body)).not.toMatch(/GEMINI_API_KEY/);
  });

  it("keeps one supplier's originals, versions, files and listings away from another supplier", async () => {
    setAiClientForTests(fake);
    const productA = await newProduct(supplierA, 'AI Isolation Listing');
    const sourceId = await analysedSource(supplierA, 'iso', productA);
    const started = await generate(supplierA, sourceId);
    expect(started.status).toBe(202);
    const g = await waitForGeneration(supplierA, started.body.generation.id);
    expect(g.status).toBe('COMPLETED');

    expect((await supplierB.get(`/api/supplier/ai/sources/${sourceId}`)).status).toBe(404);
    expect((await supplierB.get(`/api/supplier/ai/files/source/${sourceId}`)).status).toBe(404);
    expect((await supplierB.get(`/api/supplier/ai/files/generation/${g.id}`)).status).toBe(404);
    expect((await supplierB.get(`/api/supplier/ai/generations/${g.id}`)).status).toBe(404);
    expect((await supplierB.post(`/api/supplier/ai/sources/${sourceId}/analyse`).set(H)).status).toBe(404);
    expect((await generate(supplierB, sourceId)).status).toBe(404);
    expect((await supplierB.post(`/api/supplier/ai/generations/${g.id}/accept`).set(H).send({ productId: productA })).status).toBe(404);
    expect((await supplierB.post(`/api/supplier/ai/generations/${g.id}/discard`).set(H)).status).toBe(404);
    const ownB = await newProduct(supplierB, 'B Listing');
    // A's version cannot be attached to B's listing, nor B's photo pulled in by A.
    expect((await supplierA.post(`/api/supplier/ai/generations/${g.id}/accept`).set(H).send({ productId: ownB })).status).toBe(404);
    expect((await uploadSource(supplierA, jpeg('cross'), ownB)).status).toBe(404);
    expect((await supplierB.get('/api/supplier/ai/generations')).body.generations.some((x: { id: string }) => x.id === g.id)).toBe(false);
    // Private files are not reachable through the public uploads path either.
    const key = (await prisma.aiGeneration.findUniqueOrThrow({ where: { id: g.id } })).storageKey!;
    expect(key.startsWith('private/ai/')).toBe(true);
    expect((await request(app).get(`/uploads/${key}`)).status).toBe(404);
  });
});

describe('AI Studio uploads', () => {
  it('validates the real file content, size and dimensions, and never stores the same photo twice', async () => {
    expect((await uploadSource(supplierA, FAKE_JPEG)).status).toBe(422); // JPEG header but no decodable image
    expect((await supplierA.post('/api/supplier/ai/sources').set(H).attach('image', PDF, 'photo.jpg')).status).toBe(400);
    const first = await uploadSource(supplierA, jpeg('dup'));
    expect(first.status).toBe(201);
    const again = await uploadSource(supplierA, jpeg('dup'));
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ duplicate: true, source: { id: first.body.source.id } });
    expect(await prisma.aiSourcePhoto.count({ where: { id: first.body.source.id } })).toBe(1);
    const file = await supplierA.get(first.body.source.url);
    expect(file.status).toBe(200);
    expect(file.headers['cache-control']).toBe('private, no-store');
    expect(Buffer.compare(file.body, jpeg('dup'))).toBe(0);
  });
});

describe('AI Studio analysis and generation', () => {
  it('analyses only on request, reuses a finished analysis, and generates a validated new image', async () => {
    setAiClientForTests(fake);
    calls = { analyse: 0, enhance: 0 };
    const up = await uploadSource(supplierA, jpeg('flow'));
    expect(calls.analyse).toBe(0); // uploading/previewing never calls the AI
    expect((await generate(supplierA, up.body.source.id)).status).toBe(422); // must analyse first
    const an = await supplierA.post(`/api/supplier/ai/sources/${up.body.source.id}/analyse`).set(H);
    expect(an.body.source.analysis.garmentType).toBe(ANALYSIS.garmentType);
    const again = await supplierA.post(`/api/supplier/ai/sources/${up.body.source.id}/analyse`).set(H);
    expect(again.body.reused).toBe(true);
    expect(calls.analyse).toBe(1);

    const started = await generate(supplierA, up.body.source.id, { background: 'WARM_IVORY', mode: 'WRINKLES', level: 'NATURAL' });
    expect(started.status).toBe(202);
    const g = await waitForGeneration(supplierA, started.body.generation.id);
    expect(g).toMatchObject({ status: 'COMPLETED', background: 'WARM_IVORY', mode: 'WRINKLES', level: 'NATURAL', model: config.ai.imageModel });
    expect(calls.enhance).toBe(1);
    expect(lastPrompt).toMatch(/polo T-shirt, main colour navy blue/);
    expect(lastPrompt).toMatch(/Never hide or repair damage/);
    expect(lastPrompt).toMatch(/collar or neckline/); // category-specific handling
    const out = await supplierA.get(g.url);
    expect(Buffer.compare(out.body, jpeg('enhanced'))).toBe(0);
    // The original is untouched.
    expect(Buffer.compare((await supplierA.get(an.body.source.url)).body, jpeg('flow'))).toBe(0);
  });

  it('requires the supplier to acknowledge flagged defects or an unsafe photo, and says defects must stay visible', async () => {
    setAiClientForTests(fake);
    analysisImpl = () => ({ ...ANALYSIS, possibleDefects: ['small hole near the hem'] });
    const sourceId = await analysedSource(supplierA, 'defect');
    const blocked = await generate(supplierA, sourceId);
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.details).toEqual({ needsAcknowledgement: true });
    const ok = await generate(supplierA, sourceId, { defectsAcknowledged: true });
    expect(ok.status).toBe(202);
    await waitForGeneration(supplierA, ok.body.generation.id);
    expect(lastPrompt).toMatch(/MUST stay visible: small hole near the hem/);
  });

  it('runs one generation at a time per supplier (double clicks do not create two paid requests)', async () => {
    setAiClientForTests(fake);
    let release!: () => void;
    enhanceImpl = () => new Promise((res) => (release = () => res({ mimeType: 'image/jpeg', data: jpeg('slow') })));
    const sourceId = await analysedSource(supplierA, 'double');
    const [a, b] = await Promise.all([generate(supplierA, sourceId), generate(supplierA, sourceId)]);
    expect([a.status, b.status].sort()).toEqual([202, 409]);
    const id = (a.status === 202 ? a : b).body.generation.id;
    while (!release) await new Promise((r) => setTimeout(r, 5));
    release();
    expect((await waitForGeneration(supplierA, id)).status).toBe('COMPLETED');
  });

  it('marks failures honestly: no image, the original returned, not an image, quota, timeout', async () => {
    setAiClientForTests(fake);
    const cases: [AiClient['enhance'], string][] = [
      [async () => { throw new AiError('AI_NO_IMAGE'); }, 'AI_NO_IMAGE'],
      [async (img) => ({ mimeType: img.mimeType, data: img.data }), 'AI_NO_IMAGE'],
      [async () => ({ mimeType: 'image/png', data: Buffer.from('not an image at all, just text bytes') }), 'AI_INVALID_OUTPUT'],
      [async () => { throw Object.assign(new Error('Rate limit exceeded for model (limit: 0 requests per day on Free Tier)'), { status: 429 }); }, 'AI_QUOTA'],
      [async () => { throw Object.assign(new Error('Request timed out'), { name: 'APIConnectionTimeoutError' }); }, 'AI_TIMEOUT'],
    ];
    for (const [i, [impl, code]] of cases.entries()) {
      enhanceImpl = impl;
      const sourceId = await analysedSource(supplierA, `fail-${i}`);
      const started = await generate(supplierA, sourceId);
      const g = await waitForGeneration(supplierA, started.body.generation.id);
      expect(g.status, code).toBe('FAILED');
      expect(g.errorCode).toBe(code);
      expect(g.url).toBeNull();
      expect(g.error).toMatch(/No image was generated|Nothing was saved|quota/);
      expect(JSON.stringify(g)).not.toMatch(/Free Tier|limit: 0/); // provider detail stays in the log
      // A failed version cannot be accepted.
      expect((await supplierA.post(`/api/supplier/ai/generations/${g.id}/accept`).set(H).send({ productId: 'x' })).status).toBe(422);
    }
  });

  it('enforces the daily generation cap per supplier', async () => {
    setAiClientForTests(fake);
    const sourceId = await analysedSource(supplierB, 'cap');
    const original = config.ai.dailyGenerations;
    (config.ai as { dailyGenerations: number }).dailyGenerations = 0;
    try {
      const r = await generate(supplierB, sourceId);
      expect(r.status).toBe(429);
      expect(r.body.error.code).toBe('AI_DAILY_LIMIT');
    } finally {
      (config.ai as { dailyGenerations: number }).dailyGenerations = original;
    }
  });
});

describe('AI Studio and listings', () => {
  it('attaches an accepted version (and optionally the original) to the draft as new photos; admin approval still works', async () => {
    setAiClientForTests(fake);
    const productId = await newProduct(supplierA, 'AI Accept Listing');
    const sourceId = await analysedSource(supplierA, 'accept', productId);
    const g = await waitForGeneration(supplierA, (await generate(supplierA, sourceId)).body.generation.id);
    const acc = await supplierA.post(`/api/supplier/ai/generations/${g.id}/accept`).set(H).send({ productId, includeOriginal: true, makePrimary: true });
    expect(acc.status).toBe(201);
    expect(acc.body.images).toHaveLength(2);
    const product = (await supplierA.get(`/api/supplier/products/${productId}`)).body.product;
    expect(product.images.map((i: { aiEnhanced: boolean }) => i.aiEnhanced)).toEqual([true, false]); // enhanced is primary
    expect(product.images.every((i: { status: string }) => i.status === 'PENDING')).toBe(true);
    expect((await supplierA.post(`/api/supplier/ai/generations/${g.id}/accept`).set(H).send({ productId })).status).toBe(409);
    expect((await supplierA.post(`/api/supplier/ai/generations/${g.id}/discard`).set(H)).status).toBe(422);
    // Generation history keeps the version and links it to the listing photo.
    expect((await supplierA.get('/api/supplier/ai/generations')).body.generations.find((x: { id: string }) => x.id === g.id)).toMatchObject({ status: 'ACCEPTED', productId });

    // Not public before review; the normal submit → admin approval flow is unchanged.
    expect((await request(app).get(product.images[0].url)).status).toBe(404);
    expect((await supplierA.post(`/api/supplier/products/${productId}/submit`).set(H)).status).toBe(200);
    expect((await admin.post(`/api/admin/products/${productId}/decision`).set(H).send({ decision: 'APPROVED' })).status).toBe(200);
    const pub = await request(app).get(`/api/products/${productId}`).set(H);
    expect(pub.status).toBe(200);
    expect(pub.body.product.images[0].aiEnhanced).toBe(true); // retailers see it is an AI-enhanced photo
    expect((await request(app).get(product.images[0].url)).status).toBe(200);
  });

  it('can enhance an existing listing photo without touching it, and discards a version without deleting the original', async () => {
    setAiClientForTests(fake);
    const productId = await newProduct(supplierA, 'AI Existing Photo Listing');
    const up = await supplierA.post(`/api/supplier/products/${productId}/images`).set(H).field('usageRights', 'SUPPLIER_OWNED').attach('images', jpeg('listing-photo'), 'p.jpg');
    expect(up.status).toBe(201);
    const imageId = up.body.images[0].id;
    expect((await supplierB.post('/api/supplier/ai/sources/from-product-image').set(H).send({ productImageId: imageId })).status).toBe(404);
    const src = await supplierA.post('/api/supplier/ai/sources/from-product-image').set(H).send({ productImageId: imageId });
    expect(src.status).toBe(201);
    expect(src.body.source.productImageId).toBe(imageId);
    await supplierA.post(`/api/supplier/ai/sources/${src.body.source.id}/analyse`).set(H);
    const g = await waitForGeneration(supplierA, (await generate(supplierA, src.body.source.id)).body.generation.id);
    expect((await supplierA.post(`/api/supplier/ai/generations/${g.id}/discard`).set(H)).status).toBe(200);
    const imgs = (await supplierA.get(`/api/supplier/products/${productId}`)).body.product.images;
    expect(imgs).toHaveLength(1);
    expect(imgs[0].id).toBe(imageId);
    expect((await supplierA.get(`/api/supplier/ai/sources/${src.body.source.id}`)).body.generations[0].status).toBe('DISCARDED');
  });
});

describe('listing photos: duplicates and replace', () => {
  it('refuses the same photo twice on a listing and replaces a photo in place', async () => {
    const productId = await newProduct(supplierB, 'Duplicate Photo Listing');
    const add = (buf: Buffer) => supplierB.post(`/api/supplier/products/${productId}/images`).set(H).field('usageRights', 'SUPPLIER_OWNED').attach('images', buf, 'p.jpg');
    const first = await add(jpeg('one'));
    expect(first.status).toBe(201);
    expect((await add(jpeg('one'))).status).toBe(409);
    expect((await add(jpeg('two'))).status).toBe(201);
    const id = first.body.images[0].id;
    expect((await supplierA.post(`/api/supplier/products/${productId}/images/${id}/replace`).set(H).attach('image', jpeg('three'), 'r.jpg')).status).toBe(404);
    expect((await supplierB.post(`/api/supplier/products/${productId}/images/${id}/replace`).set(H).attach('image', jpeg('two'), 'r.jpg')).status).toBe(409);
    const rep = await supplierB.post(`/api/supplier/products/${productId}/images/${id}/replace`).set(H).attach('image', jpeg('three'), 'r.jpg');
    expect(rep.status).toBe(200);
    expect(rep.body.image).toMatchObject({ id, status: 'PENDING', sortOrder: 0 });
  });
});

describe('AI helpers', () => {
  it('maps provider failures to safe codes', () => {
    expect(classifyAiError(Object.assign(new Error('Rate limit exceeded (limit: 0 requests per day on Free Tier)'), { status: 429 })).code).toBe('AI_QUOTA');
    expect(classifyAiError(Object.assign(new Error('Resource exhausted, try later'), { status: 429 })).code).toBe('AI_RATE_LIMITED');
    expect(classifyAiError(Object.assign(new Error('API error occurred: {"httpMeta":{}}'), { status: 400 })).code).toBe('AI_AUTH');
    expect(classifyAiError(Object.assign(new Error('forbidden'), { status: 403 })).code).toBe('AI_AUTH');
    expect(classifyAiError(new Error('The operation was aborted due to timeout')).code).toBe('AI_TIMEOUT');
    expect(classifyAiError(new Error('boom')).code).toBe('AI_FAILED');
  });

  it('adapts instructions to the category and keeps the fidelity rules in every prompt', () => {
    const base = { background: 'PURE_WHITE', mode: 'FULL', level: 'STUDIO', colour: 'red' } as const;
    const saree = buildEditPrompt({ ...base, garmentType: 'silk saree', categoryPath: 'womens-wear/sarees/silk-sarees' });
    const fabric = buildEditPrompt({ ...base, garmentType: 'printed cotton fabric', categoryPath: 'fabrics/cotton' });
    const inner = buildEditPrompt({ ...base, garmentType: 'bra', categoryPath: 'womens-wear/innerwear/bras' });
    expect(saree).toMatch(/pallu/);
    expect(fabric).toMatch(/print scale/);
    expect(inner).toMatch(/Never add a person or body/);
    for (const p of [saree, fabric, inner]) {
      expect(p).toMatch(/Do not redesign, recolour/);
      expect(p).toMatch(/Never hide or repair damage/);
      expect(p).toMatch(/#FFFFFF/);
    }
  });

  it('picks the closest supported aspect ratio', () => {
    expect(closestAspectRatio(800, 1000)).toBe('4:5');
    expect(closestAspectRatio(1000, 1000)).toBe('1:1');
    expect(closestAspectRatio(4000, 3000)).toBe('4:3');
    expect(closestAspectRatio(410, 546)).toBe('3:4');
  });

  it('marks generations interrupted by a restart as failed during maintenance', async () => {
    const source = await prisma.aiSourcePhoto.findFirstOrThrow({ where: { generations: { some: {} } } });
    const stale = await prisma.aiGeneration.create({
      data: { supplierId: source.supplierId, sourceId: source.id, background: 'PURE_WHITE', mode: 'FULL', level: 'BALANCED', garmentType: 't', colour: 'c', model: 'm', prompt: 'p', createdAt: new Date(Date.now() - config.ai.timeoutMs - 120_000) },
    });
    await aiMaintenance();
    expect((await prisma.aiGeneration.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe('FAILED');
  });
});
