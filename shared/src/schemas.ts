import { z } from 'zod';

export const BUSINESS_TYPES = [
  { value: 'RETAILER', label: 'Retailer', side: 'buyer' },
  { value: 'BOUTIQUE_OWNER', label: 'Boutique Owner', side: 'buyer' },
  { value: 'RESELLER', label: 'Reseller', side: 'buyer' },
  { value: 'WHOLESALER', label: 'Wholesaler / Supplier', side: 'supplier' },
  { value: 'MANUFACTURER', label: 'Manufacturer', side: 'supplier' },
  { value: 'DISTRIBUTOR', label: 'Distributor', side: 'supplier' },
] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number]['value'];
export const SUPPLIER_BUSINESS_TYPES: BusinessType[] = ['WHOLESALER', 'MANUFACTURER', 'DISTRIBUTOR'];
export const isSupplierBusinessType = (t: BusinessType) => SUPPLIER_BUSINESS_TYPES.includes(t);

export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
] as const;

/** Treats empty form inputs as "not provided" so optional numeric fields don't coerce '' to 0. */
const blankToUndefined = (v: unknown) => (v === '' || v === null || (typeof v === 'number' && Number.isNaN(v)) ? undefined : v);
const optionalNumber = <T extends z.ZodTypeAny>(schema: T) => z.preprocess(blankToUndefined, schema.optional());

/** Only absolute http(s) links — rejects javascript:, data:, vbscript: and other schemes. */
export const httpUrl = z
  .string()
  .trim()
  .max(500)
  .url('Enter a valid link')
  .refine((u) => /^https?:\/\//i.test(u), 'Links must start with http:// or https://');

/** Attribute maps are bounded so a single request cannot carry thousands of keys or values. */
const attributeMap = z
  .record(z.string().max(40), z.union([z.string().max(60), z.array(z.string().max(60)).max(30)]).optional())
  .refine((r) => Object.keys(r).length <= 40, 'Too many attributes')
  .default({});

const phone = z
  .string()
  .trim()
  .regex(/^(\+91[\s-]?)?[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number');

const password = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/\d/, 'Include at least one number');

export const gstinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Enter a valid 15-character GSTIN');

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});
export type LoginInput = z.infer<typeof loginSchema>;

const registrationBase = {
  fullName: z.string().trim().min(2, 'Enter your full name').max(100),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  phone,
  password,
  confirmPassword: z.string().min(1, 'Re-enter your password'),
  businessName: z.string().trim().min(2, 'Enter your business name').max(150),
  businessType: z.enum(BUSINESS_TYPES.map((b) => b.value) as [BusinessType, ...BusinessType[]], {
    errorMap: () => ({ message: 'Choose what best describes your business' }),
  }),
  addressLine: z.string().trim().min(3, 'Enter your business address').max(250),
  city: z.string().trim().min(2, 'Enter your city').max(80),
  state: z.enum(INDIAN_STATES, { errorMap: () => ({ message: 'Choose a state' }) }),
  pincode: z.string().trim().regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit PIN code'),
  gstin: gstinSchema.optional().or(z.literal('')),
  /** Retailers: categories they buy. Suppliers: categories they supply. */
  categoryPaths: z.array(z.string().max(120)).max(80).default([]),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'Please accept the terms to continue' }) }),
};

/**
 * One registration contract for both portals. Supplier business types must also
 * declare the categories they supply and describe their business.
 */
export const registerSchema = z
  .object(registrationBase)
  .superRefine((v, ctx) => {
    if (v.password !== v.confirmPassword) ctx.addIssue({ code: 'custom', path: ['confirmPassword'], message: 'Passwords do not match' });
    if (SUPPLIER_BUSINESS_TYPES.includes(v.businessType)) {
      if (v.categoryPaths.length === 0) ctx.addIssue({ code: 'custom', path: ['categoryPaths'], message: 'Choose at least one category you supply' });
      if (!v.description || v.description.length < 20) ctx.addIssue({ code: 'custom', path: ['description'], message: 'Describe your business (min. 20 characters)' });
    }
  });
export type RegisterInput = z.infer<typeof registerSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(20),
  password,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: password,
});

export const addressSchema = z.object({
  label: z.string().trim().min(2, 'e.g. Shop, Warehouse').max(50),
  contactName: z.string().trim().min(2).max(100),
  phone,
  line1: z.string().trim().min(3, 'Enter the address').max(200),
  line2: z.string().trim().max(200).optional().or(z.literal('')),
  city: z.string().trim().min(2).max(80),
  state: z.enum(INDIAN_STATES, { errorMap: () => ({ message: 'Choose a state' }) }),
  pincode: z.string().trim().regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit PIN code'),
  isDefault: z.boolean().optional(),
});
export type AddressInput = z.infer<typeof addressSchema>;

