import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { FILTER_SETS } from '@dhaaga/shared';
import { prisma } from '../lib/prisma.js';
import { requireRole } from '../middleware/auth.js';
import { parse } from '../middleware/validate.js';
import { badRequest, notFound, paginate, unprocessable } from '../lib/http.js';
import { audit, notify } from '../lib/audit.js';
import { storage } from '../lib/storage.js';

export const adminRouter = Router();
adminRouter.use(requireRole('ADMIN'));

adminRouter.get('/overview', async (_req, res) => {
  const genuine = { isFixture: false } as const;
  const [retailers, suppliersByStatus, productsByStatus, genuineOrders, ordersByStatus, openComplaints, verifiedSuppliers, unhandledMessages, pendingDocuments, recent] = await Promise.all([
    prisma.retailer.count(),
    prisma.supplier.groupBy({ by: ['status'], where: genuine, _count: { _all: true } }),
    prisma.product.groupBy({ by: ['status'], where: genuine, _count: { _all: true } }),
    // An order counts as genuine when at least one of its supplier groups belongs to a real (non-fixture) supplier.
    prisma.order.count({ where: { supplierOrders: { some: { supplier: genuine } } } }),
    prisma.order.groupBy({ by: ['status'], where: { supplierOrders: { some: { supplier: genuine } } }, _count: { _all: true } }),
    prisma.complaint.count({ where: { status: { in: ['OPEN', 'IN_REVIEW'] } } }),
    prisma.supplier.count({ where: { isVerified: true, ...genuine } }),
    prisma.contactMessage.count({ where: { handled: false } }),
    prisma.supplierDocument.count({ where: { status: 'PENDING', supplier: genuine } }),
    prisma.supplier.findMany({
      where: { ...genuine, status: { in: ['PENDING_REVIEW', 'INFO_REQUESTED'] } },
      orderBy: { submittedAt: 'asc' },
      take: 5,
      select: { id: true, businessName: true, city: true, status: true, submittedAt: true, createdAt: true },
    }),
  ]);
  const toMap = (rows: { status: string; _count: { _all: number } }[]) => Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
  const suppliers = toMap(suppliersByStatus);
  const products = toMap(productsByStatus);
  const total = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0);
  res.json({
    stats: {
      totalSuppliers: total(suppliers),
      pendingSuppliers: suppliers.PENDING_REVIEW ?? 0,
      infoRequestedSuppliers: suppliers.INFO_REQUESTED ?? 0,
      approvedSuppliers: suppliers.APPROVED ?? 0,
      rejectedSuppliers: suppliers.REJECTED ?? 0,
      totalRetailers: retailers,
      publishedProducts: products.APPROVED ?? 0,
      pendingProducts: products.PENDING_REVIEW ?? 0,
      genuineOrders,
      verifiedSuppliers,
      pendingDocuments,
      openComplaints,
      unhandledMessages,
    },
    suppliers,
    products,
    orders: toMap(ordersByStatus),
    awaitingReview: recent,
  });
});

// ─── Suppliers ───────────────────────────────────────────────────────────
const SUPPLIER_STATUSES = ['INCOMPLETE', 'PENDING_REVIEW', 'INFO_REQUESTED', 'APPROVED', 'REJECTED', 'SUSPENDED'] as const;
const supplierListQuery = z.object({
  status: z.enum(SUPPLIER_STATUSES).optional().or(z.literal('').transform(() => undefined)),
  q: z.string().trim().max(100).optional(),
  businessType: z.enum(['WHOLESALER', 'MANUFACTURER', 'DISTRIBUTOR', 'RETAILER', 'BOUTIQUE_OWNER', 'RESELLER']).optional().or(z.literal('').transform(() => undefined)),
  state: z.string().trim().max(60).optional(),
  sort: z.enum(['registered_desc', 'registered_asc', 'submitted_desc', 'submitted_asc', 'name']).default('registered_desc'),
  fixtures: z.enum(['include', 'exclude']).default('exclude'),
});

