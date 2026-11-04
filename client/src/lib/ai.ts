import type { AiGarmentAnalysis } from '@dhaaga/shared';

/** Dhaaga Bazaar AI Studio API shapes (see server/src/routes/ai.ts). */
export interface AiSource {
  id: string;
  productId: string | null;
  productImageId: string | null;
  width: number;
  height: number;
  sizeBytes: number;
  url: string;
  analysisStatus: 'NOT_STARTED' | 'ANALYSING' | 'COMPLETED' | 'FAILED';
  analysis: AiGarmentAnalysis | null;
  analysisError: string | null;
  createdAt: string;
}

export interface AiGeneration {
  id: string;
  sourceId: string;
  status: 'GENERATING' | 'COMPLETED' | 'FAILED' | 'ACCEPTED' | 'DISCARDED';
  background: string;
  mode: string;
  level: string;
  garmentType: string;
  colour: string;
  model: string;
  url: string | null;
  width: number | null;
  height: number | null;
  error: string | null;
  errorCode: string | null;
  durationMs: number | null;
  productImageId: string | null;
  createdAt: string;
  completedAt: string | null;
  /** History list only. */
  sourceUrl?: string;
  productId?: string | null;
}

export interface AiUsage {
  generations: number;
  generationLimit: number;
  analyses: number;
  analysisLimit: number;
}

export interface AiStatus {
  configured: boolean;
  imageModel: string;
  analysisModel: string;
  usage: AiUsage;
}

export const AI_BASE = '/supplier/ai';
