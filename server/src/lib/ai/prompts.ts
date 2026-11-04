import { AI_BACKGROUNDS, type AiBackground, type AiGarmentAnalysis, type AiLevel, type AiMode } from '@dhaaga/shared';

/**
 * Builds the image-editing instructions for Dhaaga Bazaar AI Studio.
 *
 * The non-negotiable part is garment fidelity: the edit may only change photography (background,
 * light, temporary creases, clarity) — never the product. Instructions are adapted to the
 * category because a saree, a flat-lay fabric and a pair of shoes need different handling.
 */

export const ANALYSIS_PROMPT = `You are a quality inspector for an Indian B2B wholesale clothing marketplace.
Look at this supplier's product photograph and describe ONLY what is visible. Do not guess brand, fabric
composition or quality. If something is not clearly visible, write "not visible" or "unclear".
Report possible defects (holes, tears, stains, missing buttons, broken zippers, damaged fabric, loose threads)
only when you can actually see them. Set safeToEnhance to false when the garment is cut off, very blurred,
too dark, or ambiguous enough that a cleaned-up version could misrepresent it.`;

export const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    garmentType: { type: 'string', description: 'e.g. "half-sleeve crew-neck T-shirt", "silk saree", "girls frock"' },
    dominantColour: { type: 'string' },
    otherColours: { type: 'array', items: { type: 'string' } },
    fabricAppearance: { type: 'string', description: 'how the fabric looks (e.g. "matte cotton jersey look"), not a claim of composition' },
    pattern: { type: 'string' },
    printOrEmbroidery: { type: 'string' },
    neckline: { type: 'string' },
    sleeves: { type: 'string' },
    closures: { type: 'string', description: 'visible buttons, zippers, hooks, drawstrings, or "none visible"' },
    wrinkles: { type: 'string', enum: ['none', 'light', 'moderate', 'heavy'] },
    lightingIssues: { type: 'array', items: { type: 'string' } },
    backgroundDistractions: { type: 'array', items: { type: 'string' } },
    possibleDefects: { type: 'array', items: { type: 'string' } },
    imageQuality: { type: 'string', enum: ['good', 'fair', 'poor'] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    safeToEnhance: { type: 'boolean' },
    notes: { type: 'string', description: 'one or two short sentences for the supplier' },
  },
  required: ['garmentType', 'dominantColour', 'otherColours', 'fabricAppearance', 'pattern', 'printOrEmbroidery', 'neckline', 'sleeves', 'closures', 'wrinkles', 'lightingIssues', 'backgroundDistractions', 'possibleDefects', 'imageQuality', 'confidence', 'safeToEnhance', 'notes'],
} as const;

/** Category-specific handling, chosen from the taxonomy path (most specific match first). */
const CATEGORY_GUIDANCE: [RegExp, string][] = [
  [/sarees?/, 'This is a saree: keep the exact border, pallu, motifs, zari/thread work and any blouse piece. Present it neatly folded or draped exactly as photographed; do not re-drape it into a different style or add a model.'],
  [/dupatta|stole|shawl/, 'This is a dupatta/stole: keep its full border, tassels/lace and print exactly; present it neatly as photographed.'],
  [/dress-material|unstitched/, 'This is an unstitched dress material set: keep every piece shown, with exact prints, borders and embroidery; do not stitch or tailor it.'],
  [/fabrics?|textile|material/, 'This is a flat fabric/textile: preserve the exact print scale, repeat, colour, weave and surface texture. Keep it flat; do not turn it into a garment, do not change the print scale.'],
  [/innerwear|bra|panties|brief|vest|lingerie|thermal/, 'This is innerwear: show it as a clean flat-lay or on an invisible form only. Never add a person or body. Keep straps, elastic bands, lace and hooks exactly as photographed.'],
  [/footwear|shoes?|sandals?|chappal|slipper|sneaker/, 'This is footwear: keep the exact sole, straps, stitching, material finish and colour. Show the pair as photographed on the studio floor with a soft natural contact shadow.'],
  [/accessor|belt|cap|socks|tie|bag/, 'This is an accessory: keep its exact shape, hardware, texture and colour; present it cleanly as photographed.'],
  [/kurta|kurti|anarkali|sherwani|ethnic|lehenga|salwar/, 'This is Indian ethnic wear: keep embroidery, mirror work, zari, prints, yoke details, borders and the exact length and flare.'],
  [/jeans|denim/, 'This is denim: keep the exact wash, fading, whiskering, distressing (it is part of the design), stitching colour, rivets and buttons.'],
  [/jacket|blazer|coat|sweatshirt|hoodie/, 'This is outerwear: keep zips, buttons, pockets, hood, cuffs, quilting and lining exactly as photographed.'],
  [/kids/, 'This is kidswear: keep the exact small size and proportions, prints and trims; never add a child or a model.'],
  [/dress|frock|gown/, 'This is a dress: keep the exact silhouette, length, neckline, sleeves, flare and any embellishment.'],
  [/shirt|t-shirt|top|polo/, 'This is a shirt/top: keep the exact collar or neckline, placket, buttons, sleeve length, hem shape, labels and any print.'],
  [/trouser|pant|legging|jegging|shorts|skirt|bottom|pyjama|track/, 'This is bottomwear: keep the exact waistband, pockets, length, fit and any print or pleats.'],
  [/nightwear|night|lounge/, 'This is nightwear/loungewear: keep every piece of the set with its exact print, piping and trims.'],
];