adminRouter.get('/suppliers', async (req, res) => {
  // Malformed filters are a bad request (400), not a validation failure of submitted data.
  const parsed = supplierListQuery.safeParse(req.query);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Invalid supplier filter.');
  const f = parsed.data;
  const { skip, take, page, pageSize } = paginate(req.query as Record<string, unknown>, { pageSize: 20, max: 100 });
  const where: Prisma.SupplierWhereInput = {
    ...(f.status ? { status: f.status } : {}),
    ...(f.businessType ? { businessType: f.businessType } : {}),
    ...(f.state ? { state: { equals: f.state, mode: 'insensitive' } } : {}),
    ...(f.fixtures === 'exclude' ? { isFixture: false } : {}),
    ...(f.q
      ? {
          OR: [
            { businessName: { contains: f.q, mode: 'insensitive' } },
            { contactName: { contains: f.q, mode: 'insensitive' } },
            { phone: { contains: f.q } },
            { gstin: { contains: f.q, mode: 'insensitive' } },
            { city: { contains: f.q, mode: 'insensitive' } },
            { user: { email: { contains: f.q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
  const orderBy: Prisma.SupplierOrderByWithRelationInput[] = {
    registered_desc: [{ createdAt: 'desc' as const }],
    registered_asc: [{ createdAt: 'asc' as const }],
    submitted_desc: [{ submittedAt: { sort: 'desc' as const, nulls: 'last' as const } }, { createdAt: 'desc' as const }],
    submitted_asc: [{ submittedAt: { sort: 'asc' as const, nulls: 'last' as const } }, { createdAt: 'asc' as const }],
    name: [{ businessName: 'asc' as const }],
  }[f.sort];
  const [total, suppliers, counts] = await Promise.all([
    prisma.supplier.count({ where }),
    prisma.supplier.findMany({
      where,
      orderBy,
      skip,
      take,
      select: {
        id: true, businessName: true, businessType: true, contactName: true, phone: true, gstin: true, city: true, state: true,
        status: true, isVerified: true, isFixture: true, submittedAt: true, createdAt: true,
        user: { select: { email: true } },
        _count: { select: { documents: true, products: true } },
      },
    }),
    prisma.supplier.groupBy({ by: ['status'], where: f.fixtures === 'exclude' ? { isFixture: false } : {}, _count: { _all: true } }),
  ]);
  res.json({ suppliers, total, page, pageSize, statusCounts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) });
});

adminRouter.get('/suppliers/:id', async (req, res) => {
  const supplier = await prisma.supplier.findUnique({
    where: { id: req.params.id },
    include: {
      user: { select: { email: true, fullName: true, phone: true, createdAt: true, lastLoginAt: true } },
      documents: { orderBy: { uploadedAt: 'desc' }, select: { id: true, type: true, fileName: true, mimeType: true, sizeBytes: true, status: true, reviewNote: true, uploadedAt: true } },
      products: { orderBy: { updatedAt: 'desc' }, select: { id: true, title: true, status: true } },
    },
  });
  if (!supplier) throw notFound('Supplier not found.');
  const [reviewer, history] = await Promise.all([
    supplier.reviewedById ? prisma.user.findUnique({ where: { id: supplier.reviewedById }, select: { email: true, fullName: true } }) : null,
    prisma.auditLog.findMany({
      where: { OR: [{ entityType: 'Supplier', entityId: supplier.id }, { entityType: 'SupplierDocument', entityId: { in: supplier.documents.map((d) => d.id) } }] },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, action: true, metadata: true, createdAt: true, actor: { select: { email: true } } },
    }),
  ]);
  res.json({ supplier, reviewer, history });
});

const DECISION_RULES = {
  APPROVED: ['PENDING_REVIEW', 'INFO_REQUESTED', 'REJECTED', 'SUSPENDED'],
  REJECTED: ['PENDING_REVIEW', 'INFO_REQUESTED'],
  INFO_REQUESTED: ['PENDING_REVIEW'],
  SUSPENDED: ['APPROVED'],
} as const;

adminRouter.post('/suppliers/:id/decision', async (req, res) => {
  const { decision, reason } = parse(
    z.object({ decision: z.enum(['APPROVED', 'REJECTED', 'INFO_REQUESTED', 'SUSPENDED']), reason: z.string().trim().max(1000).optional() }),
    req.body,
  );
  if (decision !== 'APPROVED' && (!reason || reason.length < 5)) {
    throw unprocessable(decision === 'INFO_REQUESTED' ? 'Tell the supplier what information is needed.' : 'Please give the supplier a reason (at least 5 characters).');
  }
  const supplier = await prisma.supplier.findUnique({ where: { id: req.params.id } });
  if (!supplier) throw notFound('Supplier not found.');
  if (!(DECISION_RULES[decision] as readonly string[]).includes(supplier.status)) {
    throw unprocessable(`A ${supplier.status.toLowerCase().replace('_', ' ')} application cannot be ${decision === 'INFO_REQUESTED' ? 'sent back for more information' : decision.toLowerCase()}.`);
  }
  const now = new Date();
  await prisma.supplier.update({
    where: { id: supplier.id },
    data: {
      status: decision,
      rejectionReason: decision === 'REJECTED' || decision === 'SUSPENDED' ? reason : null,
      infoRequest: decision === 'INFO_REQUESTED' ? reason : null,
      reviewedAt: now,
      reviewedById: req.user!.id,
      ...(decision === 'APPROVED' ? { approvedAt: now } : {}),
      ...(decision === 'REJECTED' || decision === 'SUSPENDED' ? { isVerified: false, verifiedAt: null } : {}),
    },
  });
  const messages = {
    APPROVED: ['Your supplier account has been approved', 'You can now continue with product publishing.'],
    REJECTED: ['Your application requires attention', reason ?? ''],
    INFO_REQUESTED: ['Additional information required', reason ?? ''],
    SUSPENDED: ['Your supplier account is suspended', reason ?? ''],
  } as const;
  await notify(supplier.userId, `SUPPLIER_${decision}`, messages[decision][0], messages[decision][1], '/supplier');
  await audit(req.user!.id, `supplier.${decision === 'INFO_REQUESTED' ? 'info_requested' : decision.toLowerCase()}`, 'Supplier', supplier.id, {
    from: supplier.status,
    to: decision,
    reason: reason ?? null,
  });
  res.json({ ok: true });
});

/** Verification is a separate, deliberate admin action — it requires an accepted document. */
adminRouter.post('/suppliers/:id/verification', async (req, res) => {
  const { verified } = parse(z.object({ verified: z.boolean() }), req.body);
  const supplier = await prisma.supplier.findUnique({ where: { id: req.params.id }, include: { documents: { where: { status: 'ACCEPTED' } } } });
  if (!supplier) throw notFound('Supplier not found.');
  if (verified) {
    if (supplier.status !== 'APPROVED') throw unprocessable('Approve the supplier before marking them verified.');
    if (supplier.documents.length === 0) throw unprocessable('Accept at least one verification document first.');
  }
  await prisma.supplier.update({ where: { id: supplier.id }, data: { isVerified: verified, verifiedAt: verified ? new Date() : null } });
  await audit(req.user!.id, verified ? 'supplier.verified' : 'supplier.unverified', 'Supplier', supplier.id);
  res.json({ ok: true });
});

/** Verification document queue across all suppliers. */
adminRouter.get('/documents', async (req, res) => {
  const raw = typeof req.query.status === 'string' ? req.query.status : 'PENDING';
  if (!['PENDING', 'ACCEPTED', 'REJECTED', 'ALL'].includes(raw)) throw badRequest('Unknown document status filter.');
  const { skip, take, page, pageSize } = paginate(req.query as Record<string, unknown>, { pageSize: 25, max: 100 });
  const where: Prisma.SupplierDocumentWhereInput = { ...(raw === 'ALL' ? {} : { status: raw as 'PENDING' | 'ACCEPTED' | 'REJECTED' }), supplier: { isFixture: false } };
  const [total, documents] = await Promise.all([
    prisma.supplierDocument.count({ where }),
    prisma.supplierDocument.findMany({
      where,
      orderBy: { uploadedAt: raw === 'PENDING' ? 'asc' : 'desc' },
      skip,
      take,
      select: {
        id: true, type: true, fileName: true, mimeType: true, sizeBytes: true, status: true, reviewNote: true, uploadedAt: true, reviewedAt: true,
        supplier: { select: { id: true, businessName: true, status: true, city: true } },
      },
    }),
  ]);
  res.json({ documents, total, page, pageSize });
});

adminRouter.post('/documents/:id/review', async (req, res) => {
  const { status, note } = parse(z.object({ status: z.enum(['ACCEPTED', 'REJECTED']), note: z.string().trim().max(500).optional() }), req.body);
  const doc = await prisma.supplierDocument.findUnique({ where: { id: req.params.id } });
  if (!doc) throw notFound('Document not found.');
  await prisma.supplierDocument.update({ where: { id: doc.id }, data: { status, reviewNote: note || null, reviewedAt: new Date() } });
  await audit(req.user!.id, `document.${status.toLowerCase()}`, 'SupplierDocument', doc.id, { supplierId: doc.supplierId, note: note || null });
  if (status === 'REJECTED') {
    const owner = await prisma.supplier.findUnique({ where: { id: doc.supplierId }, select: { userId: true } });
    if (owner) await notify(owner.userId, 'DOCUMENT_REJECTED', 'A verification document needs replacing', `${doc.fileName}: ${note || 'Please upload a clearer or valid copy.'}`, '/supplier/profile');
  }
  res.json({ ok: true });
});

adminRouter.get('/documents/:id/file', async (req, res) => {
  const doc = await prisma.supplierDocument.findUnique({ where: { id: req.params.id } });
  if (!doc) throw notFound('Document not found.');
  const data = await storage.get(doc.storageKey);
  const download = req.query.download === '1';
  await audit(req.user!.id, download ? 'document.downloaded' : 'document.viewed', 'SupplierDocument', doc.id, { supplierId: doc.supplierId });
  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${doc.fileName.replace(/[^\w.\- ]/g, '_')}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  // Documents are untrusted supplier files. Uploads were signature-checked as PDF/JPEG/PNG and are sent
  // with nosniff, so they can never be interpreted as HTML. Images are additionally sandboxed; PDFs are not,
  // because Chrome refuses to render PDFs in sandboxed documents. Only this admin portal may frame them.
  res.setHeader(
    'Content-Security-Policy',
    doc.mimeType === 'application/pdf' ? "default-src 'none'; frame-ancestors 'self'" : "default-src 'none'; img-src 'self'; frame-ancestors 'self'; sandbox",
  );
  res.send(data);
});

// ─── Products ────────────────────────────────────────────────────────────
const PRODUCT_VIEWS = {
  pending: { status: 'PENDING_REVIEW' },
  live: { status: 'APPROVED' },
  unpublished: { status: { in: ['REJECTED', 'ARCHIVED', 'DRAFT'] } },
  all: {},
} satisfies Record<string, Prisma.ProductWhereInput>;

adminRouter.get('/products', async (req, res) => {
  const legacy: Record<string, keyof typeof PRODUCT_VIEWS> = { PENDING_REVIEW: 'pending', APPROVED: 'live', REJECTED: 'unpublished', DRAFT: 'unpublished', ARCHIVED: 'unpublished', ALL: 'all' };
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  if (status && !legacy[status]) throw badRequest('Unknown listing status filter.');
  const rawView = String(req.query.view ?? (status ? legacy[status] : 'pending'));
  if (!(rawView in PRODUCT_VIEWS)) throw badRequest('Unknown listing view.');
  const view = rawView as keyof typeof PRODUCT_VIEWS;
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  const { skip, take, page, pageSize } = paginate(req.query as Record<string, unknown>, { pageSize: 20, max: 100 });
  const where: Prisma.ProductWhereInput = {
    ...PRODUCT_VIEWS[view],
    ...(req.query.fixtures === 'include' ? {} : { isFixture: false }),
    ...(q ? { OR: [{ title: { contains: q, mode: 'insensitive' } }, { supplier: { businessName: { contains: q, mode: 'insensitive' } } }, { category: { name: { contains: q, mode: 'insensitive' } } }] } : {}),
  };
  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: view === 'pending' ? [{ submittedAt: 'asc' }] : [{ updatedAt: 'desc' }],
      skip,
      take,
      include: {
        supplier: { select: { id: true, businessName: true, status: true } },
        category: { select: { name: true, path: true } },
        images: { orderBy: { sortOrder: 'asc' } },
        variants: true,
      },
    }),
  ]);
  res.json({ products, total, page, pageSize });
});

adminRouter.post('/products/:id/decision', async (req, res) => {
  const { decision, reason } = parse(
    z.object({ decision: z.enum(['APPROVED', 'REJECTED', 'UNPUBLISHED']), reason: z.string().trim().max(1000).optional() }),
    req.body,
  );
  if (decision !== 'APPROVED' && !reason) throw unprocessable('Please give the supplier a reason.');
  const product = await prisma.product.findUnique({ where: { id: String(req.params.id) }, include: { supplier: true, images: true } });
  if (!product) throw notFound('Product not found.');
  if (decision === 'APPROVED') {
    if (!['PENDING_REVIEW', 'REJECTED'].includes(product.status)) throw unprocessable('Only listings submitted for review (or previously unpublished) can be published.');
    if (product.supplier.status !== 'APPROVED') throw unprocessable('The supplier must be approved first.');
    if (product.images.length === 0) throw unprocessable('A listing needs at least one photo.');
  }
  if (decision === 'REJECTED' && product.status !== 'PENDING_REVIEW') throw unprocessable('Only listings awaiting review can be rejected. Use unpublish for live listings.');
  if (decision === 'UNPUBLISHED' && product.status !== 'APPROVED') throw unprocessable('Only live listings can be unpublished.');

  // Unpublishing takes a live listing down and returns it to the supplier with the reason.
  const status = decision === 'APPROVED' ? 'APPROVED' : 'REJECTED';
  const rejectionReason = decision === 'APPROVED' ? null : decision === 'UNPUBLISHED' ? `Unpublished by Dhaaga Bazaar: ${reason}` : reason;
  await prisma.$transaction([
    prisma.product.update({
      where: { id: product.id },
      data: { status, rejectionReason, approvedAt: decision === 'APPROVED' ? new Date() : product.approvedAt, reviewedById: req.user!.id },
    }),
    ...(decision === 'UNPUBLISHED'
      ? []
      : [prisma.productImage.updateMany({ where: { productId: product.id, status: 'PENDING' }, data: { status: decision === 'APPROVED' ? 'ACCEPTED' : 'REJECTED' } })]),
  ]);
  const messages = {
    APPROVED: ['Listing published', `"${product.title}" is now live in the catalogue.`],
    REJECTED: ['Listing needs changes', `"${product.title}": ${reason}`],
    UNPUBLISHED: ['Listing unpublished', `"${product.title}" was taken down: ${reason}`],
  } as const;
  await notify(product.supplier.userId, `PRODUCT_${decision}`, messages[decision][0], messages[decision][1], `/supplier/products/${product.id}`);
  await audit(req.user!.id, `product.${decision.toLowerCase()}`, 'Product', product.id, { reason: reason ?? null });
  res.json({ ok: true });
});

// ─── Categories ──────────────────────────────────────────────────────────
adminRouter.get('/categories', async (_req, res) => {
  const categories = await prisma.category.findMany({ orderBy: [{ depth: 'asc' }, { sortOrder: 'asc' }], include: { _count: { select: { products: true } } } });
  res.json({ categories, filterSets: Object.keys(FILTER_SETS) });
});

const categorySchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens'),
  parentPath: z.string().trim().optional().or(z.literal('')),
  title: z.string().trim().max(120).optional().or(z.literal('')),
  description: z.string().trim().min(5).max(400),
  filterSet: z.enum(Object.keys(FILTER_SETS) as [string, ...string[]]),
  keywords: z.array(z.string().trim().max(40)).max(20).default([]),
  // Admin-created categories sort after the seeded taxonomy unless an order is given.
  sortOrder: z.coerce.number().int().min(0).max(10000).default(1000),
});

