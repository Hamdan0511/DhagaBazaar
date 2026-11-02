import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { contactSchema, searchTaxonomy } from '@dhaaga/shared';
import { prisma } from '../lib/prisma.js';
import { listProducts, parseListingQuery, productCardSelect, publicProductWhere, publicSupplierWhere } from '../lib/catalog.js';
import { notFound } from '../lib/http.js';
import { parse } from '../middleware/validate.js';
import { config } from '../config.js';

export const publicRouter = Router();

/** Active categories with genuine counts of public listings. */
publicRouter.get('/categories', async (_req, res) => {
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: [{ depth: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, path: true, slug: true, name: true, title: true, description: true, filterSet: true, keywords: true, depth: true, sortOrder: true, parent: { select: { path: true } } },
  });
  const grouped = await prisma.product.groupBy({ by: ['categoryId'], where: publicProductWhere(), _count: { _all: true } });
  const direct = new Map(grouped.map((g) => [g.categoryId, g._count._all]));
  // Roll counts up to ancestors so "Women's Wear" includes its subcategories.
  const counts = new Map<string, number>();
  for (const c of categories) {
    const n = direct.get(c.id) ?? 0;
    if (!n) continue;
    const parts = c.path.split('/');
    for (let i = 1; i <= parts.length; i++) {
      const p = parts.slice(0, i).join('/');
      counts.set(p, (counts.get(p) ?? 0) + n);
    }
  }
  res.json({
    categories: categories.map(({ parent, ...c }) => ({ ...c, parentPath: parent?.path ?? null, listingCount: counts.get(c.path) ?? 0 })),
  });
});

publicRouter.get('/products', async (req, res) => {
  const result = await listProducts(parseListingQuery(req.query as Record<string, unknown>));
  res.json(result);
});

publicRouter.get('/products/:id', async (req, res) => {
  const product = await prisma.product.findFirst({
    where: { id: req.params.id, ...publicProductWhere() },
    include: {
      category: { select: { path: true, name: true, filterSet: true } },
      variants: { orderBy: [{ colour: 'asc' }, { size: 'asc' }] },
      images: { where: { status: 'ACCEPTED' }, orderBy: { sortOrder: 'asc' }, select: { id: true, url: true, altText: true, attribution: true } },
      supplier: {
        select: { id: true, businessName: true, businessType: true, city: true, state: true, isVerified: true, yearEstablished: true, description: true, isFixture: true, minOrderValuePaise: true },
      },
    },
  });
  if (!product) throw notFound('This listing is not available.');
  const related = await prisma.product.findMany({
    where: { ...publicProductWhere(), categoryId: product.categoryId, id: { not: product.id } },
    take: 4,
    orderBy: { createdAt: 'desc' },
    select: productCardSelect,
  });
  res.json({ product, related });
});

publicRouter.get('/suppliers', async (req, res) => {
  const city = typeof req.query.city === 'string' ? req.query.city : undefined;
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  const suppliers = await prisma.supplier.findMany({
    where: {
      ...publicSupplierWhere(),
      ...(city ? { city: { equals: city, mode: 'insensitive' } } : {}),
      ...(category ? { categoryPaths: { has: category } } : {}),
    },
    orderBy: { businessName: 'asc' },
    select: {
      id: true, businessName: true, businessType: true, city: true, state: true, isVerified: true, categoryPaths: true, isFixture: true,
      _count: { select: { products: { where: publicProductWhere() } } },
    },
  });
  res.json({ suppliers });
});

publicRouter.get('/suppliers/:id', async (req, res) => {
  const supplier = await prisma.supplier.findFirst({
    where: { id: req.params.id, ...publicSupplierWhere() },
    select: {
      id: true, businessName: true, businessType: true, description: true, city: true, state: true, isVerified: true,
      yearEstablished: true, categoryPaths: true, minOrderValuePaise: true, isFixture: true, createdAt: true,
    },
  });
  if (!supplier) throw notFound('This supplier profile is not available.');
  const products = await prisma.product.findMany({
    where: { ...publicProductWhere(), supplierId: supplier.id },
    orderBy: { createdAt: 'desc' },
    select: productCardSelect,
  });
  res.json({ supplier, products });
});

/** Search suggestions: taxonomy matches plus real suppliers/listings only. */
publicRouter.get('/search/suggest', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
  if (q.length < 2) return res.json({ categories: [], suppliers: [], products: [] });
  const [suppliers, products] = await Promise.all([
    prisma.supplier.findMany({
      where: { ...publicSupplierWhere(), businessName: { contains: q, mode: 'insensitive' } },
      take: 4,
      select: { id: true, businessName: true, city: true },
    }),
    prisma.product.findMany({
      where: { ...publicProductWhere(), title: { contains: q, mode: 'insensitive' } },
      take: 5,
      select: { id: true, title: true, category: { select: { name: true } } },
    }),
  ]);
  res.json({ categories: searchTaxonomy(q, 6), suppliers, products });
});

const contactLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: config.env === 'test' ? 1000 : 10, standardHeaders: 'draft-7', legacyHeaders: false });

publicRouter.post('/contact', contactLimiter, async (req, res) => {
  const data = parse(contactSchema, req.body);
  await prisma.contactMessage.create({ data: { ...data, phone: data.phone || null } });
  res.status(201).json({ ok: true });
});

publicRouter.get('/meta', (_req, res) => {
  res.json({ fixturesVisible: config.fixturesVisible, environment: config.env });
});
