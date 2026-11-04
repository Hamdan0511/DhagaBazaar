import { z } from 'zod';

/** Dhaaga Bazaar AI Studio options shared by the API (prompt building, validation) and the studio UI. */

export const AI_BACKGROUNDS = [
  { value: 'PURE_WHITE', label: 'Pure White Studio', description: 'Seamless pure white (#FFFFFF) backdrop — the marketplace standard for catalogue photos.', swatch: '#FFFFFF', prompt: 'a seamless pure white (#FFFFFF) studio background' },
  { value: 'WARM_IVORY', label: 'Warm Ivory Studio', description: 'Soft warm ivory that flatters ethnic wear, silks and gold work.', swatch: '#F4EBDD', prompt: 'a seamless warm ivory (#F4EBDD) studio background' },
  { value: 'PREMIUM_BEIGE', label: 'Premium Beige Studio', description: 'Calm beige backdrop with a premium boutique feel.', swatch: '#E6D5BC', prompt: 'a seamless premium light beige (#E6D5BC) studio background' },
  { value: 'LIGHT_GREY', label: 'Light Grey Studio', description: 'Neutral light grey that keeps white and pastel garments distinct from the background.', swatch: '#E4E4E2', prompt: 'a seamless light neutral grey (#E4E4E2) studio background' },
  { value: 'SOFT_NEUTRAL', label: 'Soft Neutral Studio', description: 'Very soft off-white with a gentle gradient for a natural look.', swatch: '#F2EFEA', prompt: 'a seamless soft neutral off-white (#F2EFEA) studio background with a very gentle, even gradient' },
] as const;

export const AI_MODES = [
  { value: 'FULL', label: 'Full Product Photography Enhancement', description: 'Wrinkles, background, lighting and clarity together.' },
  { value: 'WRINKLES', label: 'Wrinkle Reduction', description: 'Smooths temporary creases; keeps pleats, drape and texture.' },
  { value: 'BACKGROUND', label: 'Background Cleanup', description: 'Replaces a cluttered background with the chosen studio background.' },
  { value: 'LIGHTING', label: 'Lighting Enhancement', description: 'Even, soft studio lighting and correct exposure.' },
  { value: 'CLARITY', label: 'Image Clarity Enhancement', description: 'Sharper, cleaner detail without changing the garment.' },
  { value: 'WHITE_STUDIO', label: 'Professional White Studio', description: 'Classic white-background catalogue shot.' },
  { value: 'PREMIUM_BACKGROUND', label: 'Premium Background', description: 'Premium studio backdrop with refined lighting.' },
] as const;

export const AI_LEVELS = [
  { value: 'NATURAL', label: 'Natural', description: 'Light touch — closest to your photo.' },
  { value: 'BALANCED', label: 'Balanced', description: 'Clear improvement while staying natural.' },
  { value: 'STUDIO', label: 'Professional Studio', description: 'Polished catalogue look.' },
] as const;

export type AiBackground = (typeof AI_BACKGROUNDS)[number]['value'];
export type AiMode = (typeof AI_MODES)[number]['value'];
export type AiLevel = (typeof AI_LEVELS)[number]['value'];

const values = <T extends readonly { value: string }[]>(list: T) => list.map((o) => o.value) as [T[number]['value'], ...T[number]['value'][]];

export const aiGenerateSchema = z.object({
  sourceId: z.string().min(1),
  background: z.enum(values(AI_BACKGROUNDS)).default('PURE_WHITE'),
  mode: z.enum(values(AI_MODES)).default('FULL'),
  level: z.enum(values(AI_LEVELS)).default('BALANCED'),
  /** Supplier-confirmed garment description (may correct the analysis). */
  garmentType: z.string().trim().min(2, 'Enter the garment type').max(80),
  colour: z.string().trim().min(2, 'Enter the main colour').max(80),
  /** Taxonomy path, used to adapt the editing instructions to the category. */
  categoryPath: z.string().trim().max(200).optional(),
  /** Required when the analysis flagged possible defects: the supplier understands they stay visible. */
  defectsAcknowledged: z.boolean().optional(),
});
export type AiGenerateInput = z.infer<typeof aiGenerateSchema>;

/** Structured garment analysis (the shape the analysis model is constrained to return). */
export interface AiGarmentAnalysis {
  garmentType: string;
  dominantColour: string;
  otherColours: string[];
  fabricAppearance: string;
  pattern: string;
  printOrEmbroidery: string;
  neckline: string;
  sleeves: string;
  closures: string;
  wrinkles: 'none' | 'light' | 'moderate' | 'heavy';
  lightingIssues: string[];
  backgroundDistractions: string[];
  possibleDefects: string[];
  imageQuality: 'good' | 'fair' | 'poor';
  confidence: 'high' | 'medium' | 'low';
  /** False when the photo is too poor or ambiguous to enhance without changing the garment. */
  safeToEnhance: boolean;
  notes: string;
}

export const AI_STATUS_LABELS: Record<string, string> = {
  GENERATING: 'Generating',
  COMPLETED: 'Ready for review',
  FAILED: 'Failed',
  ACCEPTED: 'Accepted',
  DISCARDED: 'Discarded',
};