adminRouter.post('/categories', async (req, res) => {
  const data = parse(categorySchema, req.body);
  const parent = data.parentPath ? await prisma.category.findUnique({ where: { path: data.parentPath } }) : null;
  if (data.parentPath && !parent) throw unprocessable('Parent category not found.');
  const path = parent ? `${parent.path}/${data.slug}` : data.slug;
  const category = await prisma.category.create({
    data: {
      path, slug: data.slug, name: data.name, title: data.title || `Wholesale ${data.name}`, description: data.description,
      filterSet: data.filterSet, keywords: data.keywords, depth: parent ? parent.depth + 1 : 0, sortOrder: data.sortOrder, parentId: parent?.id ?? null,
    },
  });
  await audit(req.user!.id, 'category.created', 'Category', category.id, { path });
  res.status(201).json({ category });
});

adminRouter.patch('/categories/:id', async (req, res) => {
  const data = parse(
    z.object({
      name: z.string().trim().min(2).max(80).optional(),
      title: z.string().trim().max(120).optional(),
      description: z.string().trim().min(5).max(400).optional(),
      isActive: z.boolean().optional(),
      sortOrder: z.coerce.number().int().min(0).max(1000).optional(),
      filterSet: z.enum(Object.keys(FILTER_SETS) as [string, ...string[]]).optional(),
    }),
    req.body,
  );
  const category = await prisma.category.update({ where: { id: req.params.id }, data });
  await audit(req.user!.id, 'category.updated', 'Category', category.id, data);
  res.json({ category });
});

