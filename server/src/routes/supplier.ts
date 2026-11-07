import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { dispatchSchema, productSchema, priceTierProblem, rupeesToPaise, stockUpdateSchema, supplierProfileSchema, FILTER_SETS, GENERAL_PRODUCT_FIELDS, type FilterSetKey } from '@dhaaga/shared';
import { prisma } from '../lib/prisma.js';
import { requireRole } from '../middleware/auth.js';
import { parse } from '../middleware/validate.js';
import { acceptFiles, DOCUMENT_MIMES, IMAGE_MIMES } from '../middleware/upload.js';
import { newKey, storage } from '../lib/storage.js';
import { badRequest, conflict, notFound, unprocessable } from '../lib/http.js';
import { audit, notify } from '../lib/audit.js';
import { recomputeOrderStatus } from './retailer.js';
import { messageLimiter, uploadLimiter } from '../lib/rateLimits.js';
import { releaseStock } from '../lib/stock.js';
import { imageDimensions, productImageProblem } from '../lib/imageInfo.js';
import { aiRouter } from './ai.js';
import { fulfilmentBlockedReason } from '../lib/payments/service.js';

export const supplierRouter = Router();
supplierRouter.use(requireRole('SUPPLIER'));
supplierRouter.use('/ai', aiRouter);

async function currentSupplier(req: Express.Request) {
  if (!req.user?.supplierId) throw badRequest('Supplier profile missing.');
  return prisma.supplier.findUniqueOrThrow({ where: { id: req.user.supplierId } });
}

const sha256 = (buf: Buffer) => crypto.createHash('sha256').update(buf).digest('hex');

const adminIds = async () => (await prisma.user.findMany({ where: { role: 'ADMIN', isActive: true }, select: { id: true } })).map((u) => u.id);

// ─── Profile & onboarding ────────────────────────────────────────────────
supplierRouter.get('/me', async (req, res) => {
  const supplier = await prisma.supplier.findUniqueOrThrow({
    where: { id: req.user!.supplierId! },
    include: { documents: { orderBy: { uploadedAt: 'desc' }, select: { id: true, type: true, fileName: true, status: true, reviewNote: true, uploadedAt: true, sizeBytes: true } } },
  });
  res.json({ supplier });
});

supplierRouter.put('/profile', async (req, res) => {
  const data = parse(supplierProfileSchema, req.body);
  const s = await currentSupplier(req);
  if (s.status === 'SUSPENDED') throw unprocessable('Your account is suspended. Please contact support.');
  const { minOrderValue, ...rest } = data;
  const supplier = await prisma.supplier.update({
    where: { id: s.id },
    data: {
      ...rest,
      whatsapp: rest.whatsapp || null,
      gstin: rest.gstin || null,
      description: rest.description || null,
      minOrderValuePaise: minOrderValue ? rupeesToPaise(minOrderValue) : null,
      // Changing the legal identity (name, GSTIN, registered address) after verification
      // requires an admin to verify again — the "documents verified" mark must stay true.
      ...(s.isVerified &&
      ((rest.gstin || null) !== s.gstin || rest.businessName !== s.businessName || rest.addressLine !== s.addressLine || rest.pincode !== s.pincode)
        ? { isVerified: false, verifiedAt: null }
        : {}),
    },
  });
  res.json({ supplier });
});

supplierRouter.post('/documents', uploadLimiter, ...acceptFiles('file', DOCUMENT_MIMES, 1), async (req, res) => {
  const { type } = parse(z.object({ type: z.enum(['GST_CERTIFICATE', 'PAN_CARD', 'UDYAM_CERTIFICATE', 'TRADE_LICENSE', 'CANCELLED_CHEQUE', 'OTHER']) }), req.body);
  const s = await currentSupplier(req);
  const count = await prisma.supplierDocument.count({ where: { supplierId: s.id } });
  if (count >= 15) throw unprocessable('You can upload up to 15 documents.');
  const file = (req.files as Express.Multer.File[])[0];
  const key = newKey('private/documents', file.mimetype);
  await storage.put(key, file.buffer);
  const doc = await prisma.supplierDocument.create({
    data: { supplierId: s.id, type, storageKey: key, fileName: file.originalname.slice(0, 200), mimeType: file.mimetype, sizeBytes: file.size },
    select: { id: true, type: true, fileName: true, status: true, uploadedAt: true, sizeBytes: true },
  });
  res.status(201).json({ document: doc });
});

