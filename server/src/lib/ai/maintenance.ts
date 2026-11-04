import { prisma } from '../prisma.js';
import { storage } from '../storage.js';
import { config } from '../../config.js';
import { log } from '../logger.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Originals that were uploaded to the studio but never enhanced. */
const ABANDONED_SOURCE_DAYS = 3;
/** Discarded/failed versions keep their file this long (history stays, the file is removed). */
const DISCARDED_FILE_DAYS = 30;

/**
 * AI Studio housekeeping. Touches ONLY AI Studio records and their private files:
 * - generations left "GENERATING" by a server restart are marked failed (no silent retry);
 * - originals never used for an enhancement are removed after a few days;
 * - files of discarded versions are removed after 30 days (the history row is kept).
 * Listing photos, products and accepted versions are never touched.
 */
export async function aiMaintenance() {
  const staleBefore = new Date(Date.now() - config.ai.timeoutMs - 60_000);
  const stale = await prisma.aiGeneration.updateMany({ where: { status: 'GENERATING', createdAt: { lt: staleBefore } }, data: { status: 'FAILED', errorCode: 'AI_TIMEOUT', completedAt: new Date() } });

  const abandoned = await prisma.aiSourcePhoto.findMany({ where: { createdAt: { lt: new Date(Date.now() - ABANDONED_SOURCE_DAYS * DAY_MS) }, generations: { none: {} } }, select: { id: true, storageKey: true }, take: 500 });
  for (const s of abandoned) {
    await storage.delete(s.storageKey).catch(() => undefined);
    await prisma.aiSourcePhoto.delete({ where: { id: s.id } }).catch(() => undefined);
  }

  const old = await prisma.aiGeneration.findMany({ where: { status: { in: ['DISCARDED', 'FAILED'] }, storageKey: { not: null }, decidedAt: { lt: new Date(Date.now() - DISCARDED_FILE_DAYS * DAY_MS) } }, select: { id: true, storageKey: true }, take: 500 });
  for (const g of old) {
    await storage.delete(g.storageKey!).catch(() => undefined);
    await prisma.aiGeneration.update({ where: { id: g.id }, data: { storageKey: null } });
  }
  if (stale.count || abandoned.length || old.length) log('info', 'ai maintenance', { staleGenerations: stale.count, abandonedSources: abandoned.length, discardedFiles: old.length });
}

export function scheduleAiMaintenance() {
  const run = () => aiMaintenance().catch((e: Error) => log('error', 'ai maintenance failed', { error: e.message }));
  setTimeout(run, 10_000).unref();
  setInterval(run, 6 * 60 * 60 * 1000).unref();
}
