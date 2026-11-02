import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { addressSchema, complaintSchema, enquirySchema, retailerProfileSchema } from '@dhaaga/shared';
import { prisma } from '../lib/prisma.js';
import { requireRole } from '../middleware/auth.js';
import { parse } from '../middleware/validate.js';
import { buildCart } from '../lib/cart.js';
import { publicProductWhere, publicSupplierWhere, productCardSelect } from '../lib/catalog.js';
import { badRequest, conflict, notFound, unprocessable } from '../lib/http.js';
import { audit, notify } from '../lib/audit.js';
import { messageLimiter } from '../lib/rateLimits.js';
import { releaseStock, reserveStock } from '../lib/stock.js';

export const retailerRouter = Router();
retailerRouter.use(requireRole('RETAILER'));

const retailerId = (req: Express.Request) => {
  if (!req.user?.retailerId) throw badRequest('Retailer profile missing.');
  return req.user.retailerId;
};

// ─── Overview ────────────────────────────────────────────────────────────
retailerRouter.get('/overview', async (req, res) => {
  const rid = retailerId(req);
  const [orders, openEnquiries, savedProducts, savedSuppliers, recentOrders, cart, unread] = await Promise.all([
    prisma.order.count({ where: { retailerId: rid } }),
    prisma.enquiry.count({ where: { retailerId: rid, status: { not: 'CLOSED' } } }),
    prisma.savedProduct.count({ where: { retailerId: rid } }),
    prisma.savedSupplier.count({ where: { retailerId: rid } }),
    prisma.order.findMany({ where: { retailerId: rid }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, orderNumber: true, status: true, subtotalPaise: true, createdAt: true, _count: { select: { supplierOrders: true } } } }),
    buildCart(req.user!.id),
    prisma.notification.count({ where: { userId: req.user!.id, readAt: null } }),
  ]);
  res.json({ counts: { orders, openEnquiries, savedProducts, savedSuppliers, cartItems: cart.itemCount, unreadNotifications: unread }, recentOrders });
});

// ─── Profile ─────────────────────────────────────────────────────────────
retailerRouter.get('/profile', async (req, res) => {
  const profile = await prisma.retailer.findUniqueOrThrow({ where: { id: retailerId(req) }, include: { addresses: { orderBy: { createdAt: 'asc' } } } });
  res.json({ profile, account: { fullName: req.user!.fullName, email: req.user!.email } });
});

retailerRouter.put('/profile', async (req, res) => {
  const data = parse(retailerProfileSchema, req.body);
  const profile = await prisma.retailer.update({
    where: { id: retailerId(req) },
    data: { ...data, gstin: data.gstin || null, interests: data.interests ?? [] },
  });
  await prisma.user.update({ where: { id: req.user!.id }, data: { phone: data.phone, businessType: data.businessType } });
  res.json({ profile });
});

retailerRouter.put('/account', async (req, res) => {
  const { fullName } = parse(z.object({ fullName: z.string().trim().min(2).max(100) }), req.body);
  await prisma.user.update({ where: { id: req.user!.id }, data: { fullName } });
  res.json({ ok: true });
});

// ─── Addresses (multiple business addresses) ─────────────────────────────
retailerRouter.post('/addresses', async (req, res) => {
  const data = parse(addressSchema, req.body);
  const rid = retailerId(req);
  const count = await prisma.address.count({ where: { retailerId: rid } });
  if (count >= 20) throw unprocessable('You can save up to 20 addresses.');
  const isDefault = data.isDefault || count === 0;
  const address = await prisma.$transaction(async (tx) => {
    if (isDefault) await tx.address.updateMany({ where: { retailerId: rid }, data: { isDefault: false } });
    return tx.address.create({ data: { ...data, line2: data.line2 || null, isDefault, retailerId: rid } });
  });
  res.status(201).json({ address });
});

retailerRouter.put('/addresses/:id', async (req, res) => {
  const data = parse(addressSchema, req.body);
  const rid = retailerId(req);
  const existing = await prisma.address.findFirst({ where: { id: req.params.id, retailerId: rid } });
  if (!existing) throw notFound('Address not found.');
  const address = await prisma.$transaction(async (tx) => {
    if (data.isDefault) await tx.address.updateMany({ where: { retailerId: rid }, data: { isDefault: false } });
    return tx.address.update({ where: { id: existing.id }, data: { ...data, line2: data.line2 || null, isDefault: data.isDefault ?? existing.isDefault } });
  });
  res.json({ address });
});

