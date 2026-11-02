/**
 * Production-safe seed: category taxonomy ONLY (plus an optional admin account
 * from environment variables). It never creates suppliers or products.
 *
 * Idempotent and edit-safe:
 *  - categories missing from the database are created;
 *  - existing categories keep their admin-edited name, description, keywords and
 *    active flag — only tree structure (parent, depth, order) is kept in sync;
 *  - a small list of label corrections is applied only where the stored value is
 *    still the original default (so an admin's own wording is never overwritten).
 * Nothing is ever deleted.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { FLAT_CATEGORIES } from '@dhaaga/shared';

const prisma = new PrismaClient();

/** Taxonomy label corrections: applied only when the database still holds the old default. */
const CORRECTIONS: { path: string; field: 'name' | 'title' | 'filterSet' | 'description'; from: string }[] = [
  { path: 'womens-wear/ethnic-sets', field: 'name', from: 'Ethnic Sets' },
  { path: 'womens-wear/ethnic-sets', field: 'title', from: 'Wholesale Ethnic Sets' },
  { path: 'kids-wear/school-uniforms', field: 'name', from: 'School Uniforms' },
  { path: 'kids-wear/school-uniforms', field: 'title', from: 'Wholesale School Uniforms' },
  { path: 'fabrics/cotton-fabrics', field: 'name', from: 'Cotton Fabrics' },
  { path: 'fabrics/silk-fabrics', field: 'name', from: 'Silk Fabrics' },
  { path: 'fabrics/linen', field: 'name', from: 'Linen' },
  { path: 'fabrics/polyester', field: 'name', from: 'Polyester' },
  { path: 'fabrics/printed-fabrics', field: 'name', from: 'Printed Fabrics' },
  { path: 'fabrics/embroidered-fabrics', field: 'name', from: 'Embroidered Fabrics' },
  { path: 'fabrics/dress-materials', field: 'name', from: 'Dress Materials' },
  // Innerwear moved from the generic "basics" filters to innerwear-specific ones (type, pack size, bra sizes).
  { path: 'womens-wear/innerwear', field: 'filterSet', from: 'basics' },
  { path: 'mens-wear/innerwear', field: 'filterSet', from: 'basics' },
];

async function main() {
  const ids = new Map<string, string>();
  let created = 0;
  for (const [index, c] of FLAT_CATEGORIES.entries()) {
    const parentId = c.parentPath ? ids.get(c.parentPath) ?? null : null;
    const existing = await prisma.category.findUnique({ where: { path: c.path } });
    if (existing) {
      // Structure only — content stays as the admin left it.
      const row = await prisma.category.update({ where: { id: existing.id }, data: { parentId, depth: c.depth, sortOrder: index } });
      ids.set(c.path, row.id);
      continue;
    }
    const row = await prisma.category.create({
      data: {
        path: c.path,
        slug: c.slug,
        name: c.name,
        title: c.title ?? `Wholesale ${c.name}`,
        description: c.description,
        filterSet: c.filterSet,
        keywords: c.keywords ?? [],
        depth: c.depth,
        sortOrder: index,
        parentId,
      },
    });
    ids.set(c.path, row.id);
    created++;
  }
  let corrected = 0;
  for (const fix of CORRECTIONS) {
    const target = FLAT_CATEGORIES.find((c) => c.path === fix.path);
    if (!target) continue;
    const to = fix.field === 'title' ? target.title ?? `Wholesale ${target.name}` : (target[fix.field] as string);
    const r = await prisma.category.updateMany({ where: { path: fix.path, [fix.field]: fix.from }, data: { [fix.field]: to } });
    corrected += r.count;
  }
  const total = await prisma.category.count();
  console.info(`[seed] taxonomy: ${created} categories created, ${FLAT_CATEGORIES.length - created} already present, ${corrected} label corrections applied; ${total} categories in the database.`);

  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (email && password) {
    if (password.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters.');
    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing) {
      await prisma.user.create({
        data: { email, passwordHash: await bcrypt.hash(password, 12), fullName: process.env.ADMIN_NAME || 'Dhaaga Admin', role: 'ADMIN' },
      });
      console.info(`[seed] Admin account created for ${email}.`);
    } else if (existing.role !== 'ADMIN') {
      throw new Error(`${email} already exists as a non-admin user.`);
    } else {
      console.info(`[seed] Admin account ${email} already exists (password unchanged).`);
    }
  } else {
    console.info('[seed] ADMIN_EMAIL / ADMIN_PASSWORD not set — no admin account created.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
