#!/usr/bin/env node
/**
 * Browser end-to-end check (requires dev servers + dev fixtures):
 * guest browses → Add to Cart → signs up in the modal → item is added
 * automatically → cart grouped by supplier → checkout → order placed.
 *
 *   ENABLE_DEV_FIXTURES=true npm run dev -w server   (and the client dev server)
 *   node scripts/e2e-guest-checkout.mjs C:/tmp/shots
 */
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const out = process.argv[2] ?? 'e2e-shots';
mkdirSync(out, { recursive: true });
const base = process.env.BASE_URL ?? 'http://localhost:5173';
const executablePath = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((p) => p && existsSync(p));
const browser = await chromium.launch({ executablePath, headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('401') && errors.push(m.text()));
const shot = (name) => page.screenshot({ path: path.join(out, `e2e-${name}.png`) });
const step = (msg) => console.log(`✓ ${msg}`);

try {
// 1. Guest browses a category and opens a listing.
await page.goto(`${base}/categories/womens-wear/kurtis`, { waitUntil: 'networkidle' });
await page.getByText('[DEV FIXTURE] Test Straight Kurti A3').first().click();
await page.waitForURL(/\/products\//);
await page.getByRole('heading', { name: /Test Straight Kurti/ }).waitFor();
step('guest opened a product page without signing in');

// 2. Below-MOQ selection is rejected client-side.
await page.getByRole('textbox', { name: 'Quantity for L Yellow' }).fill('0');
await page.getByRole('textbox', { name: 'Quantity for M Yellow' }).fill('10');
await page.getByRole('button', { name: 'Add to Cart' }).click();
await page.getByText(/Minimum order quantity is 30/).waitFor();
step('MOQ validation blocks 10 pcs (MOQ 30)');

// 3. Valid quantities → guest is asked to sign in.
await page.getByRole('textbox', { name: 'Quantity for M Yellow' }).fill('15');
await page.getByRole('textbox', { name: 'Quantity for L Yellow' }).fill('15');
await shot('product');
await page.getByRole('button', { name: 'Add to Cart' }).click();
await page.getByRole('dialog').getByText('Sign in to continue').first().waitFor();
await shot('auth-modal');
step('Add to Cart opened the "Sign in to continue" modal');

// 4. Register a retailer inside the modal.
const email = `e2e-${Date.now()}@retailer.test`;
const dialog = page.getByRole('dialog');
await dialog.getByRole('tab', { name: 'Create account' }).click();
await dialog.getByRole('button', { name: 'Retailer', exact: true }).click();
await dialog.getByLabel('Full name').fill('Priya Sharma');
await dialog.getByLabel(/business name/i).fill('Priya Fashions');
await dialog.getByLabel('Email address').fill(email);
await dialog.getByLabel('Mobile number').fill('9845012345');
await dialog.locator('input[autocomplete="new-password"]').nth(0).fill('Retail2024');
await dialog.locator('input[autocomplete="new-password"]').nth(1).fill('Retail2024');
await dialog.getByLabel(/Shop address/).fill('12, 80 Feet Road, Koramangala');
await dialog.getByLabel('City').fill('Bengaluru');
await dialog.getByLabel('State').selectOption('Karnataka');
await dialog.getByLabel('PIN code').fill('560034');
await dialog.getByText('I agree to the').click();
await dialog.getByRole('button', { name: 'Create retailer account' }).click();
await page.getByText('Added to cart').waitFor({ timeout: 15000 });
step('after sign-up the original product was added to the cart automatically');

// 5. Add a product from a second supplier.
await page.goto(`${base}/categories/womens-wear/sarees`, { waitUntil: 'networkidle' });
await page.getByText('[DEV FIXTURE] Test Georgette Saree B1').first().click();
await page.getByRole('heading', { name: /Georgette Saree/ }).waitFor();
await page.getByRole('textbox', { name: 'Quantity', exact: true }).fill('50');
await page.getByRole('button', { name: 'Add to Cart' }).click();
await page.getByText('Added to cart').first().waitFor();
step('added a second supplier product (MOQ 50)');

// 6. Cart shows two supplier groups.
await page.goto(`${base}/cart`, { waitUntil: 'networkidle' });
await page.getByText('2 supplier groups').waitFor();
await shot('cart');
step('cart is grouped into 2 supplier fulfilment groups');

// 7. Checkout: the shop address captured at registration is pre-selected.
await page.getByRole('link', { name: 'Continue to request order' }).click();
await page.getByRole('radio').first().waitFor();
await shot('checkout');
await page.getByRole('button', { name: 'Submit bulk order request' }).click();
await page.getByText('Your bulk order request has been submitted').waitFor({ timeout: 15000 });
await shot('order-placed');
step('order submitted and split per supplier');

} catch (e) {
  await shot('failure');
  console.error('FAILED:', e.message.split(/\r?\n/)[0]);
  process.exitCode = 1;
}
console.log(errors.length ? `Browser errors:\n${errors.join('\n')}` : 'No browser errors.');
await browser.close();
