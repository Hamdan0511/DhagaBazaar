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
    include: { retailer: true, supplier: { include: { products: { include: { images: true } }, documents: true } } },
  });
  const retailerIds = users.flatMap((u) => (u.retailer ? [u.retailer.id] : []));
  const supplierIds = users.flatMap((u) => (u.supplier ? [u.supplier.id] : []));
  const files = users.flatMap((u) => [...(u.supplier?.products.flatMap((p) => p.images.map((i) => i.storageKey)) ?? []), ...(u.supplier?.documents.map((d) => d.storageKey) ?? [])]);

  const orders = await prisma.order.findMany({
    where: { OR: [{ retailerId: { in: retailerIds } }, { supplierOrders: { some: { supplierId: { in: supplierIds } } } }] },
    select: { id: true, orderNumber: true, supplierOrders: { select: { id: true } } },
  });
  const orderIds = orders.map((o) => o.id);

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
  const entityIds = [...users.map((u) => u.id), ...retailerIds, ...supplierIds, ...productIds, ...documentIds, ...orderIds];
  const audits = entityIds.length ? await prisma.auditLog.deleteMany({ where: { entityId: { in: entityIds } } }) : { count: 0 };
  await prisma.complaint.deleteMany({ where: { OR: [{ retailerId: { in: retailerIds } }, { orderId: { in: orderIds } }] } });
  await prisma.commission.deleteMany({ where: { supplierId: { in: supplierIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  for (const key of files) fs.rmSync(path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? 'uploads', key), { force: true });
  console.info(`[cleanup] Removed ${users.length} e2e users, ${orderIds.length} orders, ${files.length} uploaded files, ${notifications.count} related notifications and ${audits.count} audit entries.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
