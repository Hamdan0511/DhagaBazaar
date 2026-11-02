/** Money is stored as integer paise everywhere. */
/** Unit price under volume tiers for a total quantity (same rule the server applies at checkout). */
export function tierUnitPricePaise(basePaise: number, tiers: { minQty: number; pricePaise: number }[] | undefined, quantity: number): number {
  let price = basePaise;
  for (const t of tiers ?? []) if (quantity >= t.minQty && t.pricePaise > 0 && t.pricePaise < price) price = t.pricePaise;
  return price;
}

export const rupeesToPaise = (rupees: number) => Math.round(rupees * 100);
export const paiseToRupees = (paise: number) => paise / 100;

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 0 });
export const formatINR = (paise: number) => inr.format(paise / 100);

export const formatNumber = (n: number) => new Intl.NumberFormat('en-IN').format(n);

export const PRICE_UNIT_SHORT: Record<string, string> = { PIECE: 'piece', SET: 'set', METRE: 'metre', PAIR: 'pair' };

/** Validates a requested quantity against MOQ and order step. Returns an error message or null. */
export function validateOrderQuantity(quantity: number, moq: number, orderStep = 1): string | null {
  if (!Number.isInteger(quantity) || quantity < 1) return 'Enter a whole number quantity.';
  if (quantity < moq) return `Minimum order quantity is ${formatNumber(moq)}.`;
  if (orderStep > 1 && (quantity - moq) % orderStep !== 0) return `Quantity must increase in steps of ${orderStep} above the MOQ.`;
  return null;
}

/**
 * Money columns are 32-bit integers (paise). Keep any single order group and
 * order below this ceiling (≈ ₹2 crore) until the columns are widened to BIGINT.
 */
export const MAX_ORDER_VALUE_PAISE = 2_000_000_000;
export const MAX_LINE_QUANTITY = 1_000_000;

/** True for absolute http(s) URLs only; use before rendering user-supplied links. */
export function isSafeHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
