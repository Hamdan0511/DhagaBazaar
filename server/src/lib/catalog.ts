import type { Prisma } from '@prisma/client';
import { FILTER_SETS, MOQ_RANGES, getCategory, getDescendantPaths, type FilterSetKey, type SortKey } from '@dhaaga/shared';
import { prisma } from './prisma.js';
import { config } from '../config.js';

/**
 * The ONLY definition of what the public may see. A listing is public when the
 * product is approved, its supplier is approved, its category is active, and —
 * outside of explicitly enabled development mode — it is not a fixture.
 */
export function publicProductWhere(): Prisma.ProductWhereInput {
  return {
    status: 'APPROVED',
    supplier: { status: 'APPROVED', ...(config.fixturesVisible ? {} : { isFixture: false }) },
    category: { isActive: true },
    ...(config.fixturesVisible ? {} : { isFixture: false }),
  };
}

export function publicSupplierWhere(): Prisma.SupplierWhereInput {
  return { status: 'APPROVED', ...(config.fixturesVisible ? {} : { isFixture: false }) };
}

export const productCardSelect = {
  id: true,
  title: true,
  pricePaise: true,
  priceUnit: true,
  piecesPerSet: true,
  moq: true,
  orderStep: true,
  availability: true,
  stockQuantity: true,
  isFixture: true,
  createdAt: true,
  category: { select: { path: true, name: true } },
  supplier: { select: { id: true, businessName: true, city: true, state: true, isVerified: true, isFixture: true } },
  images: {
    where: { status: 'ACCEPTED' as const },
    orderBy: { sortOrder: 'asc' as const },
    take: 1,
    select: { url: true, altText: true },
  },
} satisfies Prisma.ProductSelect;

export interface ListingQuery {
  categoryPath?: string;
  q?: string;
  supplierIds: string[];
  moqRanges: string[];
  moqMin?: number;
  moqMax?: number;
  orderQty?: number;
  priceMin?: number; // paise
  priceMax?: number; // paise
  priceUnit?: string;
  cities: string[];
  attributes: Record<string, string[]>;
  sort: SortKey;
  page: number;
  pageSize: number;
}

const toList = (v: unknown): string[] =>
  (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : []).map((s) => String(s).trim()).filter(Boolean);
const toInt = (v: unknown) => {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

/** Reads ?attr.fabric=Silk,Cotton&moq=10-25&qty=50 style query strings. */
export function parseListingQuery(query: Record<string, unknown>): ListingQuery {
  const attributes: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(query)) {
    if (k.startsWith('attr.')) {
      const values = toList(v);
      if (values.length) attributes[k.slice(5)] = values;
    }
  }
  const sortRaw = String(query.sort ?? 'newest');
  const sort = (['newest', 'price_asc', 'price_desc', 'moq_asc'].includes(sortRaw) ? sortRaw : 'newest') as SortKey;
  const rupees = (v: unknown) => {
    const n = toInt(v);
    return n === undefined ? undefined : n * 100;
  };
  return {
    categoryPath: typeof query.category === 'string' && query.category ? query.category : undefined,
    q: typeof query.q === 'string' && query.q.trim() ? query.q.trim().slice(0, 100) : undefined,
    supplierIds: toList(query.supplier).slice(0, 50),
    moqRanges: toList(query.moq).filter((k) => MOQ_RANGES.some((r) => r.key === k)),
    moqMin: toInt(query.moqMin),
    moqMax: toInt(query.moqMax),
    orderQty: toInt(query.qty),
    priceMin: rupees(query.priceMin),
    priceMax: rupees(query.priceMax),
    priceUnit: typeof query.priceUnit === 'string' ? query.priceUnit : undefined,
    cities: toList(query.city),
    attributes,
    sort,
    page: Math.max(1, toInt(query.page) ?? 1),
    pageSize: Math.min(60, Math.max(1, toInt(query.pageSize) ?? 24)),
  };
}

interface Candidate {
  id: string;
  pricePaise: number;
  priceUnit: string;
  moq: number;
  orderStep: number;
  createdAt: Date;
  city: string;
  supplierId: string;
  supplierName: string;
  attrs: Record<string, string[]>;
}

