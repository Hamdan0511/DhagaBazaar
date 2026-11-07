import multer from 'multer';
import type { RequestHandler } from 'express';
import { config } from '../config.js';
import { badRequest } from '../lib/http.js';
import { sniffMime } from '../lib/storage.js';

const memory = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadBytes, files: 10 } });

export const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
export const DOCUMENT_MIMES = ['application/pdf', 'image/jpeg', 'image/png'];

/** Accepts uploads into memory, then verifies each file's real signature. */
export function acceptFiles(field: string, allowed: string[], maxCount = 1): RequestHandler[] {
  const verify: RequestHandler = (req, _res, next) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) return next(badRequest('Please choose a file to upload.'));
    for (const f of files) {
      const mime = sniffMime(f.buffer);
      if (!mime || !allowed.includes(mime)) {
        const kinds = allowed.map((m) => m.split('/')[1].toUpperCase()).join(', ');
        return next(badRequest(`"${f.originalname}" is not a supported file. Allowed: ${kinds}.`));
      }
      f.mimetype = mime;
    }
    next();
  };
  return [memory.array(field, maxCount), verify];
}

/**
 * Optional single file (e.g. a payment receipt): no file is fine, but a file that is present must
 * match one of the allowed signatures and be within maxBytes.
 */
export function optionalFile(field: string, allowed: string[], maxBytes: number): RequestHandler[] {
  const verify: RequestHandler = (req, _res, next) => {
    const f = req.file;
    if (!f) return next();
    if (f.size > maxBytes) return next(badRequest(`"${f.originalname}" is larger than ${Math.round(maxBytes / 1048576)} MB.`));
    const mime = sniffMime(f.buffer);
    if (!mime || !allowed.includes(mime)) {
      return next(badRequest(`"${f.originalname}" is not a supported file. Allowed: ${allowed.map((m) => m.split('/')[1].toUpperCase()).join(', ')}.`));
    }
    f.mimetype = mime;
    next();
  };
  return [memory.single(field), verify];
}