retailerRouter.delete('/addresses/:id', async (req, res) => {
  await prisma.address.deleteMany({ where: { id: req.params.id, retailerId: retailerId(req) } });
  res.json({ ok: true });
});

// ─── Bulk order requests ─────────────────────────────────────────────────
function orderNumber() {
  const d = new Date();
  const ymd = `${d.getFullYear() % 100}`.padStart(2, '0') + `${d.getMonth() + 1}`.padStart(2, '0') + `${d.getDate()}`.padStart(2, '0');
  return `DB${ymd}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

retailerRouter.post('/orders', async (req, res) => {
  const { addressId, notes } = parse(z.object({ addressId: z.string().min(1, 'Choose a delivery address'), notes: z.string().trim().max(1000).optional() }), req.body);
  const rid = retailerId(req);
  const address = await prisma.address.findFirst({ where: { id: addressId, retailerId: rid } });
  if (!address) throw unprocessable('Choose a delivery address.');
  const cart = await buildCart(req.user!.id);
  if (cart.suppliers.length === 0) throw unprocessable('Your cart is empty.');
  if (!cart.canCheckout) throw unprocessable('Please resolve the highlighted cart issues (MOQ, minimum order value or availability) before submitting.');

  const productIds = [...new Set(cart.suppliers.flatMap((g) => g.lines.map((l) => l.productId)))];
  const products = new Map((await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, moq: true } })).map((p) => [p.id, p]));

  // Claim the exact cart rows this order was priced from. A concurrent or repeated
  // submission blocks on these row locks, then finds them gone and is rejected, so
  // one cart can never become two orders.
  const lineIds = cart.suppliers.flatMap((g) => g.lines.map((l) => l.id));
  const order = await prisma.$transaction(async (tx) => {
    const claimed = await tx.cartItem.deleteMany({ where: { cartId: cart.cartId, id: { in: lineIds } } });
    if (claimed.count !== lineIds.length) throw conflict('Your cart changed while this order was being submitted. Please review your cart and try again.');
    const leftovers = await tx.cartItem.count({ where: { cartId: cart.cartId } });
    if (leftovers > 0) throw conflict('Your cart changed while this order was being submitted. Please review your cart and try again.');
    // Reserve tracked stock atomically; any shortfall rolls back the whole order.
    await reserveStock(tx, cart.suppliers.flatMap((g) => g.lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity }))));
    const created = await tx.order.create({
      data: {
        orderNumber: orderNumber(),
        retailerId: rid,
        notes: notes || null,
        subtotalPaise: cart.subtotalPaise,
        shippingAddress: {
          label: address.label, contactName: address.contactName, phone: address.phone, line1: address.line1,
          line2: address.line2, city: address.city, state: address.state, pincode: address.pincode,
        },
        supplierOrders: {
          create: cart.suppliers.map((g) => ({
            supplierId: g.supplierId,
            subtotalPaise: g.subtotalPaise,
            items: {
              create: g.lines.map((l) => ({
                productId: l.productId,
                variantId: l.variantId,
                productTitle: l.title,
                variantLabel: [l.size, l.colour].filter(Boolean).join(' / ') || null,
                unitPricePaise: l.unitPricePaise,
                priceUnit: l.priceUnit as 'PIECE',
                moqAtOrder: products.get(l.productId)?.moq ?? 1,
                quantity: l.quantity,
                lineTotalPaise: l.lineTotalPaise,
              })),
            },
          })),
        },
      },
      include: { supplierOrders: { include: { supplier: { select: { userId: true } } } } },
    });
    return created;
  });

  for (const so of order.supplierOrders) {
    await notify(so.supplier.userId, 'ORDER_REQUEST', 'New bulk order request', `Order ${order.orderNumber} is awaiting your confirmation.`, `/supplier/orders/${so.id}`);
  }
  await notify(req.user!.id, 'ORDER_SUBMITTED', 'Bulk order request submitted', `Order ${order.orderNumber} was sent to ${order.supplierOrders.length} supplier(s).`, `/account/orders/${order.id}`);
  await audit(req.user!.id, 'order.created', 'Order', order.id, { supplierGroups: order.supplierOrders.length });
  res.status(201).json({ order: { id: order.id, orderNumber: order.orderNumber } });
});

const orderInclude = {
  supplierOrders: {
    include: {
      supplier: { select: { id: true, businessName: true, city: true, phone: true, whatsapp: true } },
      items: true,
      shipments: { orderBy: { dispatchedAt: 'desc' as const } },
    },
  },
  complaints: { select: { id: true, subject: true, status: true, createdAt: true } },
};

retailerRouter.get('/orders', async (req, res) => {
  const orders = await prisma.order.findMany({ where: { retailerId: retailerId(req) }, orderBy: { createdAt: 'desc' }, include: orderInclude });
  res.json({ orders });
});

retailerRouter.get('/orders/:id', async (req, res) => {
  const order = await prisma.order.findFirst({ where: { id: req.params.id, retailerId: retailerId(req) }, include: orderInclude });
  if (!order) throw notFound('Order not found.');
  res.json({ order });
});

retailerRouter.post('/orders/:orderId/supplier-orders/:id/cancel', async (req, res) => {
  const so = await prisma.supplierOrder.findFirst({
    where: { id: req.params.id, orderId: req.params.orderId, order: { retailerId: retailerId(req) } },
    include: { supplier: { select: { userId: true } }, order: true, items: true },
  });
  if (!so) throw notFound('Order group not found.');
  if (so.status !== 'REQUESTED') throw unprocessable('Only requests that a supplier has not yet confirmed can be cancelled here. Please contact support.');
  await prisma.$transaction(async (tx) => {
    // Conditional update: only one cancellation can win, so stock is never returned twice.
    const r = await tx.supplierOrder.updateMany({ where: { id: so.id, status: 'REQUESTED' }, data: { status: 'CANCELLED' } });
    if (r.count !== 1) throw conflict('This order was updated by the supplier. Please refresh.');
    await releaseStock(tx, so.items.filter((i) => i.productId).map((i) => ({ productId: i.productId!, variantId: i.variantId, quantity: i.quantity })));
  });
  await recomputeOrderStatus(so.orderId);
  await notify(so.supplier.userId, 'ORDER_CANCELLED', 'Order request cancelled', `The retailer cancelled their request in order ${so.order.orderNumber}.`, `/supplier/orders/${so.id}`);
  res.json({ ok: true });
});

/** Derives the parent order status from its supplier groups. */
export async function recomputeOrderStatus(orderId: string) {
  const groups = await prisma.supplierOrder.findMany({ where: { orderId }, select: { status: true } });
  const s = groups.map((g) => g.status);
  const active = s.filter((x) => x !== 'CANCELLED' && x !== 'REJECTED');
  let status: 'REQUESTED' | 'PARTIALLY_CONFIRMED' | 'CONFIRMED' | 'IN_FULFILMENT' | 'COMPLETED' | 'CANCELLED';
  if (active.length === 0) status = 'CANCELLED';
  else if (active.every((x) => x === 'DELIVERED')) status = 'COMPLETED';
  else if (active.some((x) => x === 'DISPATCHED' || x === 'PROCESSING' || x === 'DELIVERED')) status = 'IN_FULFILMENT';
  else if (active.every((x) => x === 'CONFIRMED')) status = 'CONFIRMED';
  else if (active.some((x) => x === 'CONFIRMED')) status = 'PARTIALLY_CONFIRMED';
  else status = 'REQUESTED';
  await prisma.order.update({ where: { id: orderId }, data: { status } });
}

// ─── Saved products & suppliers (wishlist) ───────────────────────────────
retailerRouter.get('/saved', async (req, res) => {
  const rid = retailerId(req);
  const [products, suppliers] = await Promise.all([
    prisma.savedProduct.findMany({ where: { retailerId: rid, product: publicProductWhere() }, orderBy: { createdAt: 'desc' }, select: { product: { select: productCardSelect } } }),
    prisma.savedSupplier.findMany({ where: { retailerId: rid, supplier: publicSupplierWhere() }, orderBy: { createdAt: 'desc' }, select: { supplier: { select: { id: true, businessName: true, city: true, state: true, isVerified: true, businessType: true } } } }),
  ]);
  res.json({ products: products.map((p) => p.product), suppliers: suppliers.map((s) => s.supplier) });
});

retailerRouter.get('/saved/ids', async (req, res) => {
  const rid = retailerId(req);
  const [p, s] = await Promise.all([
    prisma.savedProduct.findMany({ where: { retailerId: rid }, select: { productId: true } }),
    prisma.savedSupplier.findMany({ where: { retailerId: rid }, select: { supplierId: true } }),
  ]);
  res.json({ productIds: p.map((x) => x.productId), supplierIds: s.map((x) => x.supplierId) });
});

retailerRouter.put('/saved/products/:id', async (req, res) => {
  const product = await prisma.product.findFirst({ where: { id: req.params.id, ...publicProductWhere() }, select: { id: true } });
  if (!product) throw notFound('This listing is not available.');
  const rid = retailerId(req);
  await prisma.savedProduct.upsert({ where: { retailerId_productId: { retailerId: rid, productId: product.id } }, create: { retailerId: rid, productId: product.id }, update: {} });
  res.json({ saved: true });
});
retailerRouter.delete('/saved/products/:id', async (req, res) => {
  await prisma.savedProduct.deleteMany({ where: { retailerId: retailerId(req), productId: req.params.id } });
  res.json({ saved: false });
});
retailerRouter.put('/saved/suppliers/:id', async (req, res) => {
  const supplier = await prisma.supplier.findFirst({ where: { id: req.params.id, ...publicSupplierWhere() }, select: { id: true } });
  if (!supplier) throw notFound('This supplier is not available.');
  const rid = retailerId(req);
  await prisma.savedSupplier.upsert({ where: { retailerId_supplierId: { retailerId: rid, supplierId: supplier.id } }, create: { retailerId: rid, supplierId: supplier.id }, update: {} });
  res.json({ saved: true });
});
retailerRouter.delete('/saved/suppliers/:id', async (req, res) => {
  await prisma.savedSupplier.deleteMany({ where: { retailerId: retailerId(req), supplierId: req.params.id } });
  res.json({ saved: false });
});

// ─── Enquiries ───────────────────────────────────────────────────────────
retailerRouter.get('/enquiries', async (req, res) => {
  const enquiries = await prisma.enquiry.findMany({
    where: { retailerId: retailerId(req) },
    orderBy: { createdAt: 'desc' },
    include: { supplier: { select: { id: true, businessName: true, city: true } }, product: { select: { id: true, title: true } } },
  });
  res.json({ enquiries });
});

retailerRouter.post('/enquiries', messageLimiter, async (req, res) => {
  const data = parse(enquirySchema, req.body);
  const supplier = await prisma.supplier.findFirst({ where: { id: data.supplierId, ...publicSupplierWhere() }, select: { id: true, userId: true } });
  if (!supplier) throw notFound('This supplier is not available.');
  if (data.productId) {
    const p = await prisma.product.findFirst({ where: { id: data.productId, supplierId: supplier.id, ...publicProductWhere() }, select: { id: true } });
    if (!p) throw notFound('This listing is not available.');
  }
  const enquiry = await prisma.enquiry.create({ data: { ...data, retailerId: retailerId(req) } });
  await notify(supplier.userId, 'ENQUIRY', 'New bulk enquiry', 'A retailer sent you an enquiry.', '/supplier/enquiries');
  res.status(201).json({ enquiry });
});

// ─── Complaints / returns ────────────────────────────────────────────────
retailerRouter.get('/complaints', async (req, res) => {
  const complaints = await prisma.complaint.findMany({ where: { retailerId: retailerId(req) }, orderBy: { createdAt: 'desc' }, include: { order: { select: { orderNumber: true } } } });
  res.json({ complaints });
});

retailerRouter.post('/complaints', messageLimiter, async (req, res) => {
  const data = parse(complaintSchema, req.body);
  const rid = retailerId(req);
  if (data.orderId) {
    const order = await prisma.order.findFirst({ where: { id: data.orderId, retailerId: rid } });
    if (!order) throw notFound('Order not found.');
  }
  const complaint = await prisma.complaint.create({ data: { ...data, retailerId: rid } });
  await audit(req.user!.id, 'complaint.created', 'Complaint', complaint.id);
  res.status(201).json({ complaint });
});
