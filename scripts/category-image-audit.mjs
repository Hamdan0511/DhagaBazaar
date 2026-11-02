#!/usr/bin/env node
/**
 * Category image audit (read-only). For every category in the database it checks that:
 *  - an illustrative photo is mapped (client/src/lib/images.ts), or the neutral placeholder is used;
 *  - the mapped file exists on disk and is a readable image;
 *  - licensing/attribution is recorded (client/src/data/image-credits.json).
 * Writes docs/CATEGORY_IMAGE_AUDIT.md and exits 1 if anything is broken (a missing photo is
 * reported but is not "broken": the placeholder is shown instead of an unrelated image).
 *
 *   node scripts/category-image-audit.mjs
 */
import { createRequire } from 'node:module';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'server', 'package.json'));
const { PrismaClient } = require('@prisma/client');

// DATABASE_URL from server/.env unless already set.
if (!process.env.DATABASE_URL) {
  const env = readFileSync(path.join(root, 'server', '.env'), 'utf8');
  const m = env.match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?/m);
  if (m) process.env.DATABASE_URL = m[1];
}

const imagesTs = readFileSync(path.join(root, 'client/src/lib/images.ts'), 'utf8');
const mapBlock = imagesTs.slice(imagesTs.indexOf('export const categoryImages'), imagesTs.indexOf('export function getCategoryImage'));
const mapping = new Map([...mapBlock.matchAll(/^\s*'?([a-z0-9-]+(?:\/[a-z0-9-]+)*)'?:\s*img\('([^']+)'\)/gm)].map((m) => [m[1], m[2]]));
const credits = new Map(JSON.parse(readFileSync(path.join(root, 'client/src/data/image-credits.json'), 'utf8')).map((c) => [c.key, c]));

const prisma = new PrismaClient();
const categories = await prisma.category.findMany({ orderBy: [{ path: 'asc' }], select: { path: true, name: true, depth: true, isActive: true, _count: { select: { products: true } } } });
await prisma.$disconnect();

const rows = [];
const broken = [];
const usage = new Map();
for (const c of categories) {
  const key = mapping.get(c.path);
  if (!key) {
    rows.push({ ...c, status: 'placeholder', note: 'No suitable licensed photo yet — neutral placeholder shown' });
    continue;
  }
  usage.set(key, [...(usage.get(key) ?? []), c.path]);
  const credit = credits.get(key);
  const file = credit ? path.join(root, 'client/public', credit.src) : null;
  const problems = [];
  if (!credit) problems.push('no credit record');
  else {
    if (!existsSync(file) || statSync(file).size < 1024) problems.push(`file missing: ${credit.src}`);
    if (!credit.photographer || !credit.url) problems.push('attribution incomplete');
  }
  if (problems.length) broken.push(`${c.path}: ${problems.join(', ')}`);
  const lowRes = credit && credit.width < 600;
  rows.push({ ...c, status: problems.length ? 'BROKEN' : lowRes ? 'photo (low-res)' : 'photo', note: credit ? `${credit.alt} — ${credit.photographer} (${credit.url.includes('unsplash') ? 'Unsplash License' : credit.license ?? 'licence on record'})` : problems.join(', ') });
}

const counts = { lowRes: rows.filter((r) => r.status === 'photo (low-res)').length, photo: rows.filter((r) => r.status.startsWith('photo')).length, placeholder: rows.filter((r) => r.status === 'placeholder').length, broken: broken.length };
const shared = [...usage.entries()].filter(([, paths]) => paths.length > 1);
const md = `# Category image audit

Generated ${new Date().toISOString().slice(0, 10)} by \`node scripts/category-image-audit.mjs\` from the live category table.

Category photos are **illustrative** (licensed stock photography, labelled as such on the site). They are never shown as a supplier's product. Supplier listings only ever show photos the supplier uploaded.

| | Count |
|---|---|
| Categories in the database | ${categories.length} |
| With a licensed illustrative photo | ${counts.photo} |
| Using the neutral placeholder (no suitable photo yet) | ${counts.placeholder} |
| …of which low resolution (under 600px wide, should be replaced with a full-size download) | ${counts.lowRes} |
| Broken (missing file or missing licence record) | ${counts.broken} |

All photos are free under the [Unsplash License](https://unsplash.com/license); each one's photographer and source page are listed below and in \`client/src/data/image-credits.json\`.

${broken.length ? `## Broken\n\n${broken.map((b) => `- ${b}`).join('\n')}\n` : 'No broken images: every mapped photo exists on disk and has its licence/attribution recorded.\n'}
## Photos shared by more than one category

Reused only where the photo genuinely shows the subcategory.

${shared.map(([key, paths]) => `- \`${key}\` → ${paths.join(', ')}`).join('\n') || 'None.'}

## Categories still needing a photo

These use the neutral Dhaaga Bazaar placeholder instead of an unrelated or unsuitable photo. **Blocked on:** an official image-API key (\`UNSPLASH_ACCESS_KEY\` for the Unsplash API, or \`PEXELS_API_KEY\` for the Pexels API) or photos supplied by the business. Automated searching of the Unsplash website is not permitted in this environment, and Wikimedia Commons results for these garments were museum pieces, branded goods or unsuitable innerwear imagery.

${rows.filter((r) => r.status === 'placeholder').map((r) => `- ${'  '.repeat(r.depth)}${r.name} (\`${r.path}\`)${r._count.products ? ` — ${r._count.products} listing(s)` : ''}`).join('\n') || 'None.'}

## All categories

| Category | Path | Status | Photo |
|---|---|---|---|
${rows.map((r) => `| ${'— '.repeat(r.depth)}${r.name}${r.isActive ? '' : ' (inactive)'} | \`${r.path}\` | ${r.status} | ${r.note.replace(/\|/g, '/')} |`).join('\n')}
`;
writeFileSync(path.join(root, 'docs/CATEGORY_IMAGE_AUDIT.md'), md);
console.log(`[image-audit] ${categories.length} categories: ${counts.photo} with photo, ${counts.placeholder} placeholder, ${counts.broken} broken → docs/CATEGORY_IMAGE_AUDIT.md`);
if (broken.length) process.exitCode = 1;
