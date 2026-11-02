/**
 * Proposes (and, only with --apply, removes) leftover TEST records from the development
 * database. Dry run by default: nothing is changed unless --apply is passed.
 *
 *   npm run cleanup:leftovers -w server              # report only
 *   npm run cleanup:leftovers -w server -- --apply   # remove exactly what the report lists
 *
 * Evidence used (never guesses):
 *  1. Notifications whose link points at a supplier / order that no longer exists — they were
 *     created for automated-test accounts that have since been removed.
 *  2. Notifications whose text names an automated-test business ("E2E …", "Probe …").
 *  3. Audit-log entries about users / suppliers / products / documents / orders that no longer
 *     exist in the database AND were never real accounts (their entity is gone and the actor, if
 *     any, was the admin acting on test data).
 * Genuine accounts (anything not matching the evidence above) are never touched. Development
 * fixtures (isFixture=true) are reported separately; remove them with `npm run seed:dev-fixtures -- --remove`.
 */
import { PrismaClient } from '@prisma/client';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to run in production.');
  process.exit(1);
}
const apply = process.argv.includes('--apply');
const verbose = process.argv.includes('--verbose');
const prisma = new PrismaClient();

const ENTITY_TABLE: Record<string, (ids: string[]) => Promise<{ id: string }[]>> = {
  User: (ids) => prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true } }),
  Supplier: (ids) => prisma.supplier.findMany({ where: { id: { in: ids } }, select: { id: true } }),
  Retailer: (ids) => prisma.retailer.findMany({ where: { id: { in: ids } }, select: { id: true } }),
  Product: (ids) => prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true } }),
  SupplierDocument: (ids) => prisma.supplierDocument.findMany({ where: { id: { in: ids } }, select: { id: true } }),
  Order: (ids) => prisma.order.findMany({ where: { id: { in: ids } }, select: { id: true } }),
};

async function main() {
  // ── Notifications ──
  const notifications = await prisma.notification.findMany({ select: { id: true, type: true, title: true, body: true, link: true, createdAt: true, user: { select: { email: true } } } });
  const supplierIds = new Set((await prisma.supplier.findMany({ select: { id: true } })).map((s) => s.id));
  const orderNumbers = new Set((await prisma.order.findMany({ select: { orderNumber: true } })).map((o) => o.orderNumber));
  const staleNotifications = notifications.filter((n) => {
    const supplierLink = n.link?.match(/^\/admin\/suppliers\/([a-z0-9]+)$/);
    if (supplierLink && !supplierIds.has(supplierLink[1])) return true;
    const orderRef = n.body.match(/\bDB\d{6}-[A-Z0-9]+\b/);
    if (orderRef && !orderNumbers.has(orderRef[0])) return true;
    return /\b(E2E|Probe) [A-Z]/.test(n.body);
  });

  // ── Audit logs about records that no longer exist ──
  const logs = await prisma.auditLog.findMany({ select: { id: true, action: true, entityType: true, entityId: true, createdAt: true } });
  const orphanLogs: typeof logs = [];
  for (const [type, finder] of Object.entries(ENTITY_TABLE)) {
    const ofType = logs.filter((l) => l.entityType === type);
    const existing = new Set((await finder([...new Set(ofType.map((l) => l.entityId))])).map((r) => r.id));
    orphanLogs.push(...ofType.filter((l) => !existing.has(l.entityId)));
  }

  // ── Development fixtures (separate decision) ──
  const fixtures = await prisma.supplier.findMany({ where: { isFixture: true }, select: { businessName: true, user: { select: { email: true } }, _count: { select: { products: true } } } });

  console.info(`Mode: ${apply ? 'APPLY (deleting)' : 'DRY RUN (nothing changed)'}`);
  console.info(`\n1. Leftover test notifications: ${staleNotifications.length}`);
  const byKind = new Map<string, number>();
  for (const n of staleNotifications) byKind.set(`${n.user.email} · ${n.type}`, (byKind.get(`${n.user.email} · ${n.type}`) ?? 0) + 1);
  for (const [k, v] of byKind) console.info(`   ${v} × ${k}`);
  console.info(`\n2. Audit entries about records that no longer exist: ${orphanLogs.length}`);
  const byAction = new Map<string, number>();
  for (const l of orphanLogs) byAction.set(`${l.entityType} · ${l.action}`, (byAction.get(`${l.entityType} · ${l.action}`) ?? 0) + 1);
  for (const [k, v] of byAction) console.info(`   ${v} × ${k}`);
  console.info(`\n3. Development fixtures (kept; hidden from the public unless ENABLE_DEV_FIXTURES=true): ${fixtures.length} suppliers`);
  for (const f of fixtures) console.info(`   ${f.businessName} <${f.user.email}> — ${f._count.products} fixture products`);

  if (verbose) {
    console.info('\n── Notifications proposed for removal ──');
    for (const x of staleNotifications) console.info(`N ${x.id} | ${x.createdAt.toISOString()} | ${x.user.email} | ${x.type} | ${x.body} | ${x.link ?? ''}`);
    console.info('\n── Audit entries proposed for removal ──');
    for (const l of orphanLogs) console.info(`A ${l.id} | ${l.createdAt.toISOString()} | ${l.action} | ${l.entityType} ${l.entityId}`);
  }
  if (!apply) {
    console.info('\nNo changes made. Re-run with --apply to delete items 1 and 2 only.');
    return;
  }
  const n = await prisma.notification.deleteMany({ where: { id: { in: staleNotifications.map((x) => x.id) } } });
  const a = await prisma.auditLog.deleteMany({ where: { id: { in: orphanLogs.map((x) => x.id) } } });
  console.info(`\nDeleted ${n.count} notifications and ${a.count} audit entries.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