function normaliseAttributes(raw: Prisma.JsonValue, variants: { size: string | null; colour: string | null }[]) {
  const out: Record<string, string[]> = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw)) {
      const vals = Array.isArray(v) ? v.map(String) : v == null ? [] : [String(v)];
      if (vals.length) out[k] = vals;
    }
  }
  // Variant sizes and colours are filterable too.
  const sizes = variants.map((v) => v.size).filter(Boolean) as string[];
  const colours = variants.map((v) => v.colour).filter(Boolean) as string[];
  if (sizes.length) out.size = [...new Set([...(out.size ?? []), ...sizes])];
  if (colours.length) out.colour = [...new Set([...(out.colour ?? []), ...colours])];
  return out;
}

type Predicate = (c: Candidate) => boolean;

function buildPredicates(q: ListingQuery): Record<string, Predicate> {
  const preds: Record<string, Predicate> = {};
  if (q.moqRanges.length) {
    const ranges = MOQ_RANGES.filter((r) => q.moqRanges.includes(r.key));
    preds.moq = (c) => ranges.some((r) => c.moq >= r.min && (r.max === null || c.moq <= r.max));
  }
  if (q.moqMin !== undefined || q.moqMax !== undefined) {
    preds.moqCustom = (c) => (q.moqMin === undefined || c.moq >= q.moqMin) && (q.moqMax === undefined || c.moq <= q.moqMax);
  }
  if (q.orderQty !== undefined) {
    // The buyer wants N pieces: only listings whose MOQ allows an order of N (respecting order steps).
    const n = q.orderQty;
    preds.qty = (c) => c.moq <= n && (c.orderStep <= 1 || (n - c.moq) % c.orderStep === 0);
  }
  if (q.priceMin !== undefined || q.priceMax !== undefined) {
    preds.price = (c) => (q.priceMin === undefined || c.pricePaise >= q.priceMin) && (q.priceMax === undefined || c.pricePaise <= q.priceMax);
  }
  if (q.priceUnit) preds.priceUnit = (c) => c.priceUnit === q.priceUnit;
  if (q.cities.length) {
    const set = new Set(q.cities.map((s) => s.toLowerCase()));
    preds.city = (c) => set.has(c.city.toLowerCase());
  }
  if (q.supplierIds.length) {
    const set = new Set(q.supplierIds);
    preds.supplier = (c) => set.has(c.supplierId);
  }
  for (const [key, values] of Object.entries(q.attributes)) {
    const set = new Set(values);
    preds[`attr.${key}`] = (c) => (c.attrs[key] ?? []).some((v) => set.has(v));
  }
  return preds;
}

const passesAll = (c: Candidate, preds: Record<string, Predicate>, except?: string) =>
  Object.entries(preds).every(([k, p]) => k === except || p(c));

export interface Facets {
  /** filter key → option → count (based on real listings, disjunctive). */
  attributes: Record<string, Record<string, number>>;
  moq: Record<string, number>;
  cities: Record<string, number>;
  /** supplier id → name and count of matching listings. */
  suppliers: Record<string, { name: string; count: number }>;
  priceUnits: Record<string, number>;
  price: { min: number; max: number } | null;
  /** Total approved listings in scope before any filters. */
  scopeTotal: number;
}

