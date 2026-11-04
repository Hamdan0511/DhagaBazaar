import crypto from 'node:crypto';
import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { aiGenerateSchema, type AiGarmentAnalysis } from '@dhaaga/shared';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { parse } from '../middleware/validate.js';
import { acceptFiles, IMAGE_MIMES } from '../middleware/upload.js';
import { newKey, sniffMime, storage } from '../lib/storage.js';
import { conflict, forbidden, HttpError, notFound, unprocessable } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { aiLimiter, uploadLimiter } from '../lib/rateLimits.js';
import { imageDimensions, productImageProblem } from '../lib/imageInfo.js';
import { log } from '../lib/logger.js';
import { aiClient, AiError, AI_ERROR_MESSAGES, classifyAiError, closestAspectRatio } from '../lib/ai/gemini.js';
import { buildEditPrompt } from '../lib/ai/prompts.js';

/**
 * Dhaaga Bazaar AI Studio API (mounted under /api/supplier/ai, so every route already
 * requires a signed-in supplier). Every record is looked up by id AND the caller's supplier id,
 * so one supplier can never read or act on another supplier's photos, versions or listings.
 *
 * Originals and generated versions are stored privately (uploads/private/ai/<supplier>/...) and
 * served only through the owner-checked file routes below. Nothing becomes public until the
 * supplier accepts a version into a listing, and the listing still goes through admin review.
 */
export const aiRouter = Router();

const DAY_MS = 24 * 60 * 60 * 1000;
/** Suppliers whose account allows preparing listings. Suspended or rejected accounts cannot spend AI credits. */
const ALLOWED_STATUSES = new Set(['INCOMPLETE', 'PENDING_REVIEW', 'INFO_REQUESTED', 'APPROVED']);
const AI_MAX_SIDE = 8000;

async function aiSupplier(req: Express.Request) {
  if (!req.user?.supplierId) throw forbidden('Supplier profile missing.');
  const s = await prisma.supplier.findUniqueOrThrow({ where: { id: req.user.supplierId }, select: { id: true, status: true } });
  if (!ALLOWED_STATUSES.has(s.status)) throw forbidden('Dhaaga Bazaar AI is not available while your supplier account is suspended or rejected.');
  return s;
}

const sha256 = (buf: Buffer) => crypto.createHash('sha256').update(buf).digest('hex');
const aiError = (e: AiError, status = e.code === 'AI_NOT_CONFIGURED' || e.code === 'AI_QUOTA' || e.code === 'AI_AUTH' ? 503 : e.code === 'AI_RATE_LIMITED' ? 429 : 502) =>
  new HttpError(status, e.message, e.code);

async function usage(supplierId: string) {
  const since = new Date(Date.now() - DAY_MS);
  const [generations, analyses] = await Promise.all([
    prisma.aiGeneration.count({ where: { supplierId, createdAt: { gte: since } } }),
    prisma.aiSourcePhoto.count({ where: { supplierId, createdAt: { gte: since }, analysisStatus: { not: 'NOT_STARTED' } } }),
  ]);
  return { generations, generationLimit: config.ai.dailyGenerations, analyses, analysisLimit: config.ai.dailyAnalyses };
}

const sourceView = (s: { id: string; productId: string | null; productImageId: string | null; width: number; height: number; sizeBytes: number; analysisStatus: string; analysis: Prisma.JsonValue; analysisError: string | null; createdAt: Date }) => ({
  id: s.id,
  productId: s.productId,
  productImageId: s.productImageId,
  width: s.width,
  height: s.height,
  sizeBytes: s.sizeBytes,
  url: `/api/supplier/ai/files/source/${s.id}`,
  analysisStatus: s.analysisStatus,
  analysis: s.analysis as AiGarmentAnalysis | null,
  analysisError: s.analysisError,
  createdAt: s.createdAt,
});

