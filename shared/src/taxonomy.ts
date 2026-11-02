import type { FilterSetKey } from './filters.js';

/**
 * The Dhaaga Bazaar category taxonomy.
 *
 * This is the single source of truth for categories. The server seeds it into
 * the `categories` table (admins can add more later) and the client uses it for
 * navigation, search suggestions and category pages. Adding a category here or
 * via the admin panel never requires a redesign: every page is template-driven.
 */
export interface CategoryNode {
  slug: string;
  name: string;
  /** Page heading, e.g. "Wholesale Sarees". Defaults to `Wholesale ${name}`. */
  title?: string;
  description: string;
  /** Short card blurb used on the homepage collections. */
  blurb?: string;
  filterSet: FilterSetKey;
  keywords?: string[];
  children?: CategoryNode[];
}

export interface FlatCategory extends Omit<CategoryNode, 'children'> {
  path: string;
  parentPath: string | null;
  depth: number;
  rootSlug: string;
  childPaths: string[];
  /** Names from root to this node, used for breadcrumbs. */
  trail: { name: string; path: string }[];
}

export const TAXONOMY: CategoryNode[] = [
  {
    slug: 'womens-wear',
    name: "Women's Wear",
    description: 'Sarees, kurtis, suits, lehengas and western wear for boutiques and fashion retailers.',
    filterSet: 'kurti',
    keywords: ['women', 'ladies', 'womens'],
    children: [
      {
        slug: 'sarees', name: 'Sarees', description: 'Explore saree collections for your retail business.', blurb: 'Silk, cotton, printed & occasion sarees', filterSet: 'saree', keywords: ['saree', 'sari', 'kanjeevaram', 'banarasi'],
        children: [
          { slug: 'silk-sarees', name: 'Silk Sarees', description: 'Kanjeevaram, Banarasi, Mysore and art silk sarees.', filterSet: 'saree', keywords: ['silk saree', 'kanjeevaram', 'banarasi', 'pattu'] },
          { slug: 'cotton-sarees', name: 'Cotton Sarees', description: 'Handloom and printed cotton sarees for daily wear.', filterSet: 'saree', keywords: ['cotton saree', 'handloom saree'] },
          { slug: 'designer-sarees', name: 'Designer Sarees', description: 'Embellished party and occasion sarees.', filterSet: 'saree', keywords: ['designer saree', 'party saree', 'party wear saree'] },
          { slug: 'printed-sarees', name: 'Printed Sarees', description: 'Digital, block and floral printed sarees.', filterSet: 'saree', keywords: ['printed saree', 'georgette saree'] },
        ],
      },
      { slug: 'kurtis', name: 'Kurtis', description: 'Straight, A-line, Anarkali and printed kurtis for bulk buying.', blurb: 'Straight, Anarkali & printed styles', filterSet: 'kurti', keywords: ['kurti', 'anarkali', 'tunic'] },
      { slug: 'kurtas', name: 'Kurtas', title: "Wholesale Women's Kurtas", description: 'Everyday and festive kurtas for women.', blurb: 'Everyday & festive kurtas', filterSet: 'ethnicSet', keywords: ['kurta', 'womens kurta'] },
      { slug: 'kurta-sets', name: 'Kurta Sets', title: "Wholesale Women's Kurta Sets", description: 'Kurta with pants, palazzo or dupatta sets.', blurb: 'Two- and three-piece sets', filterSet: 'ethnicSet', keywords: ['kurta set', 'kurta pant set', 'three piece suit'] },
      { slug: 'anarkali-suits', name: 'Anarkali Suits', description: 'Flared Anarkali suits for festive and party wear.', blurb: 'Flared festive suits', filterSet: 'ethnicSet', keywords: ['anarkali', 'anarkali suit'] },
      { slug: 'salwar-suits', name: 'Salwar Suits', description: 'Ready-to-wear salwar, churidar and palazzo suit sets.', blurb: 'Salwar, churidar & palazzo sets', filterSet: 'ethnicSet', keywords: ['salwar', 'suit', 'churidar', 'salwar kameez'] },
      { slug: 'dress-materials', name: 'Dress Materials', description: 'Unstitched and semi-stitched dress material sets.', blurb: 'Unstitched & semi-stitched sets', filterSet: 'dressMaterial', keywords: ['dress material', 'unstitched', 'suit piece'] },
      { slug: 'dupattas', name: 'Dupattas', description: 'Embroidered, printed and woven dupattas in every fabric.', blurb: 'Embroidered, printed & woven', filterSet: 'dupatta', keywords: ['dupatta', 'chunni', 'odhni'] },
      { slug: 'lehengas', name: 'Lehengas', description: 'Bridal, festive and party lehenga cholis and sets.', blurb: 'Bridal, festive & party wear', filterSet: 'lehenga', keywords: ['lehenga', 'lehnga', 'choli', 'ghagra', 'bridal'] },
      { slug: 'gowns', name: 'Gowns', description: 'Ethnic and Indo-western gowns for occasion wear.', blurb: 'Ethnic & Indo-western gowns', filterSet: 'womensWestern', keywords: ['gown', 'anarkali gown'] },
      { slug: 'western-wear', name: "Women's Western Wear", title: "Wholesale Women's Western Wear", description: 'Tops, dresses, jeans and co-ords in western silhouettes.', blurb: 'Contemporary everyday fashion', filterSet: 'womensWestern', keywords: ['western', 'western wear'] },
      { slug: 'tops', name: 'Tops', title: "Wholesale Women's Tops", description: 'Casual, office and party tops in bulk.', blurb: 'Casual, office & party tops', filterSet: 'womensWestern', keywords: ['top', 'tops', 'blouse top'] },
      { slug: 'shirts', name: "Women's Shirts", title: "Wholesale Women's Shirts", description: 'Casual and formal shirts for women.', filterSet: 'womensWestern', keywords: ['womens shirt', 'ladies shirt'] },
      { slug: 't-shirts', name: "Women's T-Shirts", title: "Wholesale Women's T-Shirts", description: 'Round neck, crop and printed t-shirts for women.', filterSet: 'womensWestern', keywords: ['womens t-shirt', 'ladies tshirt'] },
      { slug: 'dresses', name: 'Dresses', description: 'Midi, maxi and everyday dresses for retail.', blurb: 'Midi, maxi & day dresses', filterSet: 'womensWestern', keywords: ['dress', 'frock', 'maxi', 'midi'] },
      {
        slug: 'skirts', name: 'Skirts', description: 'Ethnic and western skirts across lengths.', blurb: 'Long, midi, maxi & short', filterSet: 'womensWestern', keywords: ['skirt'],
        children: [
          { slug: 'long-skirts', name: 'Long Skirts', description: 'Ankle-length ethnic and western skirts.', filterSet: 'womensWestern', keywords: ['long skirt', 'ghagra skirt'] },
          { slug: 'short-skirts', name: 'Short Skirts', description: 'Mini and above-knee skirts.', filterSet: 'womensWestern', keywords: ['short skirt', 'mini skirt'] },
          { slug: 'maxi-skirts', name: 'Maxi Skirts', description: 'Flowing floor-length maxi skirts.', filterSet: 'womensWestern', keywords: ['maxi skirt'] },
          { slug: 'midi-skirts', name: 'Midi Skirts', description: 'Calf-length midi skirts.', filterSet: 'womensWestern', keywords: ['midi skirt', 'pleated skirt'] },
        ],
      },
      { slug: 'jeans', name: "Women's Jeans", title: "Wholesale Women's Jeans", description: 'Skinny, straight and wide-leg jeans for women.', filterSet: 'womensWestern', keywords: ['womens jeans', 'ladies jeans', 'denim'] },
      { slug: 'trousers', name: "Women's Trousers", title: "Wholesale Women's Trousers", description: 'Formal trousers, cigarette pants and joggers.', filterSet: 'womensWestern', keywords: ['womens trousers', 'ladies pants', 'cigarette pants'] },
      { slug: 'palazzos', name: 'Palazzos', description: 'Palazzos and wide-leg pants to pair with kurtis.', filterSet: 'basics', keywords: ['palazzo', 'pants'] },
      { slug: 'leggings', name: 'Leggings', description: 'Cotton and lycra leggings and churidar leggings.', filterSet: 'basics', keywords: ['legging', 'leggings', 'churidar'] },
      { slug: 'jeggings', name: 'Jeggings', description: 'Denim-look stretch jeggings.', filterSet: 'basics', keywords: ['jeggings', 'jegging'] },
      { slug: 'blouses', name: 'Blouses', description: 'Readymade saree blouses and blouse pieces.', blurb: 'Readymade & designer blouses', filterSet: 'blouse', keywords: ['blouse', 'saree blouse'] },
      { slug: 'ethnic-sets', name: 'Ethnic Wear', title: "Wholesale Women's Ethnic Wear", description: 'Coordinated ethnic sets and traditional wear ready for retail.', filterSet: 'ethnicSet', keywords: ['ethnic wear', 'ethnic set', 'ethnic'] },
      { slug: 'co-ord-sets', name: 'Co-ord Sets', description: 'Matching co-ord sets in ethnic and western styles.', blurb: 'Matching ethnic & western sets', filterSet: 'womensWestern', keywords: ['co-ord', 'coord', 'co ord'] },
      { slug: 'nightwear', name: "Women's Nightwear", title: "Wholesale Women's Nightwear", description: 'Night suits, nighties and nightgowns.', filterSet: 'basics', keywords: ['nightwear', 'nighty', 'night suit'] },
      { slug: 'loungewear', name: "Women's Loungewear", title: "Wholesale Women's Loungewear", description: 'Lounge sets, joggers and relaxed home wear.', filterSet: 'basics', keywords: ['loungewear', 'lounge set', 'co-ord lounge'] },
      {
        slug: 'innerwear', name: "Women's Innerwear", title: "Wholesale Women's Innerwear", description: 'Everyday innerwear essentials for women.', blurb: 'Bras, panties, slips & more', filterSet: 'innerwear', keywords: ['innerwear', 'lingerie', 'undergarments'],
        children: [
          { slug: 'bras', name: 'Bras', title: 'Wholesale Bras', description: 'T-shirt, sports and everyday bras.', filterSet: 'innerwear', keywords: ['bra', 'bras', 'sports bra'] },
          { slug: 'panties', name: 'Panties', title: 'Wholesale Panties', description: 'Hipster, bikini and boyshort panties.', filterSet: 'innerwear', keywords: ['panty', 'panties', 'briefs women'] },
          { slug: 'shapewear', name: 'Shapewear', description: 'Tummy tuckers, body shapers and shaping slips.', filterSet: 'innerwear', keywords: ['shapewear', 'body shaper', 'tummy tucker'] },
          { slug: 'slips', name: 'Slips', description: 'Full and half slips, including saree petticoat slips.', filterSet: 'innerwear', keywords: ['slip', 'half slip', 'petticoat'] },
          { slug: 'camisoles', name: 'Camisoles', description: 'Camisoles and spaghetti innerwear tops.', filterSet: 'innerwear', keywords: ['camisole', 'cami', 'spaghetti'] },
        ],
      },
      { slug: 'thermal-wear', name: "Women's Thermal Wear", title: "Wholesale Women's Thermal Wear", description: 'Thermal tops, bottoms and sets for winter.', filterSet: 'innerwear', keywords: ['thermal', 'thermals', 'winter innerwear'] },
      { slug: 'maternity-wear', name: 'Maternity Wear', description: 'Maternity and feeding kurtis, dresses and nightwear.', filterSet: 'womensWestern', keywords: ['maternity', 'feeding kurti', 'pregnancy'] },
      { slug: 'sportswear', name: "Women's Sportswear", title: "Wholesale Women's Sportswear", description: 'Track pants, leggings, sports bras and active tees.', filterSet: 'womensWestern', keywords: ['sportswear', 'activewear', 'gym wear', 'yoga pants'] },
    ],
  },
  {
    slug: 'mens-wear',
    name: "Men's Wear",
    description: 'Shirts, t-shirts, ethnic wear, jeans and formal wear for menswear retailers.',
    filterSet: 'mens',
    keywords: ['men', 'mens', 'gents'],
    children: [
      { slug: 'shirts', name: 'Shirts', title: "Wholesale Men's Shirts", description: 'Formal, casual and party shirts in bulk.', blurb: 'Formal, casual & party shirts', filterSet: 'mens', keywords: ['shirt', 'shirts', 'formal shirt'] },
      {
        slug: 't-shirts', name: 'T-Shirts', title: "Wholesale Men's T-Shirts", description: 'Round neck, polo and oversized t-shirts.', blurb: 'Round neck, polo & oversized', filterSet: 'mens', keywords: ['t-shirt', 'tshirt', 'tee'],
        children: [{ slug: 'polo-t-shirts', name: 'Polo T-Shirts', title: "Wholesale Men's Polo T-Shirts", description: 'Collared polo t-shirts in cotton and blends.', filterSet: 'mens', keywords: ['polo', 'polo t-shirt', 'collar t-shirt'] }],
      },
      { slug: 'formal-wear', name: 'Formal Wear', title: "Wholesale Men's Formal Wear", description: 'Suits, blazers and formal separates.', blurb: 'Suits, blazers & trousers', filterSet: 'mens', keywords: ['formal', 'suit', 'blazer'] },
      { slug: 'casual-wear', name: 'Casual Wear', title: "Wholesale Men's Casual Wear", description: 'Everyday casual menswear.', blurb: 'Everyday menswear', filterSet: 'mens', keywords: ['casual'] },
      { slug: 'jeans', name: 'Jeans', title: "Wholesale Men's Jeans", description: 'Denim jeans across fits and washes.', blurb: 'Slim, regular & relaxed fits', filterSet: 'mens', keywords: ['jeans', 'denim'] },
      { slug: 'trousers', name: 'Trousers', title: "Wholesale Men's Trousers", description: 'Formal trousers and chinos.', blurb: 'Formal trousers & chinos', filterSet: 'mens', keywords: ['trouser', 'pant', 'chinos'] },
      { slug: 'shorts', name: 'Shorts', title: "Wholesale Men's Shorts", description: 'Casual and sports shorts.', filterSet: 'mens', keywords: ['shorts', 'bermuda'] },
      { slug: 'ethnic-wear', name: 'Ethnic Wear', title: "Wholesale Men's Ethnic Wear", description: 'Kurta sets, Nehru jackets and festive menswear.', blurb: 'Kurta sets & festive wear', filterSet: 'mensEthnic', keywords: ['ethnic', 'nehru jacket', 'pathani'] },
      { slug: 'kurtas', name: 'Kurtas', title: "Wholesale Men's Kurtas", description: 'Cotton, linen and festive kurtas for men.', blurb: 'Cotton, linen & festive kurtas', filterSet: 'mensEthnic', keywords: ['kurta', 'mens kurta'] },
      { slug: 'sherwanis', name: 'Sherwanis', description: 'Wedding and occasion sherwanis.', blurb: 'Wedding & occasion sherwanis', filterSet: 'mensEthnic', keywords: ['sherwani', 'groom'] },
      { slug: 'jackets', name: 'Jackets', title: "Wholesale Men's Jackets", description: 'Denim, bomber, puffer and casual jackets.', filterSet: 'mens', keywords: ['jacket', 'bomber', 'puffer'] },
      { slug: 'sweatshirts', name: 'Sweatshirts', title: "Wholesale Men's Sweatshirts", description: 'Sweatshirts and hoodies.', filterSet: 'mens', keywords: ['sweatshirt', 'hoodie'] },
      { slug: 'co-ord-sets', name: "Men's Co-ord Sets", title: "Wholesale Men's Co-ord Sets", description: 'Matching shirt and shorts or trouser sets.', filterSet: 'mens', keywords: ['co-ord', 'coord'] },
      {
        slug: 'innerwear', name: "Men's Innerwear", title: "Wholesale Men's Innerwear", description: 'Vests, briefs, trunks and boxers.', blurb: 'Vests, briefs & boxers', filterSet: 'innerwear', keywords: ['innerwear', 'undergarments'],
        children: [
          { slug: 'vests', name: 'Vests', title: "Wholesale Men's Vests", description: 'Sleeveless and sleeved cotton vests.', filterSet: 'innerwear', keywords: ['vest', 'banian', 'baniyan'] },
          { slug: 'briefs', name: 'Briefs', title: "Wholesale Men's Briefs", description: 'Briefs and trunks.', filterSet: 'innerwear', keywords: ['brief', 'briefs', 'trunk', 'trunks'] },
          { slug: 'boxers', name: 'Boxers', title: "Wholesale Men's Boxers", description: 'Woven and knit boxer shorts.', filterSet: 'innerwear', keywords: ['boxer', 'boxers', 'boxer shorts'] },
        ],
      },
      { slug: 'thermal-wear', name: "Men's Thermal Wear", title: "Wholesale Men's Thermal Wear", description: 'Thermal tops, bottoms and sets for winter.', filterSet: 'innerwear', keywords: ['thermal', 'thermals', 'winter innerwear'] },
      { slug: 'nightwear', name: "Men's Nightwear", title: "Wholesale Men's Nightwear", description: 'Pyjamas, night suits and loungewear.', filterSet: 'basics', keywords: ['nightwear', 'pyjama', 'pajama'] },
      { slug: 'sportswear', name: 'Sportswear', title: "Wholesale Men's Sportswear", description: 'Track pants, joggers and active tees.', filterSet: 'mens', keywords: ['sportswear', 'track pant', 'joggers', 'activewear'] },
    ],
  },
  {
    slug: 'kids-wear',
    name: "Kids' Wear",
    description: 'Clothing for babies, girls and boys — ethnic, western, party and school wear.',
    filterSet: 'kids',
    keywords: ['kids', 'children', 'child', 'baby'],
    children: [
      { slug: 'girls-clothing', name: "Girls' Clothing", description: 'Frocks, tops and sets for girls.', blurb: 'Frocks, tops & sets', filterSet: 'kids', keywords: ['girls', 'frock'] },
      { slug: 'boys-clothing', name: "Boys' Clothing", description: 'Shirts, t-shirts and sets for boys.', blurb: 'Shirts, tees & sets', filterSet: 'kids', keywords: ['boys'] },
      { slug: 'baby-clothing', name: 'Baby Clothing', description: 'Rompers, onesies and essentials for babies.', blurb: 'Rompers, onesies & essentials', filterSet: 'kids', keywords: ['baby', 'infant', 'romper', 'onesie'] },
      { slug: 'ethnic-wear', name: "Kids' Ethnic Wear", title: "Wholesale Kids' Ethnic Wear", description: 'Pavadai, lehenga cholis and kurta pyjamas for kids.', blurb: 'Pavadai, lehengas & kurta sets', filterSet: 'kids', keywords: ['kids ethnic', 'pavadai', 'kurta pyjama'] },
      { slug: 'western-wear', name: "Kids' Western Wear", title: "Wholesale Kids' Western Wear", description: 'Everyday western wear for kids.', blurb: 'Everyday western styles', filterSet: 'kids', keywords: ['kids western'] },
      { slug: 'dresses', name: "Kids' Dresses", title: "Wholesale Kids' Dresses", description: 'Frocks and dresses for girls.', blurb: 'Frocks & party dresses', filterSet: 'kids', keywords: ['kids dress', 'frock', 'girls dress'] },
      { slug: 't-shirts', name: "Kids' T-Shirts", title: "Wholesale Kids' T-Shirts", description: 'Printed and plain t-shirts for kids.', filterSet: 'kids', keywords: ['kids t-shirt', 'kids tshirt'] },
      { slug: 'shirts', name: "Kids' Shirts", title: "Wholesale Kids' Shirts", description: 'Casual and party shirts for boys.', filterSet: 'kids', keywords: ['kids shirt', 'boys shirt'] },
      { slug: 'bottomwear', name: "Kids' Bottomwear", title: "Wholesale Kids' Bottomwear", description: 'Jeans, shorts, track pants and leggings for kids.', filterSet: 'kids', keywords: ['kids jeans', 'kids shorts', 'kids pants', 'bottomwear'] },
      { slug: 'school-uniforms', name: 'School Wear', title: 'Wholesale School Wear & Uniforms', description: 'Uniform shirts, skirts, trousers and pinafores.', blurb: 'Shirts, skirts & pinafores', filterSet: 'kids', keywords: ['uniform', 'school', 'school wear'] },
      { slug: 'nightwear', name: "Kids' Nightwear", title: "Wholesale Kids' Nightwear", description: 'Night suits and sleepwear for kids.', filterSet: 'kids', keywords: ['kids nightwear'] },
      { slug: 'innerwear', name: "Kids' Innerwear", title: "Wholesale Kids' Innerwear", description: 'Vests, briefs, panties and slips for kids.', filterSet: 'kids', keywords: ['kids innerwear', 'kids vest', 'kids brief'] },
      { slug: 'party-wear', name: "Kids' Party Wear", title: "Wholesale Kids' Party Wear", description: 'Party dresses and festive outfits.', filterSet: 'kids', keywords: ['party wear', 'party dress'] },
    ],
  },
  {
    slug: 'footwear',
    name: 'Footwear',
    description: 'Ethnic, casual, formal and sports footwear for men, women and kids.',
    filterSet: 'footwear',
    keywords: ['footwear', 'shoes', 'chappal'],
    children: [
      { slug: 'womens-footwear', name: "Women's Footwear", description: 'Heels, flats, juttis and sandals for women.', blurb: 'Heels, flats & juttis', filterSet: 'footwear', keywords: ['ladies footwear', 'heels'] },
      { slug: 'mens-footwear', name: "Men's Footwear", description: 'Formal, casual and ethnic footwear for men.', blurb: 'Formal, casual & ethnic', filterSet: 'footwear', keywords: ['mens footwear', 'gents shoes'] },
      { slug: 'kids-footwear', name: "Kids' Footwear", description: 'School shoes, sandals and casual footwear for kids.', filterSet: 'footwear', keywords: ['kids shoes'] },
      { slug: 'sandals', name: 'Sandals', description: 'Everyday and occasion sandals.', blurb: 'Everyday & occasion sandals', filterSet: 'footwear', keywords: ['sandal', 'sandals'] },
      { slug: 'slippers', name: 'Slippers', description: 'Slippers, slides and flip-flops.', blurb: 'Slides & flip-flops', filterSet: 'footwear', keywords: ['slipper', 'chappal', 'flip flop', 'slides'] },
      { slug: 'casual-shoes', name: 'Casual Shoes', description: 'Sneakers, loafers and casual shoes.', blurb: 'Sneakers & loafers', filterSet: 'footwear', keywords: ['sneakers', 'casual shoes', 'loafers'] },
      { slug: 'formal-shoes', name: 'Formal Shoes', description: 'Leather and synthetic formal shoes.', blurb: 'Oxfords, derbies & more', filterSet: 'footwear', keywords: ['formal shoes', 'oxford'] },
      { slug: 'sports-shoes', name: 'Sports Shoes', description: 'Running, training and sports shoes.', blurb: 'Running & training shoes', filterSet: 'footwear', keywords: ['sports shoes', 'running shoes'] },
      { slug: 'ethnic-footwear', name: 'Ethnic Footwear', description: 'Juttis, mojaris and Kolhapuris.', blurb: 'Juttis, mojaris & Kolhapuris', filterSet: 'footwear', keywords: ['jutti', 'mojari', 'kolhapuri', 'ethnic footwear'] },
    ],
  },
  {
    slug: 'fabrics',
    name: 'Fabrics & Textiles',
    title: 'Wholesale Fabrics & Textiles',
    description: 'Cotton, silk, linen, printed and embroidered fabrics by the metre or bolt.',
    filterSet: 'fabric',
    keywords: ['fabric', 'textile', 'cloth', 'material'],
    children: [
      { slug: 'cotton-fabrics', name: 'Cotton Fabric', description: 'Plain, printed and handloom cotton fabrics.', blurb: 'Plain, printed & handloom', filterSet: 'fabric', keywords: ['cotton fabric', 'cotton'] },
      { slug: 'silk-fabrics', name: 'Silk Fabric', description: 'Pure and art silk fabrics.', blurb: 'Pure & art silks', filterSet: 'fabric', keywords: ['silk fabric', 'silk'] },
      { slug: 'linen', name: 'Linen Fabric', title: 'Wholesale Linen Fabrics', description: 'Linen and linen-blend fabrics.', filterSet: 'fabric', keywords: ['linen'] },
      { slug: 'polyester', name: 'Polyester Fabric', title: 'Wholesale Polyester Fabrics', description: 'Polyester and poly-blend fabrics.', filterSet: 'fabric', keywords: ['polyester', 'poly'] },
      { slug: 'rayon', name: 'Rayon Fabric', title: 'Wholesale Rayon Fabrics', description: 'Rayon and viscose fabrics, plain and printed.', filterSet: 'fabric', keywords: ['rayon', 'viscose'] },
      { slug: 'printed-fabrics', name: 'Printed Fabric', description: 'Block, screen and digital printed fabrics.', blurb: 'Block, screen & digital prints', filterSet: 'fabric', keywords: ['printed fabric', 'print'] },
      { slug: 'embroidered-fabrics', name: 'Embroidered Fabric', description: 'Embroidered and embellished fabrics.', blurb: 'Thread, zari & sequin work', filterSet: 'fabric', keywords: ['embroidered fabric', 'embroidery'] },
      { slug: 'dress-materials', name: 'Dress Material', title: 'Wholesale Dress Material Fabrics', description: 'Suit and dress material fabric sets.', filterSet: 'dressMaterial', keywords: ['dress material'] },
      { slug: 'suiting', name: 'Suiting', title: 'Wholesale Suiting Fabrics', description: 'Suiting fabrics for trousers, suits and blazers.', filterSet: 'fabric', keywords: ['suiting', 'suit fabric', 'trouser fabric'] },
      { slug: 'shirting', name: 'Shirting', title: 'Wholesale Shirting Fabrics', description: 'Cotton and blended shirting fabrics.', filterSet: 'fabric', keywords: ['shirting', 'shirt fabric'] },
      { slug: 'denim', name: 'Denim', title: 'Wholesale Denim Fabric', description: 'Denim fabric in weights and washes.', filterSet: 'fabric', keywords: ['denim', 'denim fabric', 'jeans fabric'] },
      { slug: 'fabric-rolls', name: 'Wholesale Fabric Rolls', title: 'Wholesale Fabric Rolls & Thans', description: 'Full rolls, thans and bolts sold in bulk.', filterSet: 'fabric', keywords: ['fabric roll', 'than', 'bolt', 'fabric rolls'] },
      { slug: 'textile-accessories', name: 'Textile Accessories', description: 'Laces, borders, threads, buttons and trims.', blurb: 'Laces, borders & trims', filterSet: 'textileAccessory', keywords: ['lace', 'border', 'trims', 'buttons', 'thread'] },
    ],
  },
  {
    slug: 'accessories',
    name: 'Accessories',
    description: 'Bags, belts, scarves, stoles and fashion accessories.',
    filterSet: 'accessories',
    keywords: ['accessories', 'accessory'],
    children: [
      { slug: 'bags', name: 'Bags', description: 'Handbags, totes, slings and potlis.', blurb: 'Handbags, totes & potlis', filterSet: 'accessories', keywords: ['bag', 'handbag', 'purse', 'potli', 'clutch'] },
      { slug: 'belts', name: 'Belts', description: 'Leather and fashion belts.', blurb: 'Leather & fashion belts', filterSet: 'accessories', keywords: ['belt'] },
      { slug: 'scarves', name: 'Scarves', description: 'Printed and woven scarves.', blurb: 'Printed & woven scarves', filterSet: 'accessories', keywords: ['scarf', 'scarves'] },
      { slug: 'stoles', name: 'Stoles', description: 'Stoles and shawls in every fabric.', blurb: 'Stoles & shawls', filterSet: 'accessories', keywords: ['stole', 'shawl'] },
      { slug: 'caps', name: 'Caps', description: 'Baseball caps, hats and winter caps.', filterSet: 'accessories', keywords: ['cap', 'caps', 'hat'] },
      { slug: 'socks', name: 'Socks', description: 'Ankle, crew and formal socks in multipacks.', filterSet: 'accessories', keywords: ['socks', 'sock'] },
      { slug: 'fashion-accessories', name: 'Fashion Accessories', description: 'Jewellery, hair accessories and more.', blurb: 'Jewellery & hair accessories', filterSet: 'accessories', keywords: ['jewellery', 'jewelry', 'hair accessories'] },
    ],
  },
];