supplierRouter.delete('/documents/:id', async (req, res) => {
  const s = await currentSupplier(req);
  const doc = await prisma.supplierDocument.findFirst({ where: { id: req.params.id, supplierId: s.id } });
  if (!doc) throw notFound('Document not found.');
  if (doc.status === 'ACCEPTED') throw unprocessable('Accepted documents cannot be removed. Contact support to update them.');
  await prisma.supplierDocument.delete({ where: { id: doc.id } });
  await storage.delete(doc.storageKey);
  res.json({ ok: true });
});

supplierRouter.post('/submit', async (req, res) => {
  const s = await currentSupplier(req);
  if (!['INCOMPLETE', 'REJECTED', 'INFO_REQUESTED'].includes(s.status)) throw unprocessable('Your application has already been submitted.');
  const missing: string[] = [];
  if (!s.addressLine || !s.city || !s.state || !s.pincode) missing.push('business address');
  if (s.categoryPaths.length === 0) missing.push('categories you supply');
  // Documents are reviewed for the separate "documents verified" mark; they are encouraged but not required to apply.
  if (missing.length) throw unprocessable(`Please complete: ${missing.join(', ')}.`);
  const resubmission = s.status !== 'INCOMPLETE';
  await prisma.supplier.update({ where: { id: s.id }, data: { status: 'PENDING_REVIEW', submittedAt: new Date(), rejectionReason: null, infoRequest: null } });
  for (const id of await adminIds()) {
    await notify(id, 'SUPPLIER_SUBMITTED', resubmission ? 'Supplier application resubmitted' : 'Supplier application to review', `${s.businessName} ${resubmission ? 'updated and resubmitted' : 'submitted'} their application.`, `/admin/suppliers/${s.id}`);
  }
  await audit(req.user!.id, resubmission ? 'supplier.resubmitted' : 'supplier.submitted', 'Supplier', s.id, { from: s.status });
  res.json({ ok: true });
});

supplierRouter.get('/overview', async (req, res) => {
  const s = await currentSupplier(req);
  const [products, byStatus, openEnquiries, newOrders, activeOrders] = await Promise.all([
    prisma.product.count({ where: { supplierId: s.id } }),
    prisma.product.groupBy({ by: ['status'], where: { supplierId: s.id }, _count: { _all: true } }),
    prisma.enquiry.count({ where: { supplierId: s.id, status: 'OPEN' } }),
    prisma.supplierOrder.count({ where: { supplierId: s.id, status: 'REQUESTED' } }),
    prisma.supplierOrder.count({ where: { supplierId: s.id, status: { in: ['CONFIRMED', 'PROCESSING', 'DISPATCHED'] } } }),
  ]);
  res.json({
    status: s.status,
    isVerified: s.isVerified,
    rejectionReason: s.rejectionReason,
    infoRequest: s.infoRequest,
    submittedAt: s.submittedAt,
    approvedAt: s.approvedAt,
    counts: { products, openEnquiries, newOrders, activeOrders, byStatus: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])) },
  });
});

// ─── Products ────────────────────────────────────────────────────────────
const productInclude = {
  category: { select: { path: true, name: true, filterSet: true } },
  variants: { orderBy: { createdAt: 'asc' as const } },
  images: { orderBy: { sortOrder: 'asc' as const } },
};

supplierRouter.get('/products', async (req, res) => {
  const s = await currentSupplier(req);
  const products = await prisma.product.findMany({ where: { supplierId: s.id }, orderBy: { updatedAt: 'desc' }, include: { category: { select: { name: true, path: true } }, images: { take: 1, orderBy: { sortOrder: 'asc' } }, variants: { select: { id: true, size: true, colour: true, stockQuantity: true }, orderBy: { createdAt: 'asc' } }, _count: { select: { variants: true } } } });
  res.json({ products });
});