const generationView = (g: { id: string; sourceId: string; status: string; background: string; mode: string; level: string; garmentType: string; colour: string; model: string; storageKey: string | null; width: number | null; height: number | null; errorCode: string | null; durationMs: number | null; productImageId: string | null; createdAt: Date; completedAt: Date | null }) => ({
  id: g.id,
  sourceId: g.sourceId,
  status: g.status,
  background: g.background,
  mode: g.mode,
  level: g.level,
  garmentType: g.garmentType,
  colour: g.colour,
  model: g.model,
  url: g.storageKey ? `/api/supplier/ai/files/generation/${g.id}` : null,
  width: g.width,
  height: g.height,
  error: g.errorCode ? (AI_ERROR_MESSAGES[g.errorCode as keyof typeof AI_ERROR_MESSAGES] ?? AI_ERROR_MESSAGES.AI_FAILED) : null,
  errorCode: g.errorCode,
  durationMs: g.durationMs,
  productImageId: g.productImageId,
  createdAt: g.createdAt,
  completedAt: g.completedAt,
});

/** Stores an original privately; the same photo uploaded twice by a supplier is reused, not stored again. */
async function storeSource(supplierId: string, buf: Buffer, mime: string, productId: string | null, productImageId: string | null) {
  const dims = imageDimensions(buf, mime);
  const problem = productImageProblem('This photo', dims);
  if (problem) throw unprocessable(problem);
  if (Math.max(dims!.width, dims!.height) > AI_MAX_SIDE) throw unprocessable(`Photos for AI enhancement can be at most ${AI_MAX_SIDE}px on the longest side.`);
  const hash = sha256(buf);
  const existing = await prisma.aiSourcePhoto.findFirst({ where: { supplierId, sha256: hash }, orderBy: { createdAt: 'desc' } });
  if (existing) {
    const updated = productId && existing.productId !== productId ? await prisma.aiSourcePhoto.update({ where: { id: existing.id }, data: { productId } }) : existing;
    return { source: updated, duplicate: true };
  }
  const key = newKey(`private/ai/${supplierId}/originals`, mime);
  await storage.put(key, buf);
  const source = await prisma.aiSourcePhoto.create({
    data: { supplierId, productId, productImageId, storageKey: key, mimeType: mime, sizeBytes: buf.length, width: dims!.width, height: dims!.height, sha256: hash },
  });
  return { source, duplicate: false };
}

async function ownProduct(supplierId: string, productId: string | undefined | null) {
  if (!productId) return null;
  const p = await prisma.product.findFirst({ where: { id: productId, supplierId }, select: { id: true, status: true, title: true, category: { select: { path: true } } } });
  if (!p) throw notFound('Product not found.');
  return p;
}

// ─── Status & usage ───────────────────────────────────────────────────────
aiRouter.get('/status', async (req, res) => {
  const s = await aiSupplier(req);
  res.json({ configured: !!config.ai.apiKey, imageModel: config.ai.imageModel, analysisModel: config.ai.analysisModel, usage: await usage(s.id) });
});

// ─── Originals ────────────────────────────────────────────────────────────
aiRouter.post('/sources', uploadLimiter, ...acceptFiles('image', IMAGE_MIMES, 1), async (req, res) => {
  const { productId } = parse(z.object({ productId: z.string().min(1).optional() }), req.body);
  const s = await aiSupplier(req);
  await ownProduct(s.id, productId);
  const f = (req.files as Express.Multer.File[])[0]!;
  const { source, duplicate } = await storeSource(s.id, f.buffer, f.mimetype, productId ?? null, null);
  if (!duplicate) await audit(req.user!.id, 'ai.source.uploaded', 'AiSourcePhoto', source.id, { productId: productId ?? null });
  res.status(duplicate ? 200 : 201).json({ source: sourceView(source), duplicate });
});

