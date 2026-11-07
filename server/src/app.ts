import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { loadUser, requireCsrfHeader } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { serveProductImage } from './lib/storage.js';
import { requestLogger } from './lib/logger.js';
import { apiLimiter } from './lib/rateLimits.js';
import { authRouter } from './routes/auth.js';
import { publicRouter } from './routes/public.js';
import { cartRouter } from './routes/cart.js';
import { retailerRouter } from './routes/retailer.js';
import { supplierRouter } from './routes/supplier.js';
import { adminRouter } from './routes/admin.js';
import { notificationsRouter } from './routes/notifications.js';
import { webhookRouter } from './routes/webhooks.js';
import { prisma } from './lib/prisma.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Only trust X-Forwarded-For when explicitly configured (TRUST_PROXY hops); otherwise clients could spoof IPs.
  app.set('trust proxy', config.trustProxy || false);
  app.use(requestLogger);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'same-site' },
      // Allows Razorpay Standard Checkout (script, iframe, telemetry) when this server also serves the SPA.
      contentSecurityPolicy: {
        directives: {
          'script-src': ["'self'", 'https://checkout.razorpay.com'],
          'frame-src': ["'self'", 'https://api.razorpay.com', 'https://checkout.razorpay.com'],
          'connect-src': ["'self'", 'https://api.razorpay.com', 'https://lumberjack.razorpay.com'],
          'img-src': ["'self'", 'data:', 'blob:', 'https://*.razorpay.com'],
        },
      },
    }),
  );
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || config.clientOrigins.includes(origin)),
      credentials: true,
      allowedHeaders: ['Content-Type', 'X-Requested-With'],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    }),
  );
  // Payment webhooks need the raw body for signature verification, so they are mounted before the JSON parser.
  app.use('/api/webhooks', webhookRouter);
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Product photos are served through a gate: approved photos are public; photos still
  // under review are visible only to their supplier and admins. Verification documents
  // live under uploads/private and are served exclusively through the admin route.
  app.get('/uploads/public/products/:file', loadUser, serveProductImage);

  app.get('/api/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false, error: 'database unavailable' });
    }
  });

  app.use('/api', apiLimiter, requireCsrfHeader, loadUser);
  app.use('/api/auth', authRouter);
  app.use('/api', publicRouter);
  app.use('/api/cart', cartRouter);
  app.use('/api/retailer', retailerRouter);
  app.use('/api/supplier', supplierRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/notifications', notificationsRouter);

  app.use('/api', notFoundHandler);

  // Optional single-process deployment: serve the built client (client/dist) with SPA fallback.
  const clientDist = path.resolve(process.cwd(), process.env.CLIENT_DIST ?? '../client/dist');
  if (process.env.SERVE_CLIENT === 'true' && fs.existsSync(path.join(clientDist, 'index.html'))) {
    app.use(
      express.static(clientDist, {
        index: false,
        maxAge: '1y',
        setHeaders: (res, file) => {
          // Hashed build assets are immutable; HTML and un-hashed images revalidate.
          if (!file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=3600');
        },
      }),
    );
    app.get(/^(?!\/api|\/uploads).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
