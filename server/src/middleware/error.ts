import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import { HttpError } from '../lib/http.js';
import { config } from '../config.js';
import { log } from '../lib/logger.js';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });
};

const send = (res: Parameters<ErrorRequestHandler>[2], status: number, code: string, message: string, details?: unknown) =>
  res.status(status).json({ error: { code, message, details } });

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof HttpError) return send(res, err.status, err.code ?? 'ERROR', err.message, err.details);

  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? `File is too large (max ${Math.round(config.maxUploadBytes / 1048576)} MB).` : err.message;
    return send(res, 400, 'UPLOAD_ERROR', message);
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002':
        return send(res, 409, 'CONFLICT', 'This record already exists.');
      case 'P2025':
        return send(res, 404, 'NOT_FOUND', 'Not found.');
      case 'P2003':
        return send(res, 409, 'CONFLICT', 'This record is linked to other data and cannot be changed this way.');
      case 'P2000':
        return send(res, 422, 'UNPROCESSABLE', 'A value is too long.');
      case 'P2004':
      case 'P2011':
      case 'P2020':
        return send(res, 422, 'UNPROCESSABLE', 'A value is outside the allowed range.');
    }
  }
  // Invalid enum/shape reaching Prisma (e.g. a bad ?status= filter) is a client error.
  if (err instanceof Prisma.PrismaClientValidationError) return send(res, 400, 'BAD_REQUEST', 'Invalid request parameters.');

  // body-parser errors (malformed JSON, payload too large, bad charset) carry a 4xx status.
  if (err?.type === 'entity.parse.failed') return send(res, 400, 'BAD_JSON', 'Malformed JSON body.');
  if (err?.type === 'entity.too.large') return send(res, 413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
  const status = Number(err?.status ?? err?.statusCode);
  if (status >= 400 && status < 500) return send(res, status, 'BAD_REQUEST', 'Bad request.');

  log('error', 'unhandled error', { id: req.id, method: req.method, path: req.path, error: err?.message, stack: config.isProd ? undefined : err?.stack });
  send(res, 500, 'INTERNAL', `Something went wrong on our side. Please try again. (Reference: ${req.id ?? 'n/a'})`);
};