// ─── Retailers ───────────────────────────────────────────────────────────
adminRouter.get('/retailers', async (req, res) => {
  const { skip, take, page, pageSize } = paginate(req.query as Record<string, unknown>, { pageSize: 20, max: 200 });
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  const where: Prisma.RetailerWhereInput = q
    ? {
        OR: [
          { businessName: { contains: q, mode: 'insensitive' } },
          { city: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q } },
          { user: { email: { contains: q, mode: 'insensitive' } } },
          { user: { fullName: { contains: q, mode: 'insensitive' } } },
        ],
      }
    : {};
  const [total, retailers] = await Promise.all([
    prisma.retailer.count({ where }),
    prisma.retailer.findMany({
      where, orderBy: { createdAt: 'desc' }, skip, take,
      include: { user: { select: { email: true, fullName: true, isActive: true, lastLoginAt: true } }, _count: { select: { orders: true } } },
    }),
  ]);
  res.json({ retailers, total, page, pageSize });
});

adminRouter.post('/users/:id/active', async (req, res) => {
  const { isActive } = parse(z.object({ isActive: z.boolean() }), req.body);
  if (req.params.id === req.user!.id) throw unprocessable('You cannot deactivate your own account.');
  await prisma.user.update({ where: { id: req.params.id }, data: { isActive, tokenVersion: { increment: 1 } } });
  await audit(req.user!.id, isActive ? 'user.activated' : 'user.deactivated', 'User', req.params.id);
  res.json({ ok: true });
});

