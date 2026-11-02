import type { Prisma } from '@prisma/client';
import { formatNumber } from '@dhaaga/shared';
import { conflict } from './http.js';

/**
 * Inventory rules (single source of truth):
 *  - A size/colour option with `stockQuantity` set is tracked per option.
 *  - Otherwise, a product with `stockQuantity` set is tracked as a whole.
 *  - `null` means "not tracked" (e.g. made to order): no stock limit applies.
 * Stock is reserved atomically when an order is placed and returned if the
 * supplier declines/cancels or the retailer cancels before confirmation.
 */
export interface StockProduct {
  stockQuantity: number | null;
  variants: { id: string; stockQuantity: number | null; size: string | null; colour: string | null }[];
}
export interface StockLine {
  variantId: string | null;
  quantity: number;
}

const label = (v: { size: string | null; colour: string | null }) => [v.size, v.colour].filter(Boolean).join(' / ') || 'this option';

/** Returns a human-readable problem if the requested lines exceed available stock, else null. */
export function stockProblem(product: StockProduct, lines: StockLine[]): string | null {
  const byVariant = new Map<string | null, number>();
  for (const l of lines) byVariant.set(l.variantId, (byVariant.get(l.variantId) ?? 0) + l.quantity);
  let productLevel = 0;
  for (const [variantId, qty] of byVariant) {
    const v = variantId ? product.variants.find((x) => x.id === variantId) : undefined;
    if (v && v.stockQuantity !== null) {
      if (qty > v.stockQuantity) {
        return v.stockQuantity === 0 ? `${label(v)} is sold out.` : `Only ${formatNumber(v.stockQuantity)} available for ${label(v)}.`;
      }
    } else {
      productLevel += qty;
    }
  }
  if (product.stockQuantity !== null && productLevel > product.stockQuantity) {
    return product.stockQuantity === 0 ? 'This product is sold out.' : `Only ${formatNumber(product.stockQuantity)} units are in stock.`;
  }
  return null;
}

/** Total units a retailer could still order (null when untracked). Used for display. */
export function availableUnits(product: StockProduct): number | null {
  if (product.variants.length && product.variants.every((v) => v.stockQuantity !== null)) {
    return product.variants.reduce((s, v) => s + (v.stockQuantity ?? 0), 0);
  }
  return product.variants.length ? null : product.stockQuantity;
}

type Tx = Prisma.TransactionClient;
interface OrderLine {
  productId: string;
  variantId: string | null;
  quantity: number;
  title?: string;
}

async function trackedTargets(tx: Tx, lines: OrderLine[]) {
  const variantIds = [...new Set(lines.map((l) => l.variantId).filter(Boolean) as string[])];
  const productIds = [...new Set(lines.map((l) => l.productId))];
  const [variants, products] = await Promise.all([
    tx.productVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true, stockQuantity: true } }),
    tx.product.findMany({ where: { id: { in: productIds } }, select: { id: true, stockQuantity: true } }),
  ]);
  const vTracked = new Set(variants.filter((v) => v.stockQuantity !== null).map((v) => v.id));
  const pTracked = new Set(products.filter((p) => p.stockQuantity !== null).map((p) => p.id));
  const variantQty = new Map<string, number>();
  const productQty = new Map<string, number>();
  for (const l of lines) {
    if (l.variantId && vTracked.has(l.variantId)) variantQty.set(l.variantId, (variantQty.get(l.variantId) ?? 0) + l.quantity);
    else if (pTracked.has(l.productId)) productQty.set(l.productId, (productQty.get(l.productId) ?? 0) + l.quantity);
  }
  return { variantQty, productQty };
}

/**
 * Atomically decrements tracked stock inside the order transaction. Each update
 * only succeeds while enough stock remains, so concurrent orders can never
 * oversell; on shortfall the whole order transaction rolls back.
 */
export async function reserveStock(tx: Tx, lines: OrderLine[]) {
  const { variantQty, productQty } = await trackedTargets(tx, lines);
  for (const [id, qty] of variantQty) {
    const r = await tx.productVariant.updateMany({ where: { id, stockQuantity: { gte: qty } }, data: { stockQuantity: { decrement: qty } } });
    if (r.count !== 1) throw conflict('Some items just sold out or have less stock than requested. Please review your cart.');
  }
  for (const [id, qty] of productQty) {
    const r = await tx.product.updateMany({ where: { id, stockQuantity: { gte: qty } }, data: { stockQuantity: { decrement: qty } } });
    if (r.count !== 1) throw conflict('Some items just sold out or have less stock than requested. Please review your cart.');
  }
}

/** Returns reserved stock (order declined/cancelled before dispatch). */
export async function releaseStock(tx: Tx, lines: OrderLine[]) {
  const { variantQty, productQty } = await trackedTargets(tx, lines);
  for (const [id, qty] of variantQty) await tx.productVariant.update({ where: { id }, data: { stockQuantity: { increment: qty } } });
  for (const [id, qty] of productQty) await tx.product.update({ where: { id }, data: { stockQuantity: { increment: qty } } });
}