supplierRouter.get('/products/:id', async (req, res) => {
  const s = await currentSupplier(req);
  const product = await prisma.product.findFirst({ where: { id: req.params.id, supplierId: s.id }, include: productInclude });
  if (!product) throw notFound('Product not found.');
  res.json({ product });
});

/** Keeps only attributes defined by the category's filter set, with allowed values. */
function cleanAttributes(filterSet: string, raw: Record<string, string | string[] | undefined>) {
  const defs = FILTER_SETS[filterSet as FilterSetKey] ?? [];
  const out: Record<string, string[]> = {};
  for (const def of defs) {
    const v = raw[def.key];
    const values = (Array.isArray(v) ? v : v ? [v] : []).filter((x) => (def.options as readonly string[]).includes(x));
    if (values.length) out[def.key] = [...new Set(values)];
  }
  for (const field of GENERAL_PRODUCT_FIELDS) {
    if (defs.some((d) => d.key === field.key)) continue;
    const v = raw[field.key];
    const value = (Array.isArray(v) ? v[0] : v)?.trim().slice(0, 60);
    if (!value) continue;
    if ('options' in field && !(field.options as readonly string[]).includes(value)) continue;
    out[field.key] = [value];
  }
  return out;
}

async function saveProduct(supplierId: string, body: unknown, productId?: string) {
  const data = parse(productSchema, body);
  const category = await prisma.category.findUnique({ where: { path: data.categoryPath } });
  if (!category || !category.isActive) throw unprocessable('Choose a valid category.');
  if (data.priceUnit === 'SET' && !data.piecesPerSet) throw unprocessable('Enter how many pieces are in a set.');
  const tiers = [...data.priceTiers].sort((a, b) => a.minQty - b.minQty);
  const tierProblem = priceTierProblem(tiers, data.price, data.moq);
  if (tierProblem) throw unprocessable(tierProblem);
  const base = {
    title: data.title,
    slug: data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80),
    description: data.description,
    categoryId: category.id,
    pricePaise: rupeesToPaise(data.price),
    priceUnit: data.priceUnit,
    piecesPerSet: data.priceUnit === 'SET' ? data.piecesPerSet ?? null : null,
    moq: data.moq,
    orderStep: data.orderStep,
    leadTimeDays: data.leadTimeDays ?? null,
    // With size/colour options, stock is tracked per option instead.
    stockQuantity: data.variants.some((v) => v.size || v.colour) ? null : data.stockQuantity ?? null,
    attributes: cleanAttributes(category.filterSet, data.attributes),
    priceTiers: tiers.map((t) => ({ minQty: t.minQty, pricePaise: rupeesToPaise(t.price) })),
  };
  const variants = data.variants
    .filter((v) => v.size || v.colour)
    .map((v) => ({ id: v.id, size: v.size || null, colour: v.colour || null, sku: v.sku || null, pricePaise: v.price ? rupeesToPaise(v.price) : null, stockQuantity: v.stockQuantity ?? null, isAvailable: v.isAvailable }));

  return prisma.$transaction(async (tx) => {
    if (productId) {
      const existing = await tx.product.findFirst({ where: { id: productId, supplierId } });
      if (!existing) throw notFound('Product not found.');
      if (existing.status === 'ARCHIVED') throw unprocessable('Archived products cannot be edited.');
      // Material edits to an approved listing send it back for review.
      const status = existing.status === 'APPROVED' || existing.status === 'REJECTED' ? 'DRAFT' : existing.status;
      // Update options in place so retailers' cart lines (which reference variant ids) survive edits.
      // Only options the supplier removed are deleted.
      const current = await tx.productVariant.findMany({ where: { productId }, select: { id: true } });
      const currentIds = new Set(current.map((v) => v.id));
      const keptIds = new Set(variants.filter((v) => v.id && currentIds.has(v.id)).map((v) => v.id!));
      await tx.productVariant.deleteMany({ where: { productId, id: { notIn: [...keptIds] } } });
      for (const { id, ...v } of variants) {
        if (id && keptIds.has(id)) await tx.productVariant.update({ where: { id }, data: v });
        else await tx.productVariant.create({ data: { ...v, productId } });
      }
      return tx.product.update({ where: { id: productId }, data: { ...base, status }, include: productInclude });
    }
    return tx.product.create({ data: { ...base, supplierId, variants: { create: variants.map(({ id: _id, ...v }) => v) } }, include: productInclude });
  });
}