export const retailerProfileSchema = z.object({
  businessName: z.string().trim().min(2).max(150),
  businessType: z.enum(['RETAILER', 'BOUTIQUE_OWNER', 'RESELLER']),
  gstin: gstinSchema.optional().or(z.literal('')),
  city: z.string().trim().min(2).max(80),
  state: z.enum(INDIAN_STATES).optional(),
  phone,
  interests: z.array(z.string().max(120)).max(30).optional(),
});
export type RetailerProfileInput = z.infer<typeof retailerProfileSchema>;

export const supplierProfileSchema = z.object({
  businessName: z.string().trim().min(2, 'Enter your registered business name').max(150),
  businessType: z.enum(['WHOLESALER', 'MANUFACTURER', 'DISTRIBUTOR']),
  contactName: z.string().trim().min(2).max(100),
  phone,
  whatsapp: z.string().trim().regex(/^(\+91[\s-]?)?[6-9]\d{9}$/, 'Enter a valid number').optional().or(z.literal('')),
  gstin: gstinSchema.optional().or(z.literal('')),
  yearEstablished: optionalNumber(z.coerce.number().int().min(1900, 'Enter a year after 1900').max(new Date().getFullYear(), 'Year cannot be in the future')),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  addressLine: z.string().trim().min(3, 'Enter your business address').max(250),
  city: z.string().trim().min(2).max(80),
  state: z.enum(INDIAN_STATES, { errorMap: () => ({ message: 'Choose a state' }) }),
  pincode: z.string().trim().regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit PIN code'),
  categoryPaths: z.array(z.string().max(120)).min(1, 'Choose at least one category you supply').max(80, 'Choose at most 80 categories'),
  minOrderValue: optionalNumber(z.coerce.number().int().min(0).max(100_000_000)),
});
export type SupplierProfileInput = z.infer<typeof supplierProfileSchema>;

/** Supplier application statuses as shown to suppliers and admins. */
export const SUPPLIER_STATUS_LABELS: Record<string, string> = {
  INCOMPLETE: 'Draft',
  PENDING_REVIEW: 'Pending Review',
  INFO_REQUESTED: 'Additional Information Required',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  SUSPENDED: 'Suspended',
};

export const SUPPLIER_DOCUMENT_TYPES = [
  { value: 'GST_CERTIFICATE', label: 'GST registration certificate' },
  { value: 'PAN_CARD', label: 'Business PAN card' },
  { value: 'UDYAM_CERTIFICATE', label: 'Udyam / MSME certificate' },
  { value: 'TRADE_LICENSE', label: 'Trade licence' },
  { value: 'CANCELLED_CHEQUE', label: 'Cancelled cheque / bank proof' },
  { value: 'OTHER', label: 'Other document' },
] as const;

export const PRICE_UNITS = [
  { value: 'PIECE', label: 'per piece' },
  { value: 'SET', label: 'per set' },
  { value: 'METRE', label: 'per metre' },
  { value: 'PAIR', label: 'per pair' },
] as const;
export type PriceUnit = (typeof PRICE_UNITS)[number]['value'];

export const IMAGE_USAGE_RIGHTS = [
  { value: 'SUPPLIER_OWNED', label: 'Original photo taken by / owned by my business' },
  { value: 'LICENSED', label: 'Licensed for commercial use (attribution provided)' },
  { value: 'MANUFACTURER_PROVIDED', label: 'Provided by the manufacturer with permission to resell' },
] as const;

export const variantSchema = z.object({
  id: z.string().optional(),
  size: z.string().trim().max(30).optional().or(z.literal('')),
  colour: z.string().trim().max(40).optional().or(z.literal('')),
  sku: z.string().trim().max(60).optional().or(z.literal('')),
  /** Optional price override in rupees; falls back to the product price. */
  price: optionalNumber(z.coerce.number().positive().max(10_000_000)),
  /** Units in stock for this option; empty = not tracked. */
  stockQuantity: optionalNumber(z.coerce.number().int().min(0, 'Stock cannot be negative').max(10_000_000)),
  isAvailable: z.boolean().default(true),
});

/**
 * Basic details every listing can carry, whatever its category. When a category's filter
 * set already defines one of these keys (e.g. fabric for sarees) its preset options are used
 * instead; otherwise suppliers type a short value.
 */
export const GENERAL_PRODUCT_FIELDS = [
  { key: 'gender', label: 'Gender', options: ['Women', 'Men', 'Girls', 'Boys', 'Unisex', 'Kids (Unisex)', 'Infants'] },
  { key: 'productType', label: 'Product type', placeholder: 'e.g. Straight kurti, Polo T-shirt, Brief' },
  { key: 'fabric', label: 'Fabric / material', placeholder: 'e.g. Cotton, Rayon, Silk blend' },
  { key: 'pattern', label: 'Pattern', placeholder: 'e.g. Solid, Printed, Embroidered' },
  { key: 'occasion', label: 'Occasion', placeholder: 'e.g. Daily wear, Festive, Office' },
  { key: 'brand', label: 'Brand (if applicable)', placeholder: 'Leave empty for unbranded' },
] as const;

