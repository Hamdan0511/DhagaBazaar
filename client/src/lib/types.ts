export type Role = 'RETAILER' | 'SUPPLIER' | 'ADMIN';
export type SupplierStatus = 'INCOMPLETE' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
export type ProductStatus = 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'ARCHIVED';
export type PriceUnit = 'PIECE' | 'SET' | 'METRE' | 'PAIR';

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: Role;
  businessType: string | null;
  retailer: { id: string; businessName: string; city: string } | null;
  supplier: { id: string; businessName: string; status: SupplierStatus; isVerified: boolean } | null;
}

export interface ProductCardData {
  id: string;
  title: string;
  pricePaise: number;
  priceUnit: PriceUnit;
  piecesPerSet: number | null;
  moq: number;
  orderStep: number;
  availability: 'AVAILABLE' | 'MADE_TO_ORDER' | 'OUT_OF_STOCK';
  /** Units in stock when tracked at product level; null = not tracked. */
  stockQuantity: number | null;
  isFixture: boolean;
  createdAt: string;
  category: { path: string; name: string };
  supplier: { id: string; businessName: string; city: string | null; state: string | null; isVerified: boolean; isFixture: boolean };
  images: { url: string; altText: string | null }[];
}

export interface Facets {
  attributes: Record<string, Record<string, number>>;
  moq: Record<string, number>;
  cities: Record<string, number>;
  suppliers: Record<string, { name: string; count: number }>;
  priceUnits: Record<string, number>;
  price: { min: number; max: number } | null;
  scopeTotal: number;
}

export interface ListingResponse {
  items: ProductCardData[];
  total: number;
  page: number;
  pageSize: number;
  facets: Facets;
  filterSet: string | null;
}

export interface Variant {
  id: string;
  size: string | null;
  colour: string | null;
  sku: string | null;
  pricePaise: number | null;
  stockQuantity: number | null;
  isAvailable: boolean;
}

export interface ProductDetail extends Omit<ProductCardData, 'images' | 'supplier' | 'category'> {
  description: string;
  leadTimeDays: number | null;
  attributes: Record<string, string[] | string>;
  priceTiers?: { minQty: number; pricePaise: number }[];
  category: { path: string; name: string; filterSet: string };
  variants: Variant[];
  images: { id: string; url: string; altText: string | null; attribution: string | null; aiEnhanced?: boolean }[];
  supplier: {
    id: string;
    businessName: string;
    businessType: string;
    city: string | null;
    state: string | null;
    isVerified: boolean;
    yearEstablished: number | null;
    description: string | null;
    isFixture: boolean;
    minOrderValuePaise: number | null;
  };
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
  priceUnit: PriceUnit;
  lineTotalPaise: number;
  issue: string | null;
}

export interface CartSupplierGroup {
  supplierId: string;
  supplierName: string;
  supplierCity: string | null;
  isFixture: boolean;
  lines: CartLine[];
  products: { productId: string; title: string; moq: number; orderStep: number; totalQuantity: number; moqError: string | null; stockError: string | null; isFixture: boolean }[];
  subtotalPaise: number;
  issues: string[];
  hasIssues: boolean;
}

export interface Cart {
  cartId: string;
  suppliers: CartSupplierGroup[];
  itemCount: number;
  totalQuantity: number;
  subtotalPaise: number;
  issues: string[];
  canCheckout: boolean;
}

export interface Address {
  id: string;
  label: string;
  contactName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
}

export interface Shipment {
  id: string;
  carrier: string;
  trackingNumber: string;
  trackingUrl: string | null;
  status: string;
  notes: string | null;
  dispatchedAt: string;
  deliveredAt: string | null;
}

export interface OrderItem {
  id: string;
  productId: string | null;
  productTitle: string;
  variantLabel: string | null;
  unitPricePaise: number;
  priceUnit: PriceUnit;
  quantity: number;
  lineTotalPaise: number;
  moqAtOrder: number;
}

export interface SupplierOrder {
  id: string;
  status: string;
  subtotalPaise: number;
  supplierNote: string | null;
  confirmedAt: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  supplier: { id: string; businessName: string; city: string | null; phone: string; whatsapp: string | null };
  items: OrderItem[];
  shipments: Shipment[];
}

export interface Order {
  id: string;
  orderNumber: string;
  status: string;
  subtotalPaise: number;
  notes: string | null;
  createdAt: string;
  shippingAddress: Omit<Address, 'id' | 'isDefault'>;
  supplierOrders: SupplierOrder[];
  complaints: { id: string; subject: string; status: string; createdAt: string }[];
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}
