import { GoogleGenAI } from '@google/genai';
import type { AiGarmentAnalysis } from '@dhaaga/shared';
import { config } from '../../config.js';
import { ANALYSIS_PROMPT, ANALYSIS_SCHEMA } from './prompts.js';

/**
 * Google Gemini access for Dhaaga Bazaar AI Studio (official @google/genai SDK, Interactions API).
 *
 * - The API key is read from server configuration only and never leaves the server.
 * - Requests are made with `store: false` so supplier photos are not kept for later retrieval.
 * - Generation is never retried automatically: every attempt can cost money.
 * - Failures are mapped to a small set of safe codes; provider messages go to the server log only.
 */

export type AiErrorCode = 'AI_NOT_CONFIGURED' | 'AI_QUOTA' | 'AI_RATE_LIMITED' | 'AI_TIMEOUT' | 'AI_AUTH' | 'AI_BLOCKED' | 'AI_NO_IMAGE' | 'AI_INVALID_OUTPUT' | 'AI_FAILED';

export const AI_ERROR_MESSAGES: Record<AiErrorCode, string> = {
  AI_NOT_CONFIGURED: 'Dhaaga Bazaar AI is not configured on this server yet. Please contact Dhaaga Bazaar support.',
  AI_QUOTA: 'Dhaaga Bazaar AI has reached its image-generation quota with Google Gemini. No image was generated. Please try again later.',
  AI_RATE_LIMITED: 'Dhaaga Bazaar AI is busy right now. Please wait a minute and try again.',
  AI_TIMEOUT: 'The AI service took too long to respond. No image was generated — please try again.',
  AI_AUTH: 'Dhaaga Bazaar AI could not authenticate with Google Gemini. Please contact Dhaaga Bazaar support.',
  AI_BLOCKED: 'The AI service declined to edit this photo. Try a clearer photo that shows only the product.',
  AI_NO_IMAGE: 'The AI service did not return an image for this photo. Nothing was saved — please try again or retake the photo.',
  AI_INVALID_OUTPUT: 'The AI service returned an unusable image. Nothing was saved — please try again.',
  AI_FAILED: 'The AI enhancement failed. No image was generated — please try again.',
};

export class AiError extends Error {
  constructor(
    public code: AiErrorCode,
    /** Provider detail for the server log only. */
    public detail?: string,
  ) {
    super(AI_ERROR_MESSAGES[code]);
  }
}

export interface AiImage {
  mimeType: string;
  data: Buffer;
}

export interface AiClient {
  analyse(image: AiImage): Promise<AiGarmentAnalysis>;
  /** Returns the edited image. Throws AiError — never returns the input as a fallback. */
  enhance(image: AiImage, prompt: string, aspectRatio: string): Promise<AiImage>;
}

/** Maps SDK/HTTP failures to safe codes. */
export function classifyAiError(e: unknown): AiError {
  if (e instanceof AiError) return e;
  const err = e as { status?: number; name?: string; constructor?: { name?: string }; message?: string };
  const name = err?.constructor?.name ?? err?.name ?? '';
  const message = String(err?.message ?? e);
  const detail = `${name} ${err?.status ?? ''} ${message}`.slice(0, 500);
  if (/Timeout/i.test(name) || /timed out|aborted due to timeout/i.test(message)) return new AiError('AI_TIMEOUT', detail);
  if (err?.status === 429) return new AiError(/quota|limit: 0|free tier|billing/i.test(message) ? 'AI_QUOTA' : 'AI_RATE_LIMITED', detail);
  // Google reports temporary overload as 503 ("high demand") — a "busy, try again" situation, not a failure of the photo.
  if ((err?.status ?? 0) >= 500 && /high demand|overloaded|unavailable|try again later/i.test(message)) return new AiError('AI_RATE_LIMITED', detail);
  if (err?.status === 401 || err?.status === 403 || /api key|API_KEY_INVALID|permission/i.test(message)) return new AiError('AI_AUTH', detail);
  if (/safety|blocked|prohibited|SAFETY|RECITATION/i.test(message)) return new AiError('AI_BLOCKED', detail);
  // A 400 with no usable message is what the API returns for an invalid key.
  if (err?.status === 400 && /API error occurred: \{"httpMeta"/.test(message)) return new AiError('AI_AUTH', detail);
  return new AiError('AI_FAILED', detail);
}

function parseAnalysis(text: string | undefined): AiGarmentAnalysis {
  if (!text) throw new AiError('AI_FAILED', 'empty analysis response');
  let raw: Partial<AiGarmentAnalysis>;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new AiError('AI_FAILED', `analysis was not JSON: ${text.slice(0, 200)}`);
  }
  const str = (v: unknown, fallback = 'unclear') => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : fallback);
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x: string) => x.trim().slice(0, 200)).slice(0, 10) : []);
  const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T) => (allowed.includes(v as T) ? (v as T) : fallback);
  return {
    garmentType: str(raw.garmentType),
    dominantColour: str(raw.dominantColour),
    otherColours: list(raw.otherColours),
    fabricAppearance: str(raw.fabricAppearance),
    pattern: str(raw.pattern),
    printOrEmbroidery: str(raw.printOrEmbroidery),
    neckline: str(raw.neckline),
    sleeves: str(raw.sleeves),
    closures: str(raw.closures),
    wrinkles: pick(raw.wrinkles, ['none', 'light', 'moderate', 'heavy'] as const, 'light'),
    lightingIssues: list(raw.lightingIssues),
    backgroundDistractions: list(raw.backgroundDistractions),
    possibleDefects: list(raw.possibleDefects),
    imageQuality: pick(raw.imageQuality, ['good', 'fair', 'poor'] as const, 'fair'),
    confidence: pick(raw.confidence, ['high', 'medium', 'low'] as const, 'low'),
    safeToEnhance: raw.safeToEnhance !== false,
    notes: str(raw.notes, ''),
  };
}

