# Category image audit

Generated 2026-11-02 by `node scripts/category-image-audit.mjs` from the live category table.

Category photos are **illustrative** (licensed stock photography, labelled as such on the site). They are never shown as a supplier's product. Supplier listings only ever show photos the supplier uploaded.

| | Count |
|---|---|
| Categories in the database | 112 |
| With a licensed illustrative photo | 67 |
| Using the neutral placeholder (no suitable photo yet) | 45 |
| …of which low resolution (under 600px wide, should be replaced with a full-size download) | 5 |
| Broken (missing file or missing licence record) | 0 |

All photos are free under the [Unsplash License](https://unsplash.com/license); each one's photographer and source page are listed below and in `client/src/data/image-credits.json`.

No broken images: every mapped photo exists on disk and has its licence/attribution recorded.

## Photos shared by more than one category

Reused only where the photo genuinely shows the subcategory.

- `categories/fabrics` → fabrics, fabrics/fabric-rolls
- `promo/dress-materials` → fabrics/dress-materials, womens-wear/dress-materials
- `categories/girls-clothing` → kids-wear/dresses, kids-wear/girls-clothing, kids-wear/party-wear
- `categories/mens-jeans` → mens-wear/jeans, womens-wear/jeans
- `categories/mens-t-shirts` → mens-wear/t-shirts, womens-wear/t-shirts
- `categories/ethnic-sets` → womens-wear/ethnic-sets, womens-wear/kurta-sets
- `categories/sarees` → womens-wear/sarees, womens-wear/sarees/silk-sarees

## Categories still needing a photo

These use the neutral Dhaaga Bazaar placeholder instead of an unrelated or unsuitable photo. **Blocked on:** an official image-API key (`UNSPLASH_ACCESS_KEY` for the Unsplash API, or `PEXELS_API_KEY` for the Pexels API) or photos supplied by the business. Automated searching of the Unsplash website is not permitted in this environment, and Wikimedia Commons results for these garments were museum pieces, branded goods or unsuitable innerwear imagery.

-   Caps (`accessories/caps`)
-   Socks (`accessories/socks`)
-   Denim (`fabrics/denim`)
-   Linen Fabric (`fabrics/linen`)
-   Polyester Fabric (`fabrics/polyester`)
-   Rayon Fabric (`fabrics/rayon`)
-   Shirting (`fabrics/shirting`)
-   Suiting (`fabrics/suiting`)
-   Kids' Footwear (`footwear/kids-footwear`)
-   Kids' Bottomwear (`kids-wear/bottomwear`)
-   Kids' Innerwear (`kids-wear/innerwear`)
-   Kids' Nightwear (`kids-wear/nightwear`)
-   Kids' Shirts (`kids-wear/shirts`)
-   Men's Co-ord Sets (`mens-wear/co-ord-sets`)
-   Men's Innerwear (`mens-wear/innerwear`)
-     Boxers (`mens-wear/innerwear/boxers`)
-     Briefs (`mens-wear/innerwear/briefs`)
-     Vests (`mens-wear/innerwear/vests`)
-   Jackets (`mens-wear/jackets`)
-   Men's Nightwear (`mens-wear/nightwear`)
-   Shorts (`mens-wear/shorts`)
-   Sportswear (`mens-wear/sportswear`)
-   Sweatshirts (`mens-wear/sweatshirts`)
-   Men's Thermal Wear (`mens-wear/thermal-wear`)
-   Anarkali Suits (`womens-wear/anarkali-suits`)
-   Women's Innerwear (`womens-wear/innerwear`)
-     Bras (`womens-wear/innerwear/bras`)
-     Camisoles (`womens-wear/innerwear/camisoles`)
-     Panties (`womens-wear/innerwear/panties`)
-     Shapewear (`womens-wear/innerwear/shapewear`)
-     Slips (`womens-wear/innerwear/slips`)
-   Jeggings (`womens-wear/jeggings`)
-   Leggings (`womens-wear/leggings`)
-   Women's Loungewear (`womens-wear/loungewear`)
-   Maternity Wear (`womens-wear/maternity-wear`)
-   Women's Nightwear (`womens-wear/nightwear`)
-   Women's Shirts (`womens-wear/shirts`)
-   Skirts (`womens-wear/skirts`)
-     Long Skirts (`womens-wear/skirts/long-skirts`)
-     Maxi Skirts (`womens-wear/skirts/maxi-skirts`)
-     Midi Skirts (`womens-wear/skirts/midi-skirts`)
-     Short Skirts (`womens-wear/skirts/short-skirts`)
-   Women's Sportswear (`womens-wear/sportswear`)
-   Women's Thermal Wear (`womens-wear/thermal-wear`)
-   Women's Trousers (`womens-wear/trousers`)

## All categories

| Category | Path | Status | Photo |
|---|---|---|---|
| Accessories | `accessories` | photo | Brown leather tote handbag — Ugluk Potroshitel (Unsplash License) |
| — Bags | `accessories/bags` | photo | Brown leather satchel bag — Alvaro Serrano (Unsplash License) |
| — Belts | `accessories/belts` | photo | Brown braided leather belts — saeed karimi (Unsplash License) |
| — Caps | `accessories/caps` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — Fashion Accessories | `accessories/fashion-accessories` | photo | Gold and silver beaded bracelets — Urvi Kotasthane (Unsplash License) |
| — Scarves | `accessories/scarves` | photo | Multi-coloured printed scarves — Siora Photography (Unsplash License) |
| — Socks | `accessories/socks` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — Stoles | `accessories/stoles` | photo | Colourful stoles hanging on a rack — Bernd Dittrich (Unsplash License) |
| Fabrics & Textiles | `fabrics` | photo | Shelves of colourful patterned fabric rolls — Bernd Dittrich (Unsplash License) |
| — Cotton Fabric | `fabrics/cotton-fabrics` | photo | Stacks of folded red and orange fabric — Declan Sun (Unsplash License) |
| — Denim | `fabrics/denim` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — Dress Material | `fabrics/dress-materials` | photo | Embroidered dress material fabrics with tassels — Jainica Dhingra (Unsplash License) |
| — Embroidered Fabric | `fabrics/embroidered-fabrics` | photo | Fabrics with intricate floral embroidery — Richard Williams (Unsplash License) |
| — Wholesale Fabric Rolls | `fabrics/fabric-rolls` | photo | Shelves of colourful patterned fabric rolls — Bernd Dittrich (Unsplash License) |
| — Linen Fabric | `fabrics/linen` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — Polyester Fabric | `fabrics/polyester` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — Printed Fabric | `fabrics/printed-fabrics` | photo | Hanging strips of printed fabrics — Richard Williams (Unsplash License) |
| — Rayon Fabric | `fabrics/rayon` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — Shirting | `fabrics/shirting` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — Silk Fabric | `fabrics/silk-fabrics` | photo | Teal silk fabric close-up — Jatin Gajjar (Unsplash License) |
| — Suiting | `fabrics/suiting` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — Textile Accessories | `fabrics/textile-accessories` | photo | Rows of thread spools in many colours — Vishal Banik (Unsplash License) |
| Footwear | `footwear` | photo | Pair of embroidered leather juttis — Farhan Chohan (Unsplash License) |
| — Casual Shoes | `footwear/casual-shoes` | photo | White sneakers — Sanju Pandita (Unsplash License) |
| — Ethnic Footwear | `footwear/ethnic-footwear` | photo | Red embroidered juttis with gold accents — Farhan Chohan (Unsplash License) |
| — Formal Shoes | `footwear/formal-shoes` | photo | Brown leather formal shoes — rupixen (Unsplash License) |
| — Kids' Footwear | `footwear/kids-footwear` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — Men's Footwear | `footwear/mens-footwear` | photo | Brown leather lace-up brogues — Monaal Garg (Unsplash License) |
| — Sandals | `footwear/sandals` | photo | Black and brown leather sandals — Kushagrta Roy (Unsplash License) |
| — Slippers | `footwear/slippers` | photo | Rows of decorative slippers on shelves — WyteShot (Unsplash License) |
| — Sports Shoes | `footwear/sports-shoes` | photo | Athletic sports shoes — Irene Kredenets (Unsplash License) |
| — Women's Footwear | `footwear/womens-footwear` | photo | Embellished open-toe sandals — Shahzad Faisal (Unsplash License) |
| Kids' Wear | `kids-wear` | photo | Young girl in a traditional silk pavadai holding a basket of flowers — Jithin Murali (Unsplash License) |
| — Baby Clothing | `kids-wear/baby-clothing` | photo | Baby clothes hanging on a rack — jackson kondili (Unsplash License) |
| — Kids' Bottomwear | `kids-wear/bottomwear` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — Boys' Clothing | `kids-wear/boys-clothing` | photo | Young boy in a cardigan, shirt and blue shorts — Terricks Noah (Unsplash License) |
| — Kids' Dresses | `kids-wear/dresses` | photo | Young girl in a blue tulle party dress — Modupe Falade (Unsplash License) |
| — Kids' Ethnic Wear | `kids-wear/ethnic-wear` | photo | Two young girls in traditional Indian clothing — Joydeep Sensarma (Unsplash License) |
| — Girls' Clothing | `kids-wear/girls-clothing` | photo | Young girl in a blue tulle party dress — Modupe Falade (Unsplash License) |
| — Kids' Innerwear | `kids-wear/innerwear` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — Kids' Nightwear | `kids-wear/nightwear` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — Kids' Party Wear | `kids-wear/party-wear` | photo | Young girl in a blue tulle party dress — Modupe Falade (Unsplash License) |
| — School Wear | `kids-wear/school-uniforms` | photo | Schoolgirl in uniform with classmates — Raj Rana (Unsplash License) |
| — Kids' Shirts | `kids-wear/shirts` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — Kids' T-Shirts | `kids-wear/t-shirts` | photo (low-res) | Small white children's t-shirt, flat lay — Mediamodifier (Unsplash License) |
| — Kids' Western Wear | `kids-wear/western-wear` | photo | Children's clothing displayed in a store — Zayed Ahmed Zadu (Unsplash License) |
| Men's Wear | `mens-wear` | photo | Man wearing a light green printed kurta — Firangi Yarn Menswear Brand (Unsplash License) |
| — Casual Wear | `mens-wear/casual-wear` | photo | Young man in a patterned shirt and grey trousers — Deepak Singh (Unsplash License) |
| — Men's Co-ord Sets | `mens-wear/co-ord-sets` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — Ethnic Wear | `mens-wear/ethnic-wear` | photo | Man in a blue kurta pyjama set — Noor Alam (Unsplash License) |
| — Formal Wear | `mens-wear/formal-wear` | photo | Man in a navy blue suit — Mohamad Khosravi (Unsplash License) |
| — Men's Innerwear | `mens-wear/innerwear` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — — Boxers | `mens-wear/innerwear/boxers` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — — Briefs | `mens-wear/innerwear/briefs` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — — Vests | `mens-wear/innerwear/vests` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — Jackets | `mens-wear/jackets` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — Jeans | `mens-wear/jeans` | photo | Stacks of folded denim jeans — Waldemar Brandt (Unsplash License) |
| — Kurtas | `mens-wear/kurtas` | photo | Man in a pale yellow kurta — Abhishek Rai (Unsplash License) |
| — Men's Nightwear | `mens-wear/nightwear` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — Sherwanis | `mens-wear/sherwanis` | photo | White embroidered sherwani with red safa and stole — Royal Photography (Unsplash License) |
| — Shirts | `mens-wear/shirts` | photo | Folded checked cotton shirts — farhad chaudhary (Unsplash License) |
| — Shorts | `mens-wear/shorts` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — Sportswear | `mens-wear/sportswear` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — Sweatshirts | `mens-wear/sweatshirts` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — T-Shirts | `mens-wear/t-shirts` | photo | Folded plain t-shirts in assorted colours — Md Salman (Unsplash License) |
| — — Polo T-Shirts | `mens-wear/t-shirts/polo-t-shirts` | photo (low-res) | Folded polo shirts in assorted colours, flat lay — Lena Kudryavtseva (Unsplash License) |
| — Men's Thermal Wear | `mens-wear/thermal-wear` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — Trousers | `mens-wear/trousers` | photo | Man in a white shirt and grey trousers — Marius Muresan (Unsplash License) |
| Women's Wear | `womens-wear` | photo | Woman in a pink and orange silk saree with gold jewellery — Sabesh Photography LTD (Unsplash License) |
| — Anarkali Suits | `womens-wear/anarkali-suits` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — Blouses | `womens-wear/blouses` | photo | Red saree blouse with tie-back detail — Uday Ahir (Unsplash License) |
| — Co-ord Sets | `womens-wear/co-ord-sets` | photo | Woman in a pink floral co-ord set — IMANA (Unsplash License) |
| — Dress Materials | `womens-wear/dress-materials` | photo | Embroidered dress material fabrics with tassels — Jainica Dhingra (Unsplash License) |
| — Dresses | `womens-wear/dresses` | photo | Mustard sleeveless shirt dress — engin akyurt (Unsplash License) |
| — Dupattas | `womens-wear/dupattas` | photo | Woman wearing a long embroidered dupatta — Muneeb Malhotra (Unsplash License) |
| — Ethnic Wear | `womens-wear/ethnic-sets` | photo | Woman in a pink floral kurta and pants set — Shahenaz India (Unsplash License) |
| — Gowns | `womens-wear/gowns` | photo | Woman in a golden gown with floral embroidery — iKshana Productions (Unsplash License) |
| — Women's Innerwear | `womens-wear/innerwear` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — — Bras | `womens-wear/innerwear/bras` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — — Camisoles | `womens-wear/innerwear/camisoles` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — — Panties | `womens-wear/innerwear/panties` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — — Shapewear | `womens-wear/innerwear/shapewear` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — — Slips | `womens-wear/innerwear/slips` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — Women's Jeans | `womens-wear/jeans` | photo | Stacks of folded denim jeans — Waldemar Brandt (Unsplash License) |
| — Jeggings | `womens-wear/jeggings` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — Kurta Sets | `womens-wear/kurta-sets` | photo | Woman in a pink floral kurta and pants set — Shahenaz India (Unsplash License) |
| — Kurtas | `womens-wear/kurtas` | photo | Woman in a white floral block-print kurta set — Shahenaz India (Unsplash License) |
| — Kurtis | `womens-wear/kurtis` | photo | Navy printed kurti displayed on a mannequin — Zayed Ahmed Zadu (Unsplash License) |
| — Leggings | `womens-wear/leggings` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — Lehengas | `womens-wear/lehengas` | photo | Woman in an ornate yellow and maroon lehenga with dupatta — Morni Saree (Unsplash License) |
| — Women's Loungewear | `womens-wear/loungewear` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — Maternity Wear | `womens-wear/maternity-wear` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — Women's Nightwear | `womens-wear/nightwear` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — Palazzos | `womens-wear/palazzos` | photo | Woman in a printed kurta with palazzo pants — IMANA (Unsplash License) |
| — Salwar Suits | `womens-wear/salwar-suits` | photo | Woman in a pink salwar suit with dupatta — Raju Kumar (Unsplash License) |
| — Sarees | `womens-wear/sarees` | photo | Woman in a red and gold silk saree — shades by 43 (Unsplash License) |
| — — Cotton Sarees | `womens-wear/sarees/cotton-sarees` | photo (low-res) | Woman in a white saree with a red border — Tanmay Abhay Mahajan (Unsplash License) |
| — — Designer Sarees | `womens-wear/sarees/designer-sarees` | photo (low-res) | Woman in an embroidered white saree with a red blouse — Uday Ahir (Unsplash License) |
| — — Printed Sarees | `womens-wear/sarees/printed-sarees` | photo (low-res) | Woman in a colourful printed saree — Horitoki Ltd (Unsplash License) |
| — — Silk Sarees | `womens-wear/sarees/silk-sarees` | photo | Woman in a red and gold silk saree — shades by 43 (Unsplash License) |
| — Women's Shirts | `womens-wear/shirts` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — Skirts | `womens-wear/skirts` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — — Long Skirts | `womens-wear/skirts/long-skirts` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — — Maxi Skirts | `womens-wear/skirts/maxi-skirts` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — — Midi Skirts | `womens-wear/skirts/midi-skirts` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — — Short Skirts | `womens-wear/skirts/short-skirts` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — Women's Sportswear | `womens-wear/sportswear` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — Women's T-Shirts | `womens-wear/t-shirts` | photo | Folded plain t-shirts in assorted colours — Md Salman (Unsplash License) |
| — Women's Thermal Wear | `womens-wear/thermal-wear` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — Tops | `womens-wear/tops` | photo | Patterned blouses and tops on a clothing rack — Aviv Rachmadian (Unsplash License) |
| — Women's Trousers | `womens-wear/trousers` | placeholder | No suitable licensed photo yet — neutral placeholder shown |
| — Women's Western Wear | `womens-wear/western-wear` | photo | Terracotta button-down dress with tie waist — engin akyurt (Unsplash License) |
