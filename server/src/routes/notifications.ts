import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { notFound } from '../lib/http.js';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get('/', async (req, res) => {
  const [notifications, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.notification.count({ where: { userId: req.user!.id, readAt: null } }),
  ]);
  res.json({ notifications, unread });
});

notificationsRouter.post('/:id/read', async (req, res) => {
  const r = await prisma.notification.updateMany({ where: { id: req.params.id, userId: req.user!.id, readAt: null }, data: { readAt: new Date() } });
  if (!r.count) {
    const exists = await prisma.notification.count({ where: { id: req.params.id, userId: req.user!.id } });
    if (!exists) throw notFound();
  }
  res.json({ ok: true });
});

notificationsRouter.post('/read-all', async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.user!.id, readAt: null }, data: { readAt: new Date() } });
  res.json({ ok: true });
});