supplierRouter.post('/products', async (req, res) => {
  const s = await currentSupplier(req);
  if (s.status === 'SUSPENDED') throw unprocessable('Your account is suspended.');
  res.status(201).json({ product: await saveProduct(s.id, req.body) });
});

supplierRouter.put('/products/:id', async (req, res) => {
  const s = await currentSupplier(req);
  res.json({ product: await saveProduct(s.id, req.body, req.params.id) });
});

supplierRouter.post('/products/:id/submit', async (req, res) => {
  const s = await currentSupplier(req);
  // Pending suppliers may queue listings for review; admins can only publish once the supplier is approved.
  if (!['APPROVED', 'PENDING_REVIEW', 'INFO_REQUESTED'].includes(s.status)) throw unprocessable('Your supplier account must be under review or approved before submitting listings.');
  const product = await prisma.product.findFirst({ where: { id: req.params.id, supplierId: s.id }, include: { images: true } });
  if (!product) throw notFound('Product not found.');
  if (!['DRAFT', 'REJECTED'].includes(product.status)) throw unprocessable('This listing is already submitted or published.');
  if (product.images.length === 0) throw unprocessable('Add at least one original product photo before submitting.');
  await prisma.product.update({ where: { id: product.id }, data: { status: 'PENDING_REVIEW', submittedAt: new Date(), rejectionReason: null } });
  for (const id of await adminIds()) await notify(id, 'PRODUCT_SUBMITTED', 'Listing to review', `${s.businessName}: ${product.title}`, '/admin/products/pending');
  res.json({ ok: true });
});

supplierRouter.patch('/products/:id/availability', async (req, res) => {
  const { availability } = parse(z.object({ availability: z.enum(['AVAILABLE', 'MADE_TO_ORDER', 'OUT_OF_STOCK']) }), req.body);
  const s = await currentSupplier(req);
  const r = await prisma.product.updateMany({ where: { id: req.params.id, supplierId: s.id }, data: { availability } });
  if (!r.count) throw notFound('Product not found.');
  res.json({ ok: true });
});

/** Stock levels change daily; updating them does not send a live listing back to review. */
supplierRouter.patch('/products/:id/stock', async (req, res) => {
  const data = parse(stockUpdateSchema, req.body);
  const s = await currentSupplier(req);
  const product = await prisma.product.findFirst({ where: { id: String(req.params.id), supplierId: s.id }, include: { variants: { select: { id: true } } } });
  if (!product) throw notFound('Product not found.');
  const ownIds = new Set(product.variants.map((v) => v.id));
  if (data.variants.some((v) => !ownIds.has(v.id))) throw unprocessable('Unknown size/colour option.');
  await prisma.$transaction(async (tx) => {
    if (!product.variants.length) await tx.product.update({ where: { id: product.id }, data: { stockQuantity: data.stockQuantity ?? null } });
    for (const v of data.variants) await tx.productVariant.update({ where: { id: v.id }, data: { stockQuantity: v.stockQuantity ?? null } });
  });
  res.json({ ok: true });
});

/** Drafts that never reached an order can be deleted outright; anything else is archived to preserve history. */
supplierRouter.delete('/products/:id', async (req, res) => {
  const s = await currentSupplier(req);
  const product = await prisma.product.findFirst({ where: { id: String(req.params.id), supplierId: s.id }, include: { images: true } });
  if (!product) throw notFound('Product not found.');
  const ordered = await prisma.orderItem.count({ where: { productId: product.id } });
  if (!['DRAFT', 'REJECTED'].includes(product.status) || ordered > 0) {
    throw unprocessable('Only unpublished drafts that have never been ordered can be deleted. Archive this listing instead.');
  }
  await prisma.product.delete({ where: { id: product.id } });
  for (const img of product.images) await storage.delete(img.storageKey);
  await audit(req.user!.id, 'product.deleted', 'Product', product.id, { title: product.title });
  res.json({ ok: true });
});