export function categoryGuidance(categoryPath: string | undefined, garmentType: string) {
  const hay = `${categoryPath ?? ''} ${garmentType}`.toLowerCase();
  return CATEGORY_GUIDANCE.find(([re]) => re.test(hay))?.[1] ?? 'Keep every visible design detail of this product exactly as photographed.';
}

const LEVEL_TEXT: Record<AiLevel, string> = {
  NATURAL: 'Keep the edit subtle and natural: the result should look like a better photograph of the same item, not a new image.',
  BALANCED: 'Make a clear but natural improvement suitable for an online wholesale catalogue.',
  STUDIO: 'Produce a polished professional catalogue photograph with studio-quality lighting.',
};

function modeTasks(mode: AiMode, bg: string): string[] {
  const background = `Replace the background with ${bg}. Remove everything that is not the product (floor, carpet, bed, hangers' clutter, hands, feet, people, other objects). Keep crisp, realistic garment edges and a soft, natural contact shadow only.`;
  const wrinkles = 'Reduce temporary wrinkles and creases from storage or handling. Keep intentional pleats, gathers, natural drape, fabric texture, embroidery relief and design folds.';
  const lighting = 'Even out the lighting: soft, diffused studio light, correct exposure and white balance so the true colour is shown. Remove harsh shadows and colour casts.';
  const clarity = 'Improve clarity and sharpness so fabric texture and stitching are crisp, without adding detail that is not in the photo.';
  switch (mode) {
    case 'WRINKLES':
      return [wrinkles, 'Keep the existing background and lighting unless they must change to remove creases.'];
    case 'BACKGROUND':
      return [background];
    case 'LIGHTING':
      return [lighting, 'Keep the existing background.'];
    case 'CLARITY':
      return [clarity, 'Keep the existing background and lighting.'];
    case 'WHITE_STUDIO':
      return [`Replace the background with ${AI_BACKGROUNDS[0].prompt}. Remove everything that is not the product. Keep crisp, realistic edges and a soft contact shadow only.`, lighting];
    case 'PREMIUM_BACKGROUND':
      return [background, lighting, 'Use refined, premium boutique-style lighting while keeping the colour accurate.'];
    case 'FULL':
    default:
      return [background, wrinkles, lighting, clarity];
  }
}

export interface PromptInput {
  background: AiBackground;
  mode: AiMode;
  level: AiLevel;
  garmentType: string;
  colour: string;
  categoryPath?: string;
  analysis?: AiGarmentAnalysis | null;
}

export function buildEditPrompt(p: PromptInput): string {
  const bg = AI_BACKGROUNDS.find((b) => b.value === p.background)!;
  const a = p.analysis;
  const details = a
    ? [a.pattern, a.printOrEmbroidery, a.neckline, a.sleeves, a.closures, a.fabricAppearance].filter((d) => d && !/^(none|not visible|unclear|n\/a)$/i.test(d.trim()))
    : [];
  const defects = a?.possibleDefects?.filter(Boolean) ?? [];
  return [
    'Edit this supplier product photograph for an online wholesale clothing catalogue. This is a photo EDIT of the real product, not a new design.',
    `The product is: ${p.garmentType}, main colour ${p.colour}.${details.length ? ` Visible details to keep: ${details.join('; ')}.` : ''}`,
    '',
    'ABSOLUTE RULES (the photo must still show the exact same physical item):',
    '- Keep the exact colour and shade, fabric look, pattern, print, embroidery, buttons, zippers, stitching, neckline, sleeves, shape, proportions, length, labels and logos.',
    '- Do not redesign, recolour, restyle, retouch the design, add or remove any design element, or replace it with a similar-looking item.',
    '- Do not add people, models, mannequins, hangers, jewellery, accessories, props, text, watermarks or logos.',
    '- Never hide or repair damage: if there are holes, tears, stains, missing buttons, broken zippers or other defects, they must remain clearly visible exactly as they are.',
    '- If part of the item is cut off in the photo, do not invent the missing part; keep the framing honest.',
    '',
    `Category handling: ${categoryGuidance(p.categoryPath, p.garmentType)}`,
    '',
    'PHOTOGRAPHY TASKS:',
    ...modeTasks(p.mode, bg.prompt).map((t) => `- ${t}`),
    `- ${LEVEL_TEXT[p.level]}`,
    '- Centre the product with even margins in a clean e-commerce composition.',
    defects.length ? `\nThe inspector noted these possible defects; they MUST stay visible: ${defects.join('; ')}.` : '',
  ]
    .filter((l) => l !== undefined)
    .join('\n')
    .trim();
}