/** Optional volume pricing: buy at least `minQty` (across all options) and pay `price` per unit. */
export const priceTierSchema = z.object({
  minQty: z.coerce.number({ invalid_type_error: 'Enter a quantity' }).int().min(2, 'Tier quantity must be at least 2').max(1_000_000),
  price: z.coerce.number({ invalid_type_error: 'Enter a price' }).positive('Price must be more than ₹0').max(10_000_000),
});
export type PriceTierInput = z.infer<typeof priceTierSchema>;

/** Checks tiers against the base price and MOQ; returns a message or null. */
export function priceTierProblem(tiers: PriceTierInput[], basePrice: number, moq: number): string | null {
  let prevQty = moq;
  let prevPrice = basePrice;
  for (const [i, t] of tiers.entries()) {
    if (t.minQty <= prevQty) return `Price tier ${i + 1}: quantity must be more than ${prevQty}${i === 0 ? ' (the MOQ)' : ''}.`;
    if (t.price >= prevPrice) return `Price tier ${i + 1}: price must be lower than ₹${prevPrice}.`;
    prevQty = t.minQty;
    prevPrice = t.price;
  }
  return null;
}

export const productSchema = z.object({
  title: z.string().trim().min(5, 'Use a descriptive title (min. 5 characters)').max(160),
  description: z.string().trim().min(20, 'Describe the product (min. 20 characters)').max(5000),
  categoryPath: z.string().min(1, 'Choose a category'),
  /** Wholesale price in rupees (stored in paise). */
  price: z.coerce.number({ invalid_type_error: 'Enter a price' }).positive('Price must be more than ₹0').max(10_000_000),
  priceUnit: z.enum(['PIECE', 'SET', 'METRE', 'PAIR']),
  piecesPerSet: optionalNumber(z.coerce.number().int().min(1).max(1000)),
  moq: z.coerce.number({ invalid_type_error: 'Enter the MOQ' }).int().min(1, 'MOQ must be at least 1').max(1_000_000),
  orderStep: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(10_000).default(1)),
  leadTimeDays: optionalNumber(z.coerce.number().int().min(0).max(365)),
  /** Units in stock when the listing has no size/colour options; empty = not tracked. */
  stockQuantity: optionalNumber(z.coerce.number().int().min(0, 'Stock cannot be negative').max(10_000_000)),
  attributes: attributeMap,
  variants: z.array(variantSchema).max(200).default([]),
  priceTiers: z.array(priceTierSchema).max(5, 'Up to 5 price tiers').default([]),
});
export type ProductInput = z.infer<typeof productSchema>;

export const cartItemSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().optional().nullable(),
  quantity: z.coerce.number().int().min(1).max(1_000_000),
});

export const enquirySchema = z.object({
  productId: z.string().optional(),
  supplierId: z.string().min(1),
  quantity: optionalNumber(z.coerce.number().int().min(1).max(1_000_000)),
  message: z.string().trim().min(10, 'Tell the supplier what you need (min. 10 characters)').max(2000),
});

export const complaintSchema = z.object({
  orderId: z.string().optional(),
  supplierOrderId: z.string().optional(),
  subject: z.string().trim().min(5).max(150),
  description: z.string().trim().min(20).max(4000),
  type: z.enum(['QUALITY', 'DELIVERY', 'WRONG_ITEM', 'PAYMENT', 'OTHER']),
});

export const dispatchSchema = z.object({
  carrier: z.string().trim().min(2, 'Enter the courier / transporter').max(100),
  trackingNumber: z.string().trim().min(3).max(100),
  trackingUrl: httpUrl.optional().or(z.literal('')),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
});

export const contactSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email(),
  phone: phone.optional().or(z.literal('')),
  topic: z.enum(['GENERAL', 'RETAILER', 'SUPPLIER', 'ORDER', 'TECHNICAL']),
  message: z.string().trim().min(10).max(3000),
});

export const stockUpdateSchema = z.object({
  stockQuantity: optionalNumber(z.coerce.number().int().min(0).max(10_000_000)).nullable(),
  variants: z
    .array(z.object({ id: z.string().min(1), stockQuantity: optionalNumber(z.coerce.number().int().min(0).max(10_000_000)).nullable() }))
    .max(200)
    .default([]),
});

export const accountNameSchema = z.object({ fullName: z.string().trim().min(2, 'Enter your full name').max(100) });