export async function listProducts(q: ListingQuery) {
  const where: Prisma.ProductWhereInput = { ...publicProductWhere() };
  let filterSet: FilterSetKey | null = null;
  if (q.categoryPath) {
    const cat = getCategory(q.categoryPath);
    const paths = cat ? getDescendantPaths(cat.path) : [q.categoryPath];
    filterSet = cat?.filterSet ?? null;
    if (!cat) {
      // Admin-created categories (not in the static taxonomy) — include descendants by path prefix.
      const dbCat = await prisma.category.findUnique({ where: { path: q.categoryPath } });
      filterSet = (dbCat?.filterSet as FilterSetKey) ?? null;
    }
    where.category = { isActive: true, OR: [{ path: { in: paths } }, { path: { startsWith: `${q.categoryPath}/` } }] };
  }
  if (q.q) {
    where.OR = [
      { title: { contains: q.q, mode: 'insensitive' } },
      { description: { contains: q.q, mode: 'insensitive' } },
      { category: { name: { contains: q.q, mode: 'insensitive' } } },
      { supplier: { businessName: { contains: q.q, mode: 'insensitive' } } },
    ];
  }

  // Fetch the lightweight candidate set and filter in memory. This keeps facet
  // counts exact. When the catalogue grows past ~50k listings in a category,
  // move this to a search index (OpenSearch/Meilisearch) behind the same API.
  const rows = await prisma.product.findMany({
    where,
    select: {
      id: true,
      pricePaise: true,
      priceUnit: true,
      moq: true,
      orderStep: true,
      createdAt: true,
      attributes: true,
      supplier: { select: { id: true, businessName: true, city: true } },
      variants: { select: { size: true, colour: true } },
    },
  });
  const candidates: Candidate[] = rows.map((r) => ({
    id: r.id,
    pricePaise: r.pricePaise,
    priceUnit: r.priceUnit,
    moq: r.moq,
    orderStep: r.orderStep,
    createdAt: r.createdAt,
    city: r.supplier.city ?? '',
    supplierId: r.supplier.id,
    supplierName: r.supplier.businessName,
    attrs: normaliseAttributes(r.attributes, r.variants),
  }));

  const preds = buildPredicates(q);
  const matched = candidates.filter((c) => passesAll(c, preds));

  // Facets (disjunctive: each facet ignores its own selection).
  const facetKeys = filterSet ? FILTER_SETS[filterSet].map((f) => f.key) : [...new Set(candidates.flatMap((c) => Object.keys(c.attrs)))];
  const attributes: Facets['attributes'] = {};
  for (const key of facetKeys) {
    const counts: Record<string, number> = {};
    for (const c of candidates) {
      if (!passesAll(c, preds, `attr.${key}`)) continue;
      for (const v of new Set(c.attrs[key] ?? [])) counts[v] = (counts[v] ?? 0) + 1;
    }
    attributes[key] = counts;
  }
  const moq: Record<string, number> = {};
  for (const r of MOQ_RANGES) {
    moq[r.key] = candidates.filter((c) => passesAll(c, preds, 'moq') && c.moq >= r.min && (r.max === null || c.moq <= r.max)).length;
  }
  const cities: Record<string, number> = {};
  const priceUnits: Record<string, number> = {};
  const suppliers: Facets['suppliers'] = {};
  for (const c of candidates) {
    if (passesAll(c, preds, 'supplier')) {
      const e = (suppliers[c.supplierId] ??= { name: c.supplierName, count: 0 });
      e.count += 1;
    }
    if (c.city && passesAll(c, preds, 'city')) cities[c.city] = (cities[c.city] ?? 0) + 1;
    if (passesAll(c, preds, 'priceUnit')) priceUnits[c.priceUnit] = (priceUnits[c.priceUnit] ?? 0) + 1;
  }
  const prices = candidates.map((c) => c.pricePaise);
  const facets: Facets = {
    attributes,
    moq,
    cities,
    suppliers,
    priceUnits,
    price: prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null,
    scopeTotal: candidates.length,
  };

  const sorters: Record<SortKey, (a: Candidate, b: Candidate) => number> = {
    newest: (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    price_asc: (a, b) => a.pricePaise - b.pricePaise,
    price_desc: (a, b) => b.pricePaise - a.pricePaise,
    moq_asc: (a, b) => a.moq - b.moq,
  };
  matched.sort(sorters[q.sort]);
  const total = matched.length;
  const pageIds = matched.slice((q.page - 1) * q.pageSize, q.page * q.pageSize).map((c) => c.id);
  const items = pageIds.length
    ? await prisma.product.findMany({ where: { id: { in: pageIds } }, select: productCardSelect })
    : [];
  const order = new Map(pageIds.map((id, i) => [id, i]));
  items.sort((a, b) => order.get(a.id)! - order.get(b.id)!);

  return { items, total, page: q.page, pageSize: q.pageSize, facets, filterSet };
}
