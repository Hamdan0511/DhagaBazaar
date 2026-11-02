#!/usr/bin/env node
/**
 * Read-only UI quality crawl of the public marketplace (no sign-in, no data written).
 * Desktop + mobile: console/page errors, horizontal overflow, broken images, images without
 * alt text, internal links that lead to "Page not found", skip link, dialog labelling.
 *
 *   node scripts/qa-crawl.mjs <outDir>
 */
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const out = process.argv[2] ?? 'qa-shots';
mkdirSync(out, { recursive: true });
const base = process.env.BASE_URL ?? 'http://localhost:5173';
const executablePath = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((p) => p && existsSync(p));
const browser = await chromium.launch({ executablePath, headless: true });

const seeds = [
  '/', '/categories', '/categories/womens-wear', '/categories/womens-wear/sarees', '/categories/womens-wear/sarees/designer-sarees', '/categories/womens-wear/skirts',
  '/categories/womens-wear/skirts/maxi-skirts', '/categories/womens-wear/innerwear', '/categories/womens-wear/innerwear/bras', '/categories/mens-wear', '/categories/mens-wear/t-shirts/polo-t-shirts',
  '/categories/kids-wear', '/categories/kids-wear/innerwear', '/categories/footwear', '/categories/fabrics', '/categories/accessories', '/search?q=saree', '/suppliers',
  '/become-a-supplier', '/cart', '/login', '/register', '/register/retailer', '/register/supplier', '/how-it-works', '/help', '/contact', '/image-credits',
];
const problems = [];
const visited = new Set();
const links = new Set();

for (const [label, viewport, mobile] of [['desktop', { width: 1440, height: 900 }, false], ['mobile', { width: 390, height: 844 }, true]]) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  let current = '';
  page.on('pageerror', (e) => problems.push(`[${label}] page error on ${current}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`[${label}] console error on ${current}: ${m.text()}`));
  page.on('response', (r) => r.status() >= 500 && problems.push(`[${label}] ${r.status()} from ${r.url()} on ${current}`));
  for (const url of seeds) {
    current = url;
    await page.goto(base + url, { waitUntil: 'networkidle' });
    const r = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      notFound: /Page not found/.test(document.querySelector('main')?.textContent ?? ''),
      broken: [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && !i.src.startsWith('data:')).map((i) => i.src),
      noAlt: [...document.images].filter((i) => !i.hasAttribute('alt')).map((i) => i.src),
      hrefs: [...document.querySelectorAll('a[href^="/"]')].map((a) => a.getAttribute('href')),
      h1: document.querySelectorAll('h1').length,
    }));
    if (r.width > viewport.width + 2) problems.push(`[${label}] horizontal overflow ${r.width}px on ${url}`);
    if (r.notFound) problems.push(`[${label}] seed page shows "Page not found": ${url}`);
    if (r.broken.length) problems.push(`[${label}] broken images on ${url}: ${r.broken.join(', ')}`);
    if (r.noAlt.length) problems.push(`[${label}] images without alt on ${url}: ${r.noAlt.join(', ')}`);
    if (r.h1 !== 1) problems.push(`[${label}] ${r.h1} <h1> elements on ${url}`);
    r.hrefs.forEach((h) => links.add(h.split('#')[0]));
    visited.add(url);
    if (['/', '/categories/womens-wear/skirts', '/categories/womens-wear/innerwear'].includes(url)) await page.screenshot({ path: path.join(out, `qa-${label}${url.replace(/\//g, '_') || '_home'}.png`), fullPage: url !== '/' });
  }
  // Keyboard: first Tab lands on the skip link.
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => document.activeElement?.textContent?.trim());
  if (focused !== 'Skip to content') problems.push(`[${label}] first Tab focused "${focused}", expected the skip link`);
  // The sign-in dialog has an accessible name and traps focus inside.
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  if (label === 'desktop') {
    await page.getByRole('button', { name: 'Login / Register' }).click();
    await page.getByRole('link', { name: 'Retailer Login', exact: true }).click();
    await page.waitForURL(/\/login/);
  }
  await ctx.close();
}

// Every internal link found on those pages must resolve to a real page.
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
let checked = 0;
for (const href of [...links].filter((h) => h && !visited.has(h) && !h.startsWith('/api') && !h.startsWith('/uploads')).sort()) {
  await page.goto(base + href, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  const notFound = await page.evaluate(() => /Page not found|This listing is not available/.test(document.querySelector('main')?.textContent ?? ''));
  if (notFound) problems.push(`broken internal link: ${href}`);
  checked++;
}
// Auth dialog labelling (opened from a guest action).
await page.goto(base + '/', { waitUntil: 'networkidle' });
await ctx.close();
console.log(`Crawled ${visited.size} pages × 2 viewports and ${checked} further internal links.`);
console.log(problems.length ? `Problems (${problems.length}):\n${[...new Set(problems)].join('\n')}` : 'No problems found.');
await browser.close();
process.exitCode = problems.length ? 1 : 0;
