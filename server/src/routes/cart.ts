import { Router } from 'express';
import { z } from 'zod';
import { MAX_LINE_QUANTITY, formatNumber, validateOrderQuantity } from '@dhaaga/shared';
import { prisma } from '../lib/prisma.js';
import { requireRole } from '../middleware/auth.js';
import { parse } from '../middleware/validate.js';
import { buildCart, getOrCreateCart } from '../lib/cart.js';
import { stockProblem } from '../lib/stock.js';
import { publicProductWhere } from '../lib/catalog.js';
import { notFound, unprocessable } from '../lib/http.js';

export const cartRouter = Router();
cartRouter.use(requireRole('RETAILER'));

const addSchema = z.object({
  productId: z.string().min(1),
  lines: z
    .array(z.object({ variantId: z.string().nullable().optional(), quantity: z.coerce.number().int().min(1).max(1_000_000) }))
    .min(1, 'Choose at least one size/colour and quantity')
    .max(200),
});

cartRouter.get('/', async (req, res) => {
  res.json(await buildCart(req.user!.id));
});

/** Adds one or more variant lines of a single product. MOQ applies to the product total. */
cartRouter.post('/items', async (req, res) => {
  const { productId, lines } = parse(addSchema, req.body);
  const product = await prisma.product.findFirst({ where: { id: productId, ...publicProductWhere() }, include: { variants: true } });
  if (!product) throw notFound('This listing is not available for ordering.');
  if (product.availability === 'OUT_OF_STOCK') throw unprocessable('This listing is currently out of stock.');

  const hasVariants = product.variants.length > 0;
  for (const l of lines) {
    if (hasVariants) {
      const v = product.variants.find((x) => x.id === l.variantId);
      if (!v) throw unprocessable('Please choose a valid size / colour.');
      if (!v.isAvailable) throw unprocessable('The selected size / colour is unavailable.');
    } else if (l.variantId) {
      throw unprocessable('This listing has no size/colour options.');
    }
  }

  const cart = await getOrCreateCart(req.user!.id);
  const existing = await prisma.cartItem.findMany({ where: { cartId: cart.id, productId } });
  const existingTotal = existing.reduce((s, i) => s + i.quantity, 0);
  const addedTotal = lines.reduce((s, l) => s + l.quantity, 0);
  const error = validateOrderQuantity(existingTotal + addedTotal, product.moq, product.orderStep);
  if (error) {
    throw unprocessable(
      `${error} You have ${formatNumber(existingTotal + addedTotal)} in total for this product (MOQ applies across all sizes and colours).`,
    );
  }

  for (const l of lines) {
    const match = existing.find((i) => i.variantId === (l.variantId ?? null));
    if ((match?.quantity ?? 0) + l.quantity > MAX_LINE_QUANTITY) throw unprocessable(`A single cart line can hold at most ${formatNumber(MAX_LINE_QUANTITY)} units.`);
  }
  const stockIssue = stockProblem(product, [
    ...existing.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
    ...lines.map((l) => ({ variantId: l.variantId ?? null, quantity: l.quantity })),
  ]);
  if (stockIssue) throw unprocessable(`${stockIssue} Please reduce the quantity.`);

  await prisma.$transaction(async (tx) => {
    for (const l of lines) {
      const variantId = l.variantId ?? null;
      const match = existing.find((i) => i.variantId === variantId);
      if (match) await tx.cartItem.update({ where: { id: match.id }, data: { quantity: match.quantity + l.quantity } });
      else await tx.cartItem.create({ data: { cartId: cart.id, productId, variantId, quantity: l.quantity } });
    }
  });
  res.status(201).json(await buildCart(req.user!.id));
});

cartRouter.patch('/items/:id', async (req, res) => {
  const { quantity } = parse(z.object({ quantity: z.coerce.number().int().min(1).max(1_000_000) }), req.body);
  const cart = await getOrCreateCart(req.user!.id);
  const item = await prisma.cartItem.findFirst({ where: { id: req.params.id, cartId: cart.id }, include: { product: { include: { variants: true } } } });
  if (!item) throw notFound('Cart item not found.');
  const siblings = await prisma.cartItem.findMany({ where: { cartId: cart.id, productId: item.productId, id: { not: item.id } } });
  const newTotal = siblings.reduce((s, i) => s + i.quantity, 0) + quantity;
  const error = validateOrderQuantity(newTotal, item.product.moq, item.product.orderStep);
  if (error) throw unprocessable(`${error} This product would have ${formatNumber(newTotal)} pieces in total.`);
  const stockIssue = stockProblem(item.product, [...siblings.map((i) => ({ variantId: i.variantId, quantity: i.quantity })), { variantId: item.variantId, quantity }]);
  if (stockIssue) throw unprocessable(stockIssue);
  await prisma.cartItem.update({ where: { id: item.id }, data: { quantity } });
  res.json(await buildCart(req.user!.id));
});

cartRouter.delete('/items/:id', async (req, res) => {
  const cart = await getOrCreateCart(req.user!.id);
  await prisma.cartItem.deleteMany({ where: { id: req.params.id, cartId: cart.id } });
  res.json(await buildCart(req.user!.id));
});

/** Removes every line of one product (used when a remaining line would be below MOQ). */
cartRouter.delete('/products/:productId', async (req, res) => {
  const cart = await getOrCreateCart(req.user!.id);
  await prisma.cartItem.deleteMany({ where: { productId: req.params.productId, cartId: cart.id } });
  res.json(await buildCart(req.user!.id));
});

cartRouter.delete('/', async (req, res) => {
  const cart = await getOrCreateCart(req.user!.id);
  await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  res.json(await buildCart(req.user!.id));
});
