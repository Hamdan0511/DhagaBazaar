import { MAX_ORDER_VALUE_PAISE, formatINR, validateOrderQuantity } from '@dhaaga/shared';
import { prisma } from './prisma.js';
import { publicProductWhere } from './catalog.js';
import { stockProblem, type StockLine, type StockProduct } from './stock.js';

export async function getOrCreateCart(userId: string) {
  return prisma.cart.upsert({ where: { userId }, create: { userId }, update: {} });
}

/** Unit price for a quantity under the product's volume tiers (highest tier reached wins). */
export function tierPrice(basePaise: number, tiers: unknown, quantity: number): number {
  if (!Array.isArray(tiers)) return basePaise;
  let price = basePaise;
  for (const t of tiers as { minQty?: unknown; pricePaise?: unknown }[]) {
    if (typeof t?.minQty === 'number' && typeof t?.pricePaise === 'number' && quantity >= t.minQty && t.pricePaise > 0 && t.pricePaise < price) price = t.pricePaise;
  }
  return price;
}

export interface CartLine {
  id: string;
  productId: string;
  variantId: string | null;
  title: string;
  imageUrl: string | null;
  categoryName: string;
  size: string | null;
  colour: string | null;
  quantity: number;
  unitPricePaise: number;
  /** Base price before a volume tier applied (equal to unitPricePaise when no tier applies). */
  basePricePaise: number;
  priceUnit: string;
  lineTotalPaise: number;
  issue: string | null;
}

export interface CartProductGroup {
  productId: string;
  title: string;
  moq: number;
  orderStep: number;
  totalQuantity: number;
  moqError: string | null;
  /** Requested quantity exceeds available stock. */
  stockError: string | null;
  isFixture: boolean;
}

export interface CartSupplierGroup {
  supplierId: string;
  supplierName: string;
  supplierCity: string | null;
  isFixture: boolean;
  lines: CartLine[];
  products: CartProductGroup[];
  subtotalPaise: number;
  /** Group-level problems (e.g. below the supplier's minimum order value). */
  issues: string[];
  hasIssues: boolean;
}

/**
 * Builds the cart view: lines grouped by supplier (each supplier is a separate
 * fulfilment group), MOQ validated per product across all of its variants.
 */
export async function buildCart(userId: string) {
  const cart = await getOrCreateCart(userId);
  const items = await prisma.cartItem.findMany({
    where: { cartId: cart.id },
    orderBy: { addedAt: 'asc' },
    include: {
      variant: true,
      product: {
        include: {
          category: { select: { name: true } },
          supplier: { select: { id: true, businessName: true, city: true, isFixture: true, minOrderValuePaise: true } },
          images: { where: { status: 'ACCEPTED' }, orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } },
          variants: { select: { id: true, stockQuantity: true, size: true, colour: true } },
        },
      },
    },
  });
  const visibleIds = new Set(
    (await prisma.product.findMany({ where: { ...publicProductWhere(), id: { in: items.map((i) => i.productId) } }, select: { id: true } })).map((p) => p.id),
  );

  const groups = new Map<string, CartSupplierGroup>();
  const minOrderValues = new Map<string, number>();
  const stockInfo = new Map<string, StockProduct>();
  const stockLines = new Map<string, StockLine[]>();
  // Volume tiers apply to the product's total quantity across all its sizes/colours.
  const productTotals = new Map<string, number>();
  for (const item of items) productTotals.set(item.productId, (productTotals.get(item.productId) ?? 0) + item.quantity);
  for (const item of items) {
    const p = item.product;
    let group = groups.get(p.supplierId);
    if (!group) {
      group = {
        supplierId: p.supplier.id,
        supplierName: p.supplier.businessName,
        supplierCity: p.supplier.city,
        isFixture: p.supplier.isFixture,
        lines: [],
        products: [],
        subtotalPaise: 0,
        issues: [],
        hasIssues: false,
      };
      minOrderValues.set(p.supplierId, p.supplier.minOrderValuePaise ?? 0);
      groups.set(p.supplierId, group);
    }
    let issue: string | null = null;
    if (!visibleIds.has(p.id)) issue = 'This listing is no longer available.';
    else if (p.availability === 'OUT_OF_STOCK') issue = 'Currently out of stock.';
    else if (item.variant && !item.variant.isAvailable) issue = 'This size/colour is unavailable.';
    // A size/colour price override is the supplier's explicit price for that option; tiers discount the base price.
    const base = item.variant?.pricePaise ?? p.pricePaise;
    const unit = item.variant?.pricePaise ? base : tierPrice(p.pricePaise, p.priceTiers, productTotals.get(p.id) ?? 0);
    const line: CartLine = {
      id: item.id,
      productId: p.id,
      variantId: item.variantId,
      title: p.title,
      imageUrl: p.images[0]?.url ?? null,
      categoryName: p.category.name,
      size: item.variant?.size ?? null,
      colour: item.variant?.colour ?? null,
      quantity: item.quantity,
      unitPricePaise: unit,
      basePricePaise: base,
      priceUnit: p.priceUnit,
      lineTotalPaise: unit * item.quantity,
      issue,
    };
    group.lines.push(line);
    group.subtotalPaise += line.lineTotalPaise;
    if (issue) group.hasIssues = true;

    let pg = group.products.find((x) => x.productId === p.id);
    if (!pg) {
      pg = { productId: p.id, title: p.title, moq: p.moq, orderStep: p.orderStep, totalQuantity: 0, moqError: null, stockError: null, isFixture: p.isFixture };
      stockInfo.set(p.id, { stockQuantity: p.stockQuantity, variants: p.variants });
      group.products.push(pg);
    }
    pg.totalQuantity += item.quantity;
    const ls = stockLines.get(p.id) ?? [];
    ls.push({ variantId: item.variantId, quantity: item.quantity });
    stockLines.set(p.id, ls);
  }
  for (const g of groups.values()) {
    for (const pg of g.products) {
      pg.moqError = validateOrderQuantity(pg.totalQuantity, pg.moq, pg.orderStep);
      if (pg.moqError) g.hasIssues = true;
      pg.stockError = stockProblem(stockInfo.get(pg.productId)!, stockLines.get(pg.productId) ?? []);
      if (pg.stockError) g.hasIssues = true;
    }
    const minValue = minOrderValues.get(g.supplierId) ?? 0;
    if (minValue > 0 && g.subtotalPaise < minValue) {
      g.issues.push(`${g.supplierName} has a minimum order value of ${formatINR(minValue)}. Add ${formatINR(minValue - g.subtotalPaise)} more from this supplier.`);
    }
    if (g.subtotalPaise > MAX_ORDER_VALUE_PAISE) {
      g.issues.push(`Orders above ${formatINR(MAX_ORDER_VALUE_PAISE)} per supplier can't be placed online yet. Please split this into smaller orders or contact us.`);
    }
    if (g.issues.length) g.hasIssues = true;
  }
  const suppliers = [...groups.values()];
  const subtotalPaise = suppliers.reduce((s, g) => s + g.subtotalPaise, 0);
  const orderIssues: string[] = [];
  if (subtotalPaise > MAX_ORDER_VALUE_PAISE) orderIssues.push(`A single order can't exceed ${formatINR(MAX_ORDER_VALUE_PAISE)} yet. Please split it into smaller orders.`);
  return {
    cartId: cart.id,
    suppliers,
    itemCount: items.length,
    totalQuantity: items.reduce((s, i) => s + i.quantity, 0),
    subtotalPaise,
    issues: orderIssues,
    canCheckout: suppliers.length > 0 && orderIssues.length === 0 && suppliers.every((g) => !g.hasIssues),
  };
}
