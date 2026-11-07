/**
 * Removes records created by the browser end-to-end scripts (emails matching
 * e2e-*@retailer.test / e2e-supplier-*@supplier.test) from a NON-production database.
 */
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to run in production.');
  process.exit(1);
}
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: { OR: [{ email: { startsWith: 'e2e-', endsWith: '@retailer.test' } }, { email: { startsWith: 'e2e-supplier-', endsWith: '@supplier.test' } }] },
    include: { retailer: true, supplier: { include: { products: { include: { images: true } }, documents: true, aiSources: { select: { id: true, storageKey: true } }, aiGenerations: { select: { id: true, storageKey: true } } } } },
  });
  const retailerIds = users.flatMap((u) => (u.retailer ? [u.retailer.id] : []));
  const supplierIds = users.flatMap((u) => (u.supplier ? [u.supplier.id] : []));
  const files = users.flatMap((u) => [
    ...(u.supplier?.products.flatMap((p) => p.images.map((i) => i.storageKey)) ?? []),
    ...(u.supplier?.documents.map((d) => d.storageKey) ?? []),
    // AI Studio originals and generated versions (private files; rows go with the supplier).
    ...(u.supplier?.aiSources.map((a) => a.storageKey) ?? []),
    ...(u.supplier?.aiGenerations.flatMap((g) => (g.storageKey ? [g.storageKey] : [])) ?? []),
  ]);

  const orders = await prisma.order.findMany({
    where: { OR: [{ retailerId: { in: retailerIds } }, { supplierOrders: { some: { supplierId: { in: supplierIds } } } }] },
    select: { id: true, orderNumber: true, supplierOrders: { select: { id: true } } },
  });
  const orderIds = orders.map((o) => o.id);
  // Payment receipts are private files; the payment rows go with their orders.
  const receipts = (await prisma.payment.findMany({ where: { orderId: { in: orderIds }, receiptKey: { not: null } }, select: { receiptKey: true } })).map((p) => p.receiptKey!);
  files.push(...receipts);

  // Notifications the test records caused for OTHER accounts (e.g. admin "application to review",
  // fixture suppliers' "new order request"), and audit entries about the test records.
  const productIds = users.flatMap((u) => u.supplier?.products.map((p) => p.id) ?? []);
  const documentIds = users.flatMap((u) => u.supplier?.documents.map((d) => d.id) ?? []);
  const businessNames = users.flatMap((u) => [u.retailer?.businessName, u.supplier?.businessName]).filter((n): n is string => !!n);
  const references = [...supplierIds, ...orders.flatMap((o) => [o.orderNumber, ...o.supplierOrders.map((so) => so.id)]), ...businessNames];
  const notifications = references.length
    ? await prisma.notification.deleteMany({
        where: { userId: { notIn: users.map((u) => u.id) }, OR: references.flatMap((r) => [{ link: { contains: r } }, { body: { contains: r } }]) },
      })
    : { count: 0 };
  const aiIds = users.flatMap((u) => [...(u.supplier?.aiSources.map((a) => a.id) ?? []), ...(u.supplier?.aiGenerations.map((g) => g.id) ?? [])]);
  const entityIds = [...users.map((u) => u.id), ...retailerIds, ...supplierIds, ...productIds, ...documentIds, ...orderIds, ...aiIds];
  const audits = entityIds.length ? await prisma.auditLog.deleteMany({ where: { entityId: { in: entityIds } } }) : { count: 0 };
  await prisma.complaint.deleteMany({ where: { OR: [{ retailerId: { in: retailerIds } }, { orderId: { in: orderIds } }] } });
  await prisma.commission.deleteMany({ where: { supplierId: { in: supplierIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  for (const key of files) fs.rmSync(path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? 'uploads', key), { force: true });
  // Each test supplier's AI Studio folder (now empty).
  for (const id of supplierIds) fs.rmSync(path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? 'uploads', 'private', 'ai', id), { recursive: true, force: true });
  console.info(`[cleanup] Removed ${users.length} e2e users, ${orderIds.length} orders, ${files.length} uploaded files, ${notifications.count} related notifications and ${audits.count} audit entries.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