// ─── Orders & fulfilment monitoring ──────────────────────────────────────
adminRouter.get('/orders', async (_req, res) => {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      retailer: { select: { businessName: true, city: true } },
      supplierOrders: { include: { supplier: { select: { businessName: true } }, commission: true, shipments: true, _count: { select: { items: true } } } },
    },
  });
  res.json({ orders });
});

adminRouter.post('/supplier-orders/:id/commission', async (req, res) => {
  const { rateBps, status, notes } = parse(
    z.object({ rateBps: z.coerce.number().int().min(0).max(5000), status: z.enum(['PENDING', 'INVOICED', 'PAID', 'WAIVED']).default('PENDING'), notes: z.string().trim().max(500).optional() }),
    req.body,
  );
  const so = await prisma.supplierOrder.findUnique({ where: { id: req.params.id } });
  if (!so) throw notFound('Order group not found.');
  if (!['CONFIRMED', 'PROCESSING', 'DISPATCHED', 'DELIVERED'].includes(so.status)) throw unprocessable('Commission can only be recorded for confirmed orders.');
  const amountPaise = Math.round((so.subtotalPaise * rateBps) / 10_000);
  const commission = await prisma.commission.upsert({
    where: { supplierOrderId: so.id },
    create: { supplierOrderId: so.id, supplierId: so.supplierId, rateBps, amountPaise, status, notes: notes || null, recordedById: req.user!.id },
    update: { rateBps, amountPaise, status, notes: notes || null, recordedById: req.user!.id },
  });
  await audit(req.user!.id, 'commission.recorded', 'Commission', commission.id, { rateBps, amountPaise, status });
  res.json({ commission });
});

