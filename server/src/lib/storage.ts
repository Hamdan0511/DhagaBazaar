import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { RequestHandler } from 'express';
import { config } from '../config.js';
import { prisma } from './prisma.js';

/**
 * Storage abstraction. Only the local-disk driver is implemented today; an
 * S3-compatible driver (AWS S3, Cloudflare R2, MinIO) can implement the same
 * interface without touching route code.
 *
 * Keys are namespaced:
 *   public/products/<uuid>.<ext>   — product photos, served at /uploads/public/...
 *   private/documents/<uuid>.<ext> — verification documents, served only via an authorised route
 */
export interface StorageAdapter {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  publicUrl(key: string): string;
}

const root = path.resolve(process.cwd(), config.uploadDir);

function safePath(key: string) {
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error('Invalid storage key');
  return full;
}

export const localStorage: StorageAdapter = {
  async put(key, data) {
    const full = safePath(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
  },
  get: (key) => fs.readFile(safePath(key)),
  async delete(key) {
    await fs.rm(safePath(key), { force: true });
  },
  publicUrl: (key) => `/uploads/${key}`,
};

export const storage: StorageAdapter = localStorage;
export const PUBLIC_UPLOAD_ROOT = path.join(root, 'public');

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/** Checks real file signatures instead of trusting the client-supplied MIME type. */
export function sniffMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buf.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  return null;
}

export function newKey(prefix: string, mime: string) {
  return `${prefix}/${crypto.randomUUID()}.${EXT_BY_MIME[mime] ?? 'bin'}`;
}

const PRODUCT_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;
const IMAGE_TYPES: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/**
 * Serves a product photo. Accepted photos are public and cacheable; photos
 * pending or rejected in review are only visible to their supplier and admins,
 * so unreviewed uploads can never be hot-linked from our domain.
 */
export const serveProductImage: RequestHandler = async (req, res, next) => {
  try {
    const file = String(req.params.file ?? '');
    if (!PRODUCT_FILE.test(file)) return res.status(404).end();
    const key = `public/products/${file}`;
    const image = await prisma.productImage.findFirst({ where: { storageKey: key }, select: { status: true, product: { select: { supplierId: true } } } });
    if (!image) return res.status(404).end();
    const isPublic = image.status === 'ACCEPTED';
    const allowed = isPublic || req.user?.role === 'ADMIN' || (req.user?.supplierId && req.user.supplierId === image.product.supplierId);
    if (!allowed) return res.status(404).end();
    const data = await storage.get(key);
    res.setHeader('Content-Type', IMAGE_TYPES[file.split('.').pop()!]);
    res.setHeader('Cache-Control', isPublic ? 'public, max-age=604800' : 'private, no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.send(data);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return res.status(404).end();
    next(e);
  }
};