function flatten(nodes: CategoryNode[], parent: FlatCategory | null, out: FlatCategory[]): void {
  for (const node of nodes) {
    const path = parent ? `${parent.path}/${node.slug}` : node.slug;
    const { children, ...rest } = node;
    const flat: FlatCategory = {
      ...rest,
      title: node.title ?? `Wholesale ${node.name}`,
      path,
      parentPath: parent?.path ?? null,
      depth: parent ? parent.depth + 1 : 0,
      rootSlug: parent ? parent.rootSlug : node.slug,
      childPaths: (children ?? []).map((c) => `${path}/${c.slug}`),
      trail: [...(parent?.trail ?? []), { name: node.name, path }],
    };
    out.push(flat);
    if (children) flatten(children, flat, out);
  }
}

export const FLAT_CATEGORIES: FlatCategory[] = (() => {
  const out: FlatCategory[] = [];
  flatten(TAXONOMY, null, out);
  return out;
})();

const BY_PATH = new Map(FLAT_CATEGORIES.map((c) => [c.path, c]));

export function getCategory(path: string): FlatCategory | undefined {
  return BY_PATH.get(path.replace(/^\/+|\/+$/g, ''));
}

export function getChildren(path: string): FlatCategory[] {
  const cat = getCategory(path);
  return cat ? cat.childPaths.map((p) => BY_PATH.get(p)!).filter(Boolean) : [];
}