adminRouter.get('/commissions', async (_req, res) => {
  const commissions = await prisma.commission.findMany({
    orderBy: { createdAt: 'desc' },
    include: { supplier: { select: { businessName: true } }, supplierOrder: { select: { subtotalPaise: true, order: { select: { orderNumber: true } } } } },
  });
  res.json({ commissions });
});

// ─── Complaints ──────────────────────────────────────────────────────────
adminRouter.get('/complaints', async (_req, res) => {
  const complaints = await prisma.complaint.findMany({
    orderBy: { createdAt: 'desc' },
    include: { retailer: { select: { businessName: true } }, order: { select: { orderNumber: true } } },
  });
  res.json({ complaints });
});

adminRouter.patch('/complaints/:id', async (req, res) => {
  const { status, resolution } = parse(z.object({ status: z.enum(['OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED']), resolution: z.string().trim().max(2000).optional() }), req.body);
  const complaint = await prisma.complaint.update({
    where: { id: req.params.id },
    data: { status, resolution: resolution || undefined, resolvedAt: ['RESOLVED', 'REJECTED'].includes(status) ? new Date() : null },
    include: { retailer: { select: { userId: true } } },
  });
  await notify(complaint.retailer.userId, 'COMPLAINT_UPDATE', 'Complaint updated', `Your complaint "${complaint.subject}" is now ${status.toLowerCase().replace('_', ' ')}.`, '/account/complaints');
  await audit(req.user!.id, 'complaint.updated', 'Complaint', complaint.id, { status });
  res.json({ complaint });
});

adminRouter.get('/messages', async (_req, res) => {
  res.json({ messages: await prisma.contactMessage.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }) });
});
adminRouter.post('/messages/:id/handled', async (req, res) => {
  await prisma.contactMessage.update({ where: { id: req.params.id }, data: { handled: true } });
  res.json({ ok: true });
});

adminRouter.get('/audit-logs', async (req, res) => {
  const { skip, take, page, pageSize } = paginate(req.query as Record<string, unknown>, { pageSize: 50, max: 200 });
  const action = typeof req.query.action === 'string' ? req.query.action.trim().slice(0, 60) : '';
  const entityType = typeof req.query.entityType === 'string' ? req.query.entityType.trim().slice(0, 40) : '';
  const where: Prisma.AuditLogWhereInput = {
    ...(action ? { action: { startsWith: action } } : {}),
    ...(entityType ? { entityType } : {}),
  };
  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take, include: { actor: { select: { email: true } } } }),
  ]);
  res.json({ logs, total, page, pageSize });
});
