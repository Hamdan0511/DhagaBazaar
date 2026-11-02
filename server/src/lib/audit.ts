import type { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

export async function audit(
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  metadata?: Prisma.InputJsonValue,
) {
  await prisma.auditLog.create({ data: { actorId, action, entityType, entityId, metadata } });
}

export async function notify(userId: string, type: string, title: string, body: string, link?: string) {
  await prisma.notification.create({ data: { userId, type, title, body, link } });
}