export const ROOT_CATEGORIES: FlatCategory[] = FLAT_CATEGORIES.filter((c) => c.depth === 0);

/** Every path at or below `path` — used to include subcategory listings in a parent page. */
export function getDescendantPaths(path: string): string[] {
  const prefix = `${path}/`;
  return FLAT_CATEGORIES.filter((c) => c.path === path || c.path.startsWith(prefix)).map((c) => c.path);
}

export interface TaxonomySuggestion {
  path: string;
  name: string;
  parentName: string | null;
  score: number;
}

const normalise = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[’'`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Category suggestions for the global search box — taxonomy only, never products. */
export function searchTaxonomy(query: string, limit = 8): TaxonomySuggestion[] {
  const q = normalise(query);
  if (!q) return [];
  const terms = q.split(' ');
  const results: TaxonomySuggestion[] = [];
  for (const c of FLAT_CATEGORIES) {
    const name = normalise(c.name);
    const keywords = (c.keywords ?? []).map(normalise);
    let score = 0;
    if (name === q || keywords.includes(q)) score = 100;
    else if (name.startsWith(q) || keywords.some((k) => k.startsWith(q))) score = 80;
    else if (terms.every((t) => name.includes(t) || keywords.some((k) => k.includes(t)))) score = 60;
    else if (normalise(c.description).includes(q)) score = 20;
    if (score > 0) {
      // Prefer leaf categories for specific queries, and women's wear (launch priority) on ties.
      score += c.depth === 0 ? 0 : 5;
      if (c.rootSlug === 'womens-wear') score += 2;
      const parent = c.parentPath ? BY_PATH.get(c.parentPath) : undefined;
      results.push({ path: c.path, name: c.name, parentName: parent?.name ?? null, score });
    }
  }
  return results.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit);
}