/** Brings an existing listing photo into the studio (a private copy; the listing photo itself is untouched). */
aiRouter.post('/sources/from-product-image', async (req, res) => {
  const { productImageId } = parse(z.object({ productImageId: z.string().min(1) }), req.body);
  const s = await aiSupplier(req);
  const image = await prisma.productImage.findFirst({ where: { id: productImageId, product: { supplierId: s.id } } });
  if (!image) throw notFound('Photo not found.');
  const buf = await storage.get(image.storageKey);
  const mime = sniffMime(buf);
  if (!mime || !IMAGE_MIMES.includes(mime)) throw unprocessable('This photo cannot be used for AI enhancement.');
  const { source, duplicate } = await storeSource(s.id, buf, mime, image.productId, image.id);
  res.status(duplicate ? 200 : 201).json({ source: sourceView(source), duplicate });
});

aiRouter.get('/sources/:id', async (req, res) => {
  const s = await aiSupplier(req);
  const source = await prisma.aiSourcePhoto.findFirst({ where: { id: String(req.params.id), supplierId: s.id }, include: { generations: { orderBy: { createdAt: 'desc' } } } });
  if (!source) throw notFound('Photo not found.');
  res.json({ source: sourceView(source), generations: source.generations.map(generationView) });
});

/** Explicit analysis (never triggered by previewing). A completed analysis is reused, not paid for twice. */
aiRouter.post('/sources/:id/analyse', aiLimiter, async (req, res) => {
  const s = await aiSupplier(req);
  const source = await prisma.aiSourcePhoto.findFirst({ where: { id: String(req.params.id), supplierId: s.id } });
  if (!source) throw notFound('Photo not found.');
  if (source.analysisStatus === 'COMPLETED') return res.json({ source: sourceView(source), reused: true });
  if (source.analysisStatus === 'ANALYSING') throw conflict('This photo is already being analysed.');
  const u = await usage(s.id);
  if (u.analyses >= u.analysisLimit) throw new HttpError(429, `You have reached today's limit of ${u.analysisLimit} AI analyses. Please try again tomorrow.`, 'AI_DAILY_LIMIT');
  let client;
  try {
    client = aiClient();
  } catch (e) {
    throw aiError(classifyAiError(e));
  }
  // Claim the photo atomically so double clicks cannot start two paid analyses.
  const claimed = await prisma.aiSourcePhoto.updateMany({ where: { id: source.id, analysisStatus: { in: ['NOT_STARTED', 'FAILED'] } }, data: { analysisStatus: 'ANALYSING', analysisError: null } });
  if (!claimed.count) throw conflict('This photo is already being analysed.');
  try {
    const analysis = await client.analyse({ mimeType: source.mimeType, data: await storage.get(source.storageKey) });
    const done = await prisma.aiSourcePhoto.update({ where: { id: source.id }, data: { analysisStatus: 'COMPLETED', analysis: analysis as unknown as Prisma.InputJsonValue, analysisModel: config.ai.analysisModel } });
    res.json({ source: sourceView(done), reused: false });
  } catch (e) {
    const err = classifyAiError(e);
    log('error', 'ai analysis failed', { id: req.id, sourceId: source.id, code: err.code, detail: err.detail });
    await prisma.aiSourcePhoto.update({ where: { id: source.id }, data: { analysisStatus: 'FAILED', analysisError: err.code } });
    throw aiError(err.code === 'AI_FAILED' || err.code === 'AI_NO_IMAGE' ? new AiError('AI_FAILED') : err);
  }
});

// ─── Generation ───────────────────────────────────────────────────────────
const inFlight = new Set<string>();