supplierRouter.post('/products/:id/archive', async (req, res) => {
  const s = await currentSupplier(req);
  const r = await prisma.product.updateMany({ where: { id: req.params.id, supplierId: s.id }, data: { status: 'ARCHIVED' } });
  if (!r.count) throw notFound('Product not found.');
  res.json({ ok: true });
});

supplierRouter.post('/products/:id/images', uploadLimiter, ...acceptFiles('images', IMAGE_MIMES, 8), async (req, res) => {
  const meta = parse(
    z.object({
      usageRights: z.enum(['SUPPLIER_OWNED', 'LICENSED', 'MANUFACTURER_PROVIDED'], { errorMap: () => ({ message: 'Confirm who owns these photos' }) }),
      attribution: z.string().trim().max(300).optional(),
      altText: z.string().trim().max(200).optional(),
    }),
    req.body,
  );
  if (meta.usageRights === 'LICENSED' && !meta.attribution) throw unprocessable('Licensed photos need an attribution / licence reference.');
  const s = await currentSupplier(req);
  const product = await prisma.product.findFirst({ where: { id: String(req.params.id), supplierId: s.id }, include: { _count: { select: { images: true } }, images: { select: { sha256: true } } } });
  if (!product) throw notFound('Product not found.');
  const files = req.files as Express.Multer.File[];
  if (product._count.images + files.length > 12) throw unprocessable('A listing can have up to 12 photos.');
  const dims = files.map((f) => imageDimensions(f.buffer, f.mimetype));
  for (const [i, f] of files.entries()) {
    const problem = productImageProblem(f.originalname, dims[i]);
    if (problem) throw unprocessable(problem);
  }
  // The same photo twice on one listing adds nothing for retailers: refuse it instead of storing a copy.
  const hashes = files.map((f) => sha256(f.buffer));
  const existing = new Set(product.images.map((i) => i.sha256).filter(Boolean));
  for (const [i, h] of hashes.entries()) {
    if (existing.has(h) || hashes.indexOf(h) !== i) throw conflict(`"${files[i]!.originalname}" is already on this listing.`);
  }
  const created = [];
  for (const [i, f] of files.entries()) {
    const key = newKey('public/products', f.mimetype);
    await storage.put(key, f.buffer); // original retained as uploaded
    created.push(
      await prisma.productImage.create({
        data: {
          productId: product.id, storageKey: key, url: storage.publicUrl(key), originalFilename: f.originalname.slice(0, 200),
          mimeType: f.mimetype, sizeBytes: f.size, width: dims[i]!.width, height: dims[i]!.height, sortOrder: product._count.images + i, usageRights: meta.usageRights,
          attribution: meta.attribution || null, altText: meta.altText || product.title, sha256: hashes[i],
        },
      }),
    );
  }
  if (product.status === 'APPROVED') await prisma.product.update({ where: { id: product.id }, data: { status: 'DRAFT' } });
  res.status(201).json({ images: created });
});

/** Sets the photo order; the first photo is the listing's primary image. */
supplierRouter.put('/products/:id/images/order', async (req, res) => {
  const { imageIds } = parse(z.object({ imageIds: z.array(z.string().min(1)).min(1).max(12) }), req.body);
  const s = await currentSupplier(req);
  const product = await prisma.product.findFirst({ where: { id: String(req.params.id), supplierId: s.id }, include: { images: { select: { id: true } } } });
  if (!product) throw notFound('Product not found.');
  const own = new Set(product.images.map((i) => i.id));
  if (imageIds.length !== own.size || !imageIds.every((id) => own.has(id)) || new Set(imageIds).size !== imageIds.length) {
    throw unprocessable('Send every photo of this listing exactly once.');
  }
  await prisma.$transaction(imageIds.map((id, sortOrder) => prisma.productImage.update({ where: { id }, data: { sortOrder } })));
  res.json({ ok: true });
});