function geminiClient(apiKey: string): AiClient {
  const ai = new GoogleGenAI({ apiKey });
  // Generation is never retried (each attempt can be billed). Analysis is inexpensive, so a
  // momentary overload is retried twice with backoff before the supplier sees an error.
  const options = { timeout_ms: config.ai.timeoutMs, retries: { strategy: 'none' as const } };
  const analysisOptions = { timeout_ms: config.ai.timeoutMs, retries: { strategy: 'attempt-count-backoff' as const, maxRetries: 2, retryConnectionErrors: false } };
  return {
    async analyse(image) {
      try {
        const r = await ai.interactions.create(
          {
            model: config.ai.analysisModel,
            store: false,
            input: [
              { type: 'text', text: ANALYSIS_PROMPT },
              { type: 'image', mime_type: image.mimeType, data: image.data.toString('base64') },
            ],
            response_format: { type: 'text', mime_type: 'application/json', schema: ANALYSIS_SCHEMA },
          } as never,
          analysisOptions as never,
        );
        return parseAnalysis((r as { output_text?: string }).output_text);
      } catch (e) {
        throw classifyAiError(e);
      }
    },
    async enhance(image, prompt, aspectRatio) {
      let r: { output_image?: { data?: string; mime_type?: string }; output_text?: string; status?: string };
      try {
        r = (await ai.interactions.create(
          {
            model: config.ai.imageModel,
            store: false,
            input: [
              { type: 'text', text: prompt },
              { type: 'image', mime_type: image.mimeType, data: image.data.toString('base64') },
            ],
            // The Interactions API only accepts image/jpeg as the output format for image editing.
            response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: aspectRatio, image_size: config.ai.imageSize },
          } as never,
          options as never,
        )) as typeof r;
      } catch (e) {
        throw classifyAiError(e);
      }
      const out = r.output_image;
      if (!out?.data) throw new AiError('AI_NO_IMAGE', `status=${r.status} text=${(r.output_text ?? '').slice(0, 300)}`);
      return { mimeType: out.mime_type ?? 'image/jpeg', data: Buffer.from(out.data, 'base64') };
    },
  };
}

let override: AiClient | null = null;
let cached: { key: string; client: AiClient } | null = null;

/** Test seam: replace the Gemini client (automated tests only — never used in the running app). */
export function setAiClientForTests(client: AiClient | null) {
  if (config.env !== 'test') throw new Error('setAiClientForTests is only available in tests');
  override = client;
}

export function aiClient(): AiClient {
  if (override) return override;
  if (!config.ai.apiKey) throw new AiError('AI_NOT_CONFIGURED', 'GEMINI_API_KEY is not set');
  if (cached?.key !== config.ai.apiKey) cached = { key: config.ai.apiKey, client: geminiClient(config.ai.apiKey) };
  return cached.client;
}

/** Supported aspect ratios, picked closest to the original so the garment is not cropped or stretched. */
const RATIOS: [string, number][] = [['1:1', 1], ['4:5', 0.8], ['3:4', 0.75], ['2:3', 2 / 3], ['9:16', 9 / 16], ['5:4', 1.25], ['4:3', 4 / 3], ['3:2', 1.5], ['16:9', 16 / 9]];
export function closestAspectRatio(width: number, height: number) {
  const r = width / height;
  return RATIOS.reduce((best, cur) => (Math.abs(Math.log(cur[1] / r)) < Math.abs(Math.log(best[1] / r)) ? cur : best))[0];
}