async function runGeneration(generationId: string, supplierId: string, image: { mimeType: string; data: Buffer; sha: string; width: number; height: number }, prompt: string) {
  const started = Date.now();
  try {
    const out = await aiClient().enhance({ mimeType: image.mimeType, data: image.data }, prompt, closestAspectRatio(image.width, image.height));
    // Validate the real output: a decodable image of usable size that is not simply the original returned back.
    const mime = sniffMime(out.data);
    if (!mime || !IMAGE_MIMES.includes(mime)) throw new AiError('AI_INVALID_OUTPUT', `output signature ${out.mimeType}`);
    const dims = imageDimensions(out.data, mime);
    if (!dims || Math.min(dims.width, dims.height) < 256) throw new AiError('AI_INVALID_OUTPUT', `output dims ${JSON.stringify(dims)}`);
    if (sha256(out.data) === image.sha) throw new AiError('AI_NO_IMAGE', 'output identical to input');
    const key = newKey(`private/ai/${supplierId}/generated`, mime);
    await storage.put(key, out.data);
    await prisma.aiGeneration.update({
      where: { id: generationId },
      data: { status: 'COMPLETED', storageKey: key, mimeType: mime, sizeBytes: out.data.length, width: dims.width, height: dims.height, durationMs: Date.now() - started, completedAt: new Date() },
    });
  } catch (e) {
    const err = classifyAiError(e);
    log('error', 'ai generation failed', { generationId, code: err.code, detail: err.detail });
    await prisma.aiGeneration.update({ where: { id: generationId }, data: { status: 'FAILED', errorCode: err.code, durationMs: Date.now() - started, completedAt: new Date() } }).catch(() => undefined);
  } finally {
    inFlight.delete(supplierId);
  }
}

/** Starts one generation (explicit action). Returns 202 immediately; poll GET /generations/:id. */
aiRouter.post('/generations', aiLimiter, async (req, res) => {
  const input = parse(aiGenerateSchema, req.body);
  const s = await aiSupplier(req);
  const source = await prisma.aiSourcePhoto.findFirst({ where: { id: input.sourceId, supplierId: s.id }, include: { product: { select: { category: { select: { path: true } } } } } });
  if (!source) throw notFound('Photo not found.');
  const analysis = source.analysis as AiGarmentAnalysis | null;
  if (source.analysisStatus !== 'COMPLETED' || !analysis) throw unprocessable('Analyse the photo first so the enhancement can be matched to your garment.');
  if ((analysis.possibleDefects.length > 0 || !analysis.safeToEnhance) && !input.defectsAcknowledged) {
    throw unprocessable('Please review the analysis warnings and confirm before generating.', { needsAcknowledgement: true });
  }
  try {
    aiClient();
  } catch (e) {
    throw aiError(classifyAiError(e));
  }
  // One generation at a time per supplier: protects against double clicks and parallel tabs.
  // The in-process lock is taken synchronously (no await between check and set), so two
  // simultaneous requests cannot both pass; the database check covers jobs from before a restart.
  if (inFlight.has(s.id)) throw conflict('An enhancement is already being generated. Please wait for it to finish.');
  inFlight.add(s.id);
  try {
    const running = await prisma.aiGeneration.findFirst({ where: { supplierId: s.id, status: 'GENERATING' }, select: { id: true, createdAt: true } });
    if (running) {
      const stale = Date.now() - running.createdAt.getTime() > config.ai.timeoutMs + 60_000;
      if (!stale) throw conflict('An enhancement is already being generated. Please wait for it to finish.');
      await prisma.aiGeneration.update({ where: { id: running.id }, data: { status: 'FAILED', errorCode: 'AI_TIMEOUT', completedAt: new Date() } });
    }
    const u = await usage(s.id);
    if (u.generations >= u.generationLimit) throw new HttpError(429, `You have reached today's limit of ${u.generationLimit} AI enhancements. Please try again tomorrow.`, 'AI_DAILY_LIMIT');
    const categoryPath = input.categoryPath || source.product?.category.path || undefined;
    const prompt = buildEditPrompt({ ...input, categoryPath, analysis });
    const generation = await prisma.aiGeneration.create({
      data: {
        supplierId: s.id, sourceId: source.id, background: input.background, mode: input.mode, level: input.level,
        garmentType: input.garmentType, colour: input.colour, categoryPath: categoryPath ?? null, model: config.ai.imageModel, prompt,
      },
    });
    await audit(req.user!.id, 'ai.generation.started', 'AiGeneration', generation.id, { sourceId: source.id, background: input.background, mode: input.mode, level: input.level, model: config.ai.imageModel });
    const data = await storage.get(source.storageKey);
    void runGeneration(generation.id, s.id, { mimeType: source.mimeType, data, sha: source.sha256, width: source.width, height: source.height }, prompt);
    res.status(202).json({ generation: generationView(generation) });
  } catch (e) {
    inFlight.delete(s.id);
    throw e;
  }
});

