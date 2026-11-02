/**
 * Category-specific B2B filter definitions.
 *
 * Every product stores its category-specific attributes as a JSON object
 * (e.g. { fabric: "Silk", occasion: ["Wedding"] }). The filter sets below
 * describe which attributes are filterable for which kind of category.
 * Option counts are ALWAYS computed from real approved listings — these are
 * only the vocabulary, never results.
 */

export interface AttributeFilterDef {
  key: string;
  label: string;
  options: readonly string[];
}

const COLOURS = [
  'Red', 'Maroon', 'Pink', 'Orange', 'Yellow', 'Mustard', 'Green', 'Teal', 'Blue', 'Navy',
  'Purple', 'Wine', 'Black', 'White', 'Off-White', 'Cream', 'Beige', 'Brown', 'Grey',
  'Gold', 'Silver', 'Peach', 'Multicolour',
] as const;

const APPAREL_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL', 'Free Size'] as const;
const MENS_SIZES = ['S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '28', '30', '32', '34', '36', '38', '40', '42', '44'] as const;
const KIDS_SIZES = ['16', '18', '20', '22', '24', '26', '28', '30', '32', '34', '36', 'Free Size'] as const;
const FOOTWEAR_SIZES = ['UK 1', 'UK 2', 'UK 3', 'UK 4', 'UK 5', 'UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10', 'UK 11', 'UK 12'] as const;

const ETHNIC_FABRICS = [
  'Cotton', 'Silk', 'Art Silk', 'Georgette', 'Chiffon', 'Crepe', 'Rayon', 'Linen', 'Organza',
  'Net', 'Velvet', 'Chanderi', 'Banarasi', 'Polyester', 'Muslin', 'Khadi', 'Tussar',
] as const;
const WESTERN_FABRICS = ['Cotton', 'Rayon', 'Polyester', 'Crepe', 'Georgette', 'Linen', 'Denim', 'Lycra', 'Viscose', 'Knit', 'Satin'] as const;
const MENS_FABRICS = ['Cotton', 'Linen', 'Polyester', 'Denim', 'Rayon', 'Cotton Blend', 'Silk', 'Khadi', 'Lycra', 'Wool Blend'] as const;
const PATTERNS = ['Solid', 'Printed', 'Embroidered', 'Woven', 'Block Print', 'Bandhani', 'Ikat', 'Floral', 'Geometric', 'Striped', 'Checked', 'Self Design'] as const;
const OCCASIONS = ['Daily Wear', 'Casual', 'Office', 'Festive', 'Party', 'Wedding'] as const;
const SLEEVES = ['Sleeveless', 'Short Sleeve', 'Three-Quarter', 'Full Sleeve', 'Bell Sleeve', 'Puff Sleeve'] as const;

const colour: AttributeFilterDef = { key: 'colour', label: 'Colour', options: COLOURS };
const pattern: AttributeFilterDef = { key: 'pattern', label: 'Pattern', options: PATTERNS };
const ethnicFabric: AttributeFilterDef = { key: 'fabric', label: 'Fabric', options: ETHNIC_FABRICS };
const sleeve: AttributeFilterDef = { key: 'sleeve', label: 'Sleeve Type', options: SLEEVES };
const apparelSize: AttributeFilterDef = { key: 'size', label: 'Size Range', options: APPAREL_SIZES };
const occasion: AttributeFilterDef = { key: 'occasion', label: 'Occasion', options: OCCASIONS };

export const FILTER_SETS = {
  saree: [
    { key: 'fabric', label: 'Fabric Type', options: ETHNIC_FABRICS },
    occasion,
    {
      key: 'sareeStyle', label: 'Saree Style',
      options: ['Kanjeevaram', 'Banarasi', 'Mysore Silk', 'Paithani', 'Chanderi', 'Bandhani', 'Patola', 'Tant', 'Ilkal', 'Pochampally', 'Ready-to-Wear', 'Half Saree', 'Regular Drape'],
    },
    {
      key: 'work', label: 'Work & Embellishment',
      options: ['Zari', 'Embroidery', 'Sequins', 'Stone Work', 'Mirror Work', 'Lace Border', 'Woven Design', 'Printed', 'Plain'],
    },
    colour,
  ],
  kurti: [
    { key: 'kurtiType', label: 'Kurti Type', options: ['Straight', 'A-Line', 'Anarkali', 'Flared', 'Kaftan', 'High-Low', 'Asymmetric', 'Shirt Style', 'Angrakha', 'Short Kurti'] },
    { key: 'length', label: 'Length', options: ['Short', 'Hip Length', 'Knee Length', 'Calf Length', 'Ankle Length'] },
    sleeve,
    { key: 'neck', label: 'Neck Design', options: ['Round', 'V-Neck', 'Mandarin', 'Boat', 'Keyhole', 'Square', 'Sweetheart', 'Collared', 'Notched'] },
    ethnicFabric,
    pattern,
    colour,
    apparelSize,
  ],
  ethnicSet: [
    { key: 'setType', label: 'Set Type', options: ['Kurta Only', 'Kurta + Bottom', 'Kurta + Bottom + Dupatta', 'Unstitched Suit'] },
    { key: 'bottomStyle', label: 'Bottom Style', options: ['Salwar', 'Churidar', 'Palazzo', 'Pants', 'Sharara', 'Gharara', 'Patiala'] },
    ethnicFabric,
    pattern,
    occasion,
    colour,
    apparelSize,
  ],
  dupatta: [
    ethnicFabric,
    { key: 'length', label: 'Length', options: ['2.0 m', '2.25 m', '2.5 m', '2.75 m'] },
    { key: 'embroidery', label: 'Embroidery', options: ['None', 'Thread Work', 'Zari', 'Sequins', 'Mirror Work', 'Gota Patti', 'Phulkari', 'Chikankari'] },
    pattern,
    colour,
  ],
  lehenga: [
    occasion,
    { key: 'embroidery', label: 'Embroidery', options: ['Zari', 'Zardozi', 'Sequins', 'Thread Work', 'Mirror Work', 'Gota Patti', 'Stone Work', 'Printed'] },
    ethnicFabric,
    { key: 'setType', label: 'Set Type', options: ['Lehenga Only', 'Lehenga + Choli', 'Lehenga + Choli + Dupatta', 'Semi-Stitched Set', 'Unstitched Set'] },
    colour,
  ],
  dressMaterial: [
    ethnicFabric,
    { key: 'stitchType', label: 'Stitch Type', options: ['Unstitched', 'Semi-Stitched'] },
    { key: 'components', label: 'Components', options: ['Top Only', 'Top + Bottom', 'Top + Bottom + Dupatta'] },
    pattern,
    colour,
  ],
  womensWestern: [
    { key: 'style', label: 'Style', options: ['Casual', 'Formal', 'Party', 'Bodycon', 'A-Line', 'Fit & Flare', 'Wrap', 'Shirt Style', 'Peplum', 'Crop', 'Tunic'] },
    sleeve,
    { key: 'length', label: 'Length', options: ['Crop', 'Regular', 'Mini', 'Knee Length', 'Midi', 'Maxi'] },
    { key: 'fabric', label: 'Fabric', options: WESTERN_FABRICS },
    pattern,
    colour,
    apparelSize,
  ],
  blouse: [
    { key: 'blouseType', label: 'Blouse Type', options: ['Readymade', 'Unstitched Blouse Piece', 'Padded', 'Non-Padded'] },
    sleeve,
    { key: 'neck', label: 'Neck Design', options: ['Round', 'V-Neck', 'Boat', 'Sweetheart', 'High Neck', 'Deep Back', 'Square'] },
    ethnicFabric,
    { key: 'work', label: 'Work', options: ['Plain', 'Embroidery', 'Zari', 'Sequins', 'Mirror Work', 'Maggam Work'] },
    colour,
    apparelSize,
  ],
  basics: [
    { key: 'fabric', label: 'Fabric', options: ['Cotton', 'Cotton Blend', 'Modal', 'Viscose', 'Lycra', 'Polyester', 'Satin', 'Rayon'] },
    pattern,
    colour,
    apparelSize,
  ],
  innerwear: [
    { key: 'innerwearType', label: 'Type', options: ['Bra', 'Sports Bra', 'Panty', 'Brief', 'Trunk', 'Boxer', 'Vest', 'Camisole', 'Slip', 'Shapewear', 'Thermal Top', 'Thermal Bottom', 'Thermal Set'] },
    { key: 'fabric', label: 'Fabric', options: ['Cotton', 'Cotton Blend', 'Modal', 'Lycra', 'Nylon', 'Polyester', 'Microfibre', 'Viscose', 'Wool Blend'] },
    { key: 'packSize', label: 'Pack Size', options: ['Single', 'Pack of 2', 'Pack of 3', 'Pack of 5', 'Pack of 6', 'Pack of 10', 'Pack of 12'] },
    colour,
    { key: 'size', label: 'Size', options: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', 'Free Size', '30B', '32B', '34B', '36B', '38B', '32C', '34C', '36C', '38C', '40C', '34D', '36D', '38D'] },
  ],
  mens: [
    { key: 'garmentType', label: 'Type', options: ['Formal Shirt', 'Casual Shirt', 'Party Shirt', 'Polo', 'Round Neck T-Shirt', 'Oversized T-Shirt', 'Kurta', 'Blazer', 'Suit', 'Jeans', 'Trousers', 'Chinos', 'Shorts', 'Track Pants'] },
    { key: 'fit', label: 'Fit', options: ['Slim', 'Regular', 'Relaxed', 'Oversized', 'Tailored', 'Skinny', 'Straight'] },
    { key: 'sleeve', label: 'Sleeve', options: ['Half Sleeve', 'Full Sleeve', 'Sleeveless'] },
    { key: 'fabric', label: 'Fabric', options: MENS_FABRICS },
    pattern,
    { key: 'size', label: 'Size', options: MENS_SIZES },
    colour,
  ],
  mensEthnic: [
    { key: 'garmentType', label: 'Type', options: ['Kurta', 'Kurta Set', 'Sherwani', 'Nehru Jacket', 'Pathani Suit', 'Indo-Western', 'Dhoti Set'] },
    { key: 'fit', label: 'Fit', options: ['Slim', 'Regular', 'Relaxed'] },
    { key: 'fabric', label: 'Fabric', options: ['Cotton', 'Linen', 'Silk', 'Art Silk', 'Jacquard', 'Velvet', 'Khadi', 'Rayon'] },
    pattern,
    occasion,
    { key: 'size', label: 'Size', options: MENS_SIZES },
    colour,
  ],
  kids: [
    { key: 'ageGroup', label: 'Age Group', options: ['0–6 Months', '6–12 Months', '1–2 Years', '2–4 Years', '4–6 Years', '6–8 Years', '8–10 Years', '10–12 Years', '12–14 Years', '14–16 Years'] },
    { key: 'gender', label: 'Gender Category', options: ['Boys', 'Girls', 'Unisex'] },
    { key: 'clothingType', label: 'Clothing Type', options: ['Frock', 'Top', 'T-Shirt', 'Shirt', 'Shorts', 'Jeans', 'Ethnic Set', 'Lehenga Choli', 'Kurta Pyjama', 'Romper', 'Onesie', 'Uniform', 'Night Suit', 'Party Dress'] },
    { key: 'size', label: 'Size', options: KIDS_SIZES },
    { key: 'fabric', label: 'Fabric', options: ['Cotton', 'Hosiery', 'Rayon', 'Polyester', 'Silk', 'Denim', 'Net', 'Fleece'] },
    colour,
    { key: 'occasion', label: 'Occasion', options: ['Daily Wear', 'School', 'Festive', 'Party', 'Sports', 'Sleepwear'] },
  ],
  footwear: [
    { key: 'footwearType', label: 'Footwear Type', options: ['Sandals', 'Slippers', 'Flip-Flops', 'Juttis', 'Mojaris', 'Kolhapuris', 'Heels', 'Flats', 'Wedges', 'Sneakers', 'Sports Shoes', 'Formal Shoes', 'Loafers', 'Boots'] },
    { key: 'size', label: 'Size', options: FOOTWEAR_SIZES },
    { key: 'material', label: 'Material', options: ['Leather', 'Synthetic Leather', 'PU', 'Canvas', 'Rubber', 'Mesh', 'Fabric', 'Velvet', 'EVA'] },
    colour,
    { key: 'style', label: 'Style', options: ['Casual', 'Formal', 'Ethnic', 'Party', 'Sports', 'Daily Wear'] },
  ],
  fabric: [
    { key: 'fabricType', label: 'Fabric Type', options: ['Cotton', 'Silk', 'Linen', 'Polyester', 'Rayon', 'Georgette', 'Chiffon', 'Crepe', 'Velvet', 'Denim', 'Khadi', 'Organza', 'Net', 'Muslin'] },
    pattern,
    { key: 'width', label: 'Width', options: ['36 in', '44 in', '54 in', '58 in', '60 in'] },
    { key: 'sellingUnit', label: 'Selling Unit', options: ['Per Metre', 'Per Than / Bolt', 'Per Kg'] },
    colour,
  ],
  textileAccessory: [
    { key: 'accessoryType', label: 'Type', options: ['Lace', 'Border', 'Buttons', 'Thread', 'Zip', 'Tassels', 'Latkans', 'Patches', 'Elastic'] },
    { key: 'material', label: 'Material', options: ['Cotton', 'Polyester', 'Zari', 'Metal', 'Plastic', 'Wood', 'Shell'] },
    colour,
  ],
  accessories: [
    { key: 'accessoryType', label: 'Type', options: ['Handbag', 'Clutch', 'Sling Bag', 'Tote', 'Potli', 'Belt', 'Scarf', 'Stole', 'Shawl', 'Jewellery', 'Hair Accessory', 'Wallet', 'Cap', 'Socks'] },
    { key: 'material', label: 'Material', options: ['Leather', 'PU Leather', 'Fabric', 'Jute', 'Velvet', 'Silk', 'Wool', 'Metal', 'Beads'] },
    { key: 'gender', label: 'For', options: ['Women', 'Men', 'Unisex'] },
    colour,
  ],
} as const satisfies Record<string, readonly AttributeFilterDef[]>;

export type FilterSetKey = keyof typeof FILTER_SETS;

/** MOQ ranges (pieces). These are filter ranges, not promises of availability. */
export const MOQ_RANGES = [
  { key: '5-10', label: '5–10 pieces', min: 5, max: 10 },
  { key: '10-25', label: '10–25 pieces', min: 10, max: 25 },
  { key: '25-50', label: '25–50 pieces', min: 25, max: 50 },
  { key: '50-100', label: '50–100 pieces', min: 50, max: 100 },
  { key: '100-250', label: '100–250 pieces', min: 100, max: 250 },
  { key: '250-500', label: '250–500 pieces', min: 250, max: 500 },
  { key: '500+', label: '500+ pieces', min: 500, max: null },
] as const;

/** Buyer's intended order quantity presets — matched against each listing's MOQ. */
export const ORDER_QUANTITY_PRESETS = [10, 20, 50, 100, 250, 500] as const;

export const SORT_OPTIONS = [
  { key: 'newest', label: 'Newest first' },
  { key: 'price_asc', label: 'Price: low to high' },
  { key: 'price_desc', label: 'Price: high to low' },
  { key: 'moq_asc', label: 'MOQ: low to high' },
] as const;
export type SortKey = (typeof SORT_OPTIONS)[number]['key'];

export function getFilterSet(key: FilterSetKey): readonly AttributeFilterDef[] {
  return FILTER_SETS[key];
}
