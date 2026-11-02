#!/usr/bin/env node
/**
 * Visual QA helper: captures screenshots of pages with the locally installed Chrome.
 *
 *   node scripts/screenshot.mjs <outDir> <width>x<height> <path> [<path> ...] [--full]
 *
 * Also prints browser console errors and failed requests so they can be fixed.
 */
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const [outDir, size, ...rest] = process.argv.slice(2);
const full = rest.includes('--full');
const paths = rest.filter((p) => !p.startsWith('--'));
const [width, height] = size.split('x').map(Number);
const base = process.env.BASE_URL ?? 'http://localhost:5173';
const chromeCandidates = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const executablePath = chromeCandidates.find((p) => existsSync(p));

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
const page = await context.newPage();
const problems = [];
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
page.on('response', (r) => r.status() >= 400 && problems.push(`http ${r.status()}: ${r.url()}`));

for (const p of paths) {
  await page.goto(base + p, { waitUntil: 'networkidle' });
  if (full) {
    // Scroll through the page so lazy-loaded images are fetched before capture.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForLoadState('networkidle');
  }
  await page.waitForTimeout(400);
  const name = (p === '/' ? 'home' : p.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')) + `-${width}.png`;
  await page.screenshot({ path: path.join(outDir, name), fullPage: full });
  console.log('saved', name);
}
if (problems.length) console.log('PROBLEMS:\n' + [...new Set(problems)].join('\n'));
else console.log('No console errors or failed requests.');
await browser.close();