/** Replaces one photo's file in place (same position), e.g. after a retake. The new file is reviewed again. */
supplierRouter.post('/products/:id/images/:imageId/replace', uploadLimiter, ...acceptFiles('image', IMAGE_MIMES, 1), async (req, res) => {
  const s = await currentSupplier(req);
  const image = await prisma.productImage.findFirst({ where: { id: String(req.params.imageId), product: { id: String(req.params.id), supplierId: s.id } }, include: { product: { select: { id: true, status: true, images: { select: { id: true, sha256: true } } } } } });
  if (!image) throw notFound('Image not found.');
  const f = (req.files as Express.Multer.File[])[0]!;
  const dims = imageDimensions(f.buffer, f.mimetype);
  const problem = productImageProblem(f.originalname, dims);
  if (problem) throw unprocessable(problem);
  const hash = sha256(f.buffer);
  if (image.product.images.some((i) => i.sha256 === hash)) throw conflict(`"${f.originalname}" is already on this listing.`);
  const key = newKey('public/products', f.mimetype);
  await storage.put(key, f.buffer);
  const updated = await prisma.productImage.update({
    where: { id: image.id },
    data: { storageKey: key, url: storage.publicUrl(key), originalFilename: f.originalname.slice(0, 200), mimeType: f.mimetype, sizeBytes: f.size, width: dims!.width, height: dims!.height, sha256: hash, aiEnhanced: false, status: 'PENDING' },
  });
  await storage.delete(image.storageKey);
  if (image.product.status === 'APPROVED') await prisma.product.update({ where: { id: image.product.id }, data: { status: 'DRAFT' } });
  res.json({ image: updated });
});

supplierRouter.delete('/products/:id/images/:imageId', async (req, res) => {
  const s = await currentSupplier(req);
  const image = await prisma.productImage.findFirst({ where: { id: req.params.imageId, product: { id: req.params.id, supplierId: s.id } } });
  if (!image) throw notFound('Image not found.');
  await prisma.productImage.delete({ where: { id: image.id } });
  await storage.delete(image.storageKey);
  res.json({ ok: true });
});

// ─── Enquiries ───────────────────────────────────────────────────────────
supplierRouter.get('/enquiries', async (req, res) => {
  const s = await currentSupplier(req);
  const enquiries = await prisma.enquiry.findMany({
    where: { supplierId: s.id },
    orderBy: { createdAt: 'desc' },
    include: { retailer: { select: { businessName: true, city: true } }, product: { select: { id: true, title: true } } },
  });
  res.json({ enquiries });
});

supplierRouter.post('/enquiries/:id/respond', messageLimiter, async (req, res) => {
  const { response } = parse(z.object({ response: z.string().trim().min(5).max(2000) }), req.body);
  const s = await currentSupplier(req);
  const enquiry = await prisma.enquiry.findFirst({ where: { id: String(req.params.id), supplierId: s.id }, include: { retailer: { select: { userId: true } } } });
  if (!enquiry) throw notFound('Enquiry not found.');
  await prisma.enquiry.update({ where: { id: enquiry.id }, data: { supplierResponse: response, status: 'RESPONDED', respondedAt: new Date() } });
  await notify(enquiry.retailer.userId, 'ENQUIRY_RESPONSE', 'Supplier replied to your enquiry', `${s.businessName} responded.`, '/account/enquiries');
  res.json({ ok: true });
});

// ─── Orders & dispatch ───────────────────────────────────────────────────
const supplierOrderInclude = {
  // Suppliers see only the payment STATUS (never the UTR, receipt or amounts of other suppliers).
  order: { select: { orderNumber: true, shippingAddress: true, notes: true, createdAt: true, retailer: { select: { businessName: true, phone: true, city: true } }, payments: { select: { status: true, verifiedAt: true }, orderBy: { createdAt: 'desc' as const }, take: 1 } } },
  items: true,
  shipments: { orderBy: { dispatchedAt: 'desc' as const } },
};

supplierRouter.get('/orders', async (req, res) => {
  const s = await currentSupplier(req);
  const orders = await prisma.supplierOrder.findMany({ where: { supplierId: s.id }, orderBy: { createdAt: 'desc' }, include: supplierOrderInclude });
  res.json({ orders });
});

supplierRouter.get('/orders/:id', async (req, res) => {
  const s = await currentSupplier(req);
  const order = await prisma.supplierOrder.findFirst({ where: { id: req.params.id, supplierId: s.id }, include: supplierOrderInclude });
  if (!order) throw notFound('Order not found.');
  res.json({ order });
});

