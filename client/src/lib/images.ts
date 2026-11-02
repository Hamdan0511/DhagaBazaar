import credits from '@/data/image-credits.json';

/**
 * Central image mapping.
 *
 * Every category path maps to a locally stored, licensed photograph (Unsplash
 * License — see /image-credits). These are ILLUSTRATIVE category images, never
 * supplier listings. Categories without a suitable licensed photo fall back to
 * a neutral branded placeholder rather than an unrelated picture.
 */
export interface SiteImage {
  src: string;
  alt: string;
  photographer?: string;
  url?: string;
  width?: number;
  height?: number;
}

const byKey = new Map(credits.map((c) => [c.key, c]));

function img(key: string): SiteImage {
  const c = byKey.get(key);
  if (!c) throw new Error(`Missing image asset: ${key}`);
  return { src: c.src, alt: c.alt, photographer: c.photographer, url: c.url, width: c.width, height: c.height };
}

export const PLACEHOLDER_IMAGE: SiteImage = { src: '/brand/placeholder.svg', alt: 'Dhaaga Bazaar' };

export const heroImages = {
  saree: img('hero/hero-saree'),
};

export const promoImages = {
  sarees: img('promo/sarees'),
  kurtis: img('promo/kurtis'),
  dressMaterials: img('promo/dress-materials'),
};

export const sectionImages = {
  weaving: img('sections/weaving'),
  textileMarket: img('sections/textile-market'),
};

/** Category path → representative image. */
export const categoryImages: Record<string, SiteImage> = {
  'womens-wear': img('categories/womens-wear'),
  'mens-wear': img('categories/mens-wear'),
  'kids-wear': img('categories/kids-wear'),
  footwear: img('categories/footwear'),
  fabrics: img('categories/fabrics'),
  accessories: img('categories/accessories'),

  'womens-wear/sarees': img('categories/sarees'),
  // Reused only where the existing photo genuinely shows the subcategory.
  'womens-wear/sarees/silk-sarees': img('categories/sarees'),
  'womens-wear/sarees/designer-sarees': img('categories/designer-sarees'),
  'womens-wear/sarees/printed-sarees': img('categories/printed-sarees'),
  'womens-wear/sarees/cotton-sarees': img('categories/cotton-sarees'),
  'womens-wear/kurta-sets': img('categories/ethnic-sets'),
  'womens-wear/jeans': img('categories/mens-jeans'),
  'womens-wear/t-shirts': img('categories/mens-t-shirts'),
  'womens-wear/kurtis': img('categories/kurtis'),
  'womens-wear/kurtas': img('categories/kurtas'),
  'womens-wear/salwar-suits': img('categories/salwar-suits'),
  'womens-wear/dress-materials': img('promo/dress-materials'),
  'womens-wear/dupattas': img('categories/dupattas'),
  'womens-wear/lehengas': img('categories/lehengas'),
  'womens-wear/gowns': img('categories/gowns'),
  'womens-wear/western-wear': img('categories/western-wear'),
  'womens-wear/tops': img('categories/tops'),
  'womens-wear/dresses': img('categories/dresses'),
  'womens-wear/blouses': img('categories/blouses'),
  'womens-wear/ethnic-sets': img('categories/ethnic-sets'),
  'womens-wear/co-ord-sets': img('categories/co-ord-sets'),
  'womens-wear/palazzos': img('categories/palazzos'),

  'mens-wear/shirts': img('categories/mens-shirts'),
  'mens-wear/t-shirts': img('categories/mens-t-shirts'),
  'mens-wear/t-shirts/polo-t-shirts': img('categories/polo-t-shirts'),
  'mens-wear/formal-wear': img('categories/mens-formal-wear'),
  'mens-wear/casual-wear': img('categories/mens-casual-wear'),
  'mens-wear/jeans': img('categories/mens-jeans'),
  'mens-wear/trousers': img('categories/mens-trousers'),
  'mens-wear/ethnic-wear': img('categories/mens-ethnic-wear'),
  'mens-wear/kurtas': img('categories/mens-kurtas'),
  'mens-wear/sherwanis': img('categories/mens-sherwanis'),

  'kids-wear/girls-clothing': img('categories/girls-clothing'),
  'kids-wear/dresses': img('categories/girls-clothing'),
  'kids-wear/t-shirts': img('categories/kids-t-shirts'),
  'kids-wear/party-wear': img('categories/girls-clothing'),
  'kids-wear/boys-clothing': img('categories/boys-clothing'),
  'kids-wear/baby-clothing': img('categories/baby-clothing'),
  'kids-wear/ethnic-wear': img('categories/kids-ethnic-wear'),
  'kids-wear/western-wear': img('categories/kids-western-wear'),
  'kids-wear/school-uniforms': img('categories/school-uniforms'),

  'footwear/womens-footwear': img('categories/womens-footwear'),
  'footwear/mens-footwear': img('categories/mens-footwear'),
  'footwear/sandals': img('categories/sandals'),
  'footwear/slippers': img('categories/slippers'),
  'footwear/casual-shoes': img('categories/casual-shoes'),
  'footwear/formal-shoes': img('categories/formal-shoes'),
  'footwear/sports-shoes': img('categories/sports-shoes'),
  'footwear/ethnic-footwear': img('categories/ethnic-footwear'),

  'fabrics/cotton-fabrics': img('categories/cotton-fabrics'),
  'fabrics/silk-fabrics': img('categories/silk-fabrics'),
  'fabrics/printed-fabrics': img('categories/printed-fabrics'),
  'fabrics/embroidered-fabrics': img('categories/embroidered-fabrics'),
  'fabrics/dress-materials': img('promo/dress-materials'),
  'fabrics/fabric-rolls': img('categories/fabrics'),
  'fabrics/textile-accessories': img('categories/textile-accessories'),

  'accessories/bags': img('categories/bags'),
  'accessories/belts': img('categories/belts'),
  'accessories/scarves': img('categories/scarves'),
  'accessories/stoles': img('categories/stoles'),
  'accessories/fashion-accessories': img('categories/fashion-accessories'),
};

/** Returns the category's own image, or null when only a placeholder is appropriate. */
export function getCategoryImage(path: string): SiteImage | null {
  return categoryImages[path] ?? null;
}

export const imageCredits = credits;

/** Additional representative photos for category banners (same licensing rules). */
export const categoryGallery: Record<string, SiteImage[]> = {
  'womens-wear/sarees': [img('categories/sarees-alt'), img('promo/sarees')],
  'womens-wear/kurtis': [img('promo/kurtis')],
  'womens-wear/lehengas': [img('categories/gowns')],
  'mens-wear/sherwanis': [img('categories/mens-ethnic-wear')],
  'mens-wear/kurtas': [img('categories/mens-wear')],
  'footwear/ethnic-footwear': [img('categories/footwear')],
};