aiRouter.get('/generations', async (req, res) => {
  const s = await aiSupplier(req);
  const { sourceId } = parse(z.object({ sourceId: z.string().optional() }), req.query);
  const rows = await prisma.aiGeneration.findMany({
    where: { supplierId: s.id, ...(sourceId ? { sourceId } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 60,
    include: { source: { select: { id: true, productId: true } }, productImage: { select: { productId: true } } },
  });
  res.json({ generations: rows.map((g) => ({ ...generationView(g), sourceUrl: `/api/supplier/ai/files/source/${g.sourceId}`, productId: g.productImage?.productId ?? g.source.productId })), usage: await usage(s.id) });
});

aiRouter.get('/generations/:id', async (req, res) => {
  const s = await aiSupplier(req);
  const g = await prisma.aiGeneration.findFirst({ where: { id: String(req.params.id), supplierId: s.id } });
  if (!g) throw notFound('Enhancement not found.');
  res.json({ generation: generationView(g) });
});

/** Accepts a version into a listing as a NEW photo (pending review). The original is never replaced. */
aiRouter.post('/generations/:id/accept', async (req, res) => {
  const body = parse(z.object({ productId: z.string().min(1, 'Choose the listing for this photo'), includeOriginal: z.boolean().optional(), makePrimary: z.boolean().optional() }), req.body);
  const s = await aiSupplier(req);
  const g = await prisma.aiGeneration.findFirst({ where: { id: String(req.params.id), supplierId: s.id }, include: { source: true } });
  if (!g) throw notFound('Enhancement not found.');
  if (g.status === 'ACCEPTED') throw conflict('This version has already been added to a listing.');
  if (g.status !== 'COMPLETED' || !g.storageKey || !g.mimeType) throw unprocessable('Only a finished enhancement can be accepted.');
  const product = await prisma.product.findFirst({ where: { id: body.productId, supplierId: s.id }, include: { images: { select: { id: true, sha256: true, sortOrder: true }, orderBy: { sortOrder: 'asc' } } } });
  if (!product) throw notFound('Product not found.');
  if (product.status === 'ARCHIVED') throw unprocessable('This listing is archived. Restore it before adding photos.');

  const generated = await storage.get(g.storageKey);
  const genHash = sha256(generated);
  const hashes = new Set(product.images.map((i) => i.sha256).filter(Boolean));
  const original = body.includeOriginal && !g.source.productImageId && !hashes.has(g.source.sha256) ? await storage.get(g.source.storageKey) : null;
  if (product.images.length + 1 + (original ? 1 : 0) > 12) throw unprocessable('A listing can have up to 12 photos. Remove a photo first.');
  if (hashes.has(genHash)) throw conflict('This photo is already on the listing.');

  const toCreate: { buf: Buffer; mime: string; w: number; h: number; ai: boolean; hash: string; name: string }[] = [];
  if (original) toCreate.push({ buf: original, mime: g.source.mimeType, w: g.source.width, h: g.source.height, ai: false, hash: g.source.sha256, name: 'original-photo' });
  toCreate.push({ buf: generated, mime: g.mimeType, w: g.width!, h: g.height!, ai: true, hash: genHash, name: 'dhaaga-ai-enhanced' });

  const keys: string[] = [];
  try {
    for (const c of toCreate) {
      const key = newKey('public/products', c.mime);
      await storage.put(key, c.buf);
      keys.push(key);
    }
    const created = await prisma.$transaction(async (tx) => {
      const images = [];
      for (const [i, c] of toCreate.entries()) {
        images.push(
          await tx.productImage.create({
            data: {
              productId: product.id, storageKey: keys[i]!, url: storage.publicUrl(keys[i]!), originalFilename: `${c.name}.${c.mime.split('/')[1]}`,
              mimeType: c.mime, sizeBytes: c.buf.length, width: c.w, height: c.h, sortOrder: product.images.length + i, usageRights: 'SUPPLIER_OWNED',
              altText: product.title, sha256: c.hash, aiEnhanced: c.ai,
            },
          }),
        );
      }
      const enhanced = images[images.length - 1]!;
      const claimed = await tx.aiGeneration.updateMany({ where: { id: g.id, status: 'COMPLETED' }, data: { status: 'ACCEPTED', productImageId: enhanced.id, decidedAt: new Date() } });
      if (!claimed.count) throw conflict('This version has already been added to a listing.');
      if (body.makePrimary) {
        const order = [enhanced.id, ...product.images.map((i) => i.id), ...images.slice(0, -1).map((i) => i.id)];
        for (const [sortOrder, id] of order.entries()) await tx.productImage.update({ where: { id }, data: { sortOrder } });
      }
      if (product.status === 'APPROVED') await tx.product.update({ where: { id: product.id }, data: { status: 'DRAFT' } });
      return images;
    });
    await audit(req.user!.id, 'ai.generation.accepted', 'AiGeneration', g.id, { productId: product.id, productImageId: created[created.length - 1]!.id, includeOriginal: !!original });
    res.status(201).json({ images: created });
  } catch (e) {
    await Promise.all(keys.map((k) => storage.delete(k).catch(() => undefined)));
    throw e;
  }
});

aiRouter.post('/generations/:id/discard', async (req, res) => {
  const s = await aiSupplier(req);
  const r = await prisma.aiGeneration.updateMany({ where: { id: String(req.params.id), supplierId: s.id, status: { in: ['COMPLETED', 'FAILED'] } }, data: { status: 'DISCARDED', decidedAt: new Date() } });
  if (!r.count) {
    const exists = await prisma.aiGeneration.findFirst({ where: { id: String(req.params.id), supplierId: s.id }, select: { status: true } });
    if (!exists) throw notFound('Enhancement not found.');
    throw unprocessable(exists.status === 'ACCEPTED' ? 'This version is already on a listing — remove it from the listing photos instead.' : 'This enhancement cannot be discarded right now.');
  }
  res.json({ ok: true });
});

// ─── Private files (owner only) ───────────────────────────────────────────
aiRouter.get('/files/:kind/:id', async (req, res) => {
  const s = await aiSupplier(req);
  const { kind, id } = req.params;
  const row =
    kind === 'source'
      ? await prisma.aiSourcePhoto.findFirst({ where: { id, supplierId: s.id }, select: { storageKey: true, mimeType: true } })
      : kind === 'generation'
        ? await prisma.aiGeneration.findFirst({ where: { id, supplierId: s.id }, select: { storageKey: true, mimeType: true } })
        : null;
  if (!row?.storageKey || !row.mimeType) throw notFound('File not found.');
  const data = await storage.get(row.storageKey).catch(() => null);
  if (!data) throw notFound('File not found.');
  res.setHeader('Content-Type', row.mimeType);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.query.download === '1') res.setHeader('Content-Disposition', `attachment; filename="dhaaga-${kind === 'source' ? 'original' : 'ai-enhanced'}-${id}.${row.mimeType.split('/')[1]}"`);
  res.send(data);
});