const TRANSITIONS: Record<string, string[]> = {
  REQUESTED: ['CONFIRMED', 'REJECTED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['CANCELLED'],
  DISPATCHED: ['DELIVERED'],
};

supplierRouter.post('/orders/:id/status', async (req, res) => {
  const { status, note } = parse(z.object({ status: z.enum(['CONFIRMED', 'REJECTED', 'PROCESSING', 'DELIVERED', 'CANCELLED']), note: z.string().trim().max(500).optional() }), req.body);
  const s = await currentSupplier(req);
  const so = await prisma.supplierOrder.findFirst({ where: { id: req.params.id, supplierId: s.id }, include: { order: { include: { retailer: { select: { userId: true } } } } } });
  if (!so) throw notFound('Order not found.');
  if (!(TRANSITIONS[so.status] ?? []).includes(status)) throw unprocessable(`An order that is ${so.status.toLowerCase()} cannot be marked ${status.toLowerCase()}.`);
  if (status === 'PROCESSING') {
    const blocked = await fulfilmentBlockedReason(so.orderId);
    if (blocked) throw unprocessable(blocked);
  }
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    // Conditional on the status we validated, so concurrent updates can't both apply.
    const r = await tx.supplierOrder.updateMany({
      where: { id: so.id, status: so.status },
      data: {
        status,
        supplierNote: note ?? so.supplierNote,
        ...(status === 'CONFIRMED' ? { confirmedAt: now } : {}),
        ...(status === 'DELIVERED' ? { deliveredAt: now } : {}),
      },
    });
    if (r.count !== 1) throw conflict('This order was updated in the meantime. Please refresh.');
    if (status === 'REJECTED' || status === 'CANCELLED') {
      const items = await tx.orderItem.findMany({ where: { supplierOrderId: so.id } });
      await releaseStock(tx, items.filter((i) => i.productId).map((i) => ({ productId: i.productId!, variantId: i.variantId, quantity: i.quantity })));
    }
  });
  if (status === 'DELIVERED') await prisma.shipment.updateMany({ where: { supplierOrderId: so.id, status: { not: 'DELIVERED' } }, data: { status: 'DELIVERED', deliveredAt: now } });
  await recomputeOrderStatus(so.orderId);
  await notify(so.order.retailer.userId, 'ORDER_UPDATE', `Order ${so.order.orderNumber} updated`, `${s.businessName} marked your order ${status.toLowerCase()}.`, `/account/orders/${so.orderId}`);
  await audit(req.user!.id, `supplier_order.${status.toLowerCase()}`, 'SupplierOrder', so.id);
  res.json({ ok: true });
});

supplierRouter.post('/orders/:id/dispatch', async (req, res) => {
  const data = parse(dispatchSchema, req.body);
  const s = await currentSupplier(req);
  const so = await prisma.supplierOrder.findFirst({ where: { id: req.params.id, supplierId: s.id }, include: { order: { include: { retailer: { select: { userId: true } } } } } });
  if (!so) throw notFound('Order not found.');
  if (!['CONFIRMED', 'PROCESSING', 'DISPATCHED'].includes(so.status)) throw unprocessable('Confirm the order before adding dispatch details.');
  const blocked = await fulfilmentBlockedReason(so.orderId);
  if (blocked) throw unprocessable(blocked);
  await prisma.$transaction([
    prisma.shipment.create({ data: { supplierOrderId: so.id, carrier: data.carrier, trackingNumber: data.trackingNumber, trackingUrl: data.trackingUrl || null, notes: data.notes || null } }),
    prisma.supplierOrder.update({ where: { id: so.id }, data: { status: 'DISPATCHED', dispatchedAt: new Date() } }),
  ]);
  await recomputeOrderStatus(so.orderId);
  await notify(so.order.retailer.userId, 'ORDER_DISPATCHED', `Order ${so.order.orderNumber} dispatched`, `${s.businessName} shipped via ${data.carrier} (${data.trackingNumber}).`, `/account/orders/${so.orderId}`);
  res.status(201).json({ ok: true });
});
