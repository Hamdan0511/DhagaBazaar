#!/usr/bin/env node
/**
 * Full acceptance journeys in a real browser against the running dev servers
 * (web :5173, API :4000) and the real dev database:
 *   supplier → admin → retailer → supplier-sees-order → security checks → mobile screenshots.
 *
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/e2e-journeys.mjs <outDir> <photo.jpg>
 * Records use e2e-* emails; remove them afterwards with `npm run e2e:cleanup`.
 */
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pgTool, readDatabaseUrl } from './pg-tools.mjs';

const [out = 'e2e-shots', photo] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const base = process.env.BASE_URL ?? 'http://localhost:5173';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const executablePath = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((p) => p && existsSync(p));
const browser = await chromium.launch({ executablePath, headless: true });
const errors = [];
const stamp = Date.now();
const supplier = { email: `e2e-supplier-${stamp}@supplier.test`, password: 'Weave2026', business: `E2E Kumar Silk Weavers ${stamp}` };
const retailer = { email: `e2e-${stamp}@retailer.test`, password: 'Retail2026', business: `E2E Priya Boutique ${stamp}` };
const productTitle = `E2E Banarasi Silk Saree ${stamp}`;
let step = 0;
const ok = (m) => console.log(`✓ ${String(++step).padStart(2, '0')} ${m}`);

function sql(query) {
  const url = new URL(readDatabaseUrl(root));
  return execFileSync(pgTool('psql'), ['-h', url.hostname, '-p', url.port, '-U', decodeURIComponent(url.username), '-d', url.pathname.slice(1), '-tAc', query], {
    env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) },
    encoding: 'utf8',
  }).trim();
}

async function newPage(viewport = { width: 1440, height: 1000 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !/401|403|404|422|409/.test(m.text()) && errors.push(`console: ${m.text()}`));
  return { ctx, page };
}
const shot = (page, name) => page.screenshot({ path: path.join(out, `journey-${name}.png`) });

async function signOut(page) {
  await page.getByRole('button', { name: 'Account menu' }).click();
  const signOutButton = page.getByRole('button', { name: 'Sign out', exact: true });
  await signOutButton.waitFor();
  await Promise.all([page.waitForResponse((r) => r.url().endsWith('/api/auth/logout') && r.status() === 200), signOutButton.click()]);
  await page.getByRole('button', { name: 'Login / Register' }).waitFor();
}
async function signIn(page, email, password, landing) {
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email address').fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(landing);
}
async function fillRegistration(page, d) {
  const f = page.locator('form');
  await f.getByLabel('Full name').fill(d.name);
  await f.getByLabel('Email address').fill(d.email);
  await f.getByLabel('Mobile number').fill(d.phone);
  await f.locator('input[autocomplete="new-password"]').nth(0).fill(d.password);
  await f.locator('input[autocomplete="new-password"]').nth(1).fill(d.confirm ?? d.password);
  await f.getByLabel(/business name/i).fill(d.business);
  await f.getByLabel(/(Business|Shop) address/).fill(d.address);
  await f.getByLabel('City').fill('Bengaluru');
  await f.getByLabel('State').selectOption('Karnataka');
  await f.getByLabel('PIN code').fill('560053');
}

const sup = await newPage();
const adm = await newPage();
const ret = await newPage();

try {
  // ─── SUPPLIER JOURNEY ─────────────────────────────────────────────────
  let p = sup.page;
  await p.goto(base, { waitUntil: 'networkidle' });
  await p.locator('header').getByRole('link', { name: 'Sell Wholesale' }).first().click();
  await p.waitForURL(/\/register\/supplier/);
  ok('supplier opened the site and reached Supplier Registration via Sell Wholesale');

  await p.getByRole('button', { name: 'Register as a supplier' }).click();
  await p.getByText('Enter your full name').waitFor();
  await fillRegistration(p, { name: 'Ramesh Kumar', email: supplier.email, phone: '9900112233', password: supplier.password, confirm: 'Mismatch2026', business: supplier.business, address: '45 Chickpet Main Road' });
  await p.getByRole('button', { name: 'Register as a supplier' }).click();
  await p.getByText('Passwords do not match').waitFor();
  await p.getByText('Choose at least one category you supply').waitFor();
  ok('validation: required fields, password mismatch and missing categories are reported');

  await p.locator('input[autocomplete="new-password"]').nth(1).fill(supplier.password);
  await p.locator('form').getByRole('button', { name: 'Sarees', exact: true }).click();
  await p.locator('form').getByRole('button', { name: 'Dupattas', exact: true }).click();
  await p.getByLabel('Business description').fill('Handloom Banarasi and Kanjeevaram silk sarees, woven in our own units since 1998.');
  await p.getByLabel('GSTIN (where applicable)').fill('29ABCDE1234F1Z5');
  await p.getByText('I agree to the').click();
  await p.getByRole('button', { name: 'Register as a supplier' }).click();
  await p.waitForURL(/\/supplier$/);
  await p.getByText('Your application is currently under review.').waitFor();
  await shot(p, 'supplier-dashboard');
  ok('supplier account created → supplier dashboard (pending review, not verified)');

  await signOut(p);
  await signIn(p, supplier.email, supplier.password, /\/supplier$/);
  ok('supplier logged out and logged back in');
  await p.reload({ waitUntil: 'networkidle' });
  await p.getByText('Your application is currently under review.').waitFor();
  ok('session persists after browser refresh');

  await p.goto(`${base}/supplier/profile`, { waitUntil: 'networkidle' });
  await p.getByLabel('WhatsApp number (optional)').fill('9900112233');
  await p.getByLabel('Year established').fill('1998');
  await p.getByRole('button', { name: 'Save business details' }).click();
  await p.getByText('Business details saved').waitFor();
  ok('business profile completed and saved');

  await p.goto(`${base}/supplier/products/new`, { waitUntil: 'networkidle' });
  await p.getByLabel('Product name').fill(productTitle);
  await p.getByLabel('Main category').selectOption('womens-wear');
  await p.getByLabel('Subcategory').selectOption('womens-wear/sarees');
  await p.getByLabel('Product description').fill('Pure Banarasi silk saree with zari border and pallu. Comes with an unstitched blouse piece, packed in a cloth bag.');
  await p.getByLabel('Wholesale price (₹)').fill('2450');
  await p.getByLabel('Minimum order quantity (MOQ)').fill('10');
  await p.getByRole('button', { name: 'Silk', exact: true }).first().click();
  await p.getByRole('button', { name: 'Wedding', exact: true }).first().click();
  await p.getByLabel('Available sizes').fill('Free Size');
  await p.getByLabel('Available colours').fill('Maroon, Teal');
  await p.getByRole('button', { name: 'Add combinations' }).click();
  await p.getByRole('textbox', { name: 'Stock' }).nth(0).fill('20');
  await p.getByRole('textbox', { name: 'Stock' }).nth(1).fill('15');
  await p.getByRole('button', { name: 'Create draft' }).click();
  await p.waitForURL(/\/supplier\/products\/c/);
  ok('product added with category, subcategory, fabric, sizes, colours, price, MOQ and stock');

  await p.getByTestId('photo-file-input').setInputFiles(photo);
  await p.getByLabel('Who owns these photos?').selectOption('SUPPLIER_OWNED');
  await p.getByRole('button', { name: 'Upload 1 photo' }).click();
  await p.getByText('1 photo(s) uploaded').waitFor();
  ok('product image uploaded');
  await p.getByRole('button', { name: 'Submit for review' }).click();
  await p.getByText('Submitted for review').first().waitFor();
  await shot(p, 'supplier-product');
  ok('product submitted for approval');
  const productId = p.url().split('/').pop();

  const guest = await newPage();
  await guest.page.goto(`${base}/products/${productId}`, { waitUntil: 'networkidle' });
  await guest.page.getByText('This listing is not available').waitFor();
  await guest.ctx.close();
  ok('unapproved product is not publicly visible');

  await signOut(p);
  await signIn(p, supplier.email, supplier.password, /\/supplier$/);
  await p.goto(`${base}/supplier/products`, { waitUntil: 'networkidle' });
  await p.getByText(productTitle).waitFor();
  await p.getByText('35 in stock').waitFor();
  await p.goto(`${base}/supplier/profile`, { waitUntil: 'networkidle' });
  if ((await p.getByLabel('Year established').inputValue()) !== '1998') throw new Error('profile did not persist');
  ok('after re-login the product (35 units in stock) and profile data persist');

  // ─── ADMIN JOURNEY ────────────────────────────────────────────────────
  p = adm.page;
  await signIn(p, process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD, /\/admin$/);
  await p.goto(`${base}/admin/applications`, { waitUntil: 'networkidle' });
  await p.getByRole('link', { name: supplier.business, exact: true }).click();
  await p.getByRole('button', { name: 'Approve Application' }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Approve application' }).click();
  await p.getByText('Application approved').first().waitFor();
  ok('admin viewed pending suppliers and approved the supplier');
  await p.goto(`${base}/admin/products/pending`, { waitUntil: 'networkidle' });
  await p.locator('li', { hasText: productTitle }).getByRole('button', { name: 'Approve & publish' }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Approve & publish' }).click();
  await p.getByText('Listing published').first().waitFor();
  ok('admin viewed pending products and published the product');

  // ─── RETAILER JOURNEY ─────────────────────────────────────────────────
  p = ret.page;
  await p.goto(base, { waitUntil: 'networkidle' });
  await p.locator('header').getByRole('link', { name: 'Buy Wholesale' }).first().click();
  await p.waitForURL(/\/register\/retailer/);
  await p.getByRole('button', { name: 'Create retailer account' }).click();
  await p.getByText('Enter a valid email address').waitFor();
  ok('retailer reached Retailer Registration via Buy Wholesale; empty form is rejected with field errors');

  await fillRegistration(p, { name: 'Priya Sharma', email: supplier.email, phone: '9845012345', password: retailer.password, business: retailer.business, address: '12, 80 Feet Road, Koramangala' });
  await p.locator('form').getByRole('button', { name: "Women's Wear", exact: true }).click();
  await p.getByText('I agree to the').click();
  await p.getByRole('button', { name: 'Create retailer account' }).click();
  await p.getByText('An account with this email already exists').first().waitFor();
  ok('duplicate account (email already used) is rejected');
  await p.locator('form').getByLabel('Email address').fill(retailer.email);
  await p.getByRole('button', { name: 'Create retailer account' }).click();
  await p.waitForURL(/\/account$/);
  ok('retailer account created → retailer dashboard');

  await signOut(p);
  await p.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await p.getByLabel('Email address').fill(retailer.email);
  await p.locator('input[autocomplete="current-password"]').fill('WrongPassword9');
  await p.getByRole('button', { name: 'Sign in', exact: true }).click();
  await p.getByText('Incorrect email or password.').waitFor();
  ok('invalid credentials are rejected');
  await signIn(p, retailer.email, retailer.password, /\/account$/);
  await p.reload({ waitUntil: 'networkidle' });
  await p.getByText('Welcome, Priya').waitFor();
  await shot(p, 'retailer-dashboard');
  ok('retailer logged in, refreshed, session persisted, dashboard loaded');

  await p.goto(`${base}/categories/womens-wear/sarees`, { waitUntil: 'networkidle' });
  await p.getByText(productTitle).first().waitFor();
  ok('published product appears when browsing Sarees');
  await p.getByRole('combobox', { name: /search/i }).first().fill(`Banarasi Silk Saree ${stamp}`);
  await p.keyboard.press('Enter');
  await p.waitForURL(/\/search\?q=/);
  await p.getByText(productTitle).first().waitFor();
  ok('search finds the product');
  await p.goto(`${base}/categories/womens-wear/sarees?attr.fabric=Silk&attr.colour=Teal`, { waitUntil: 'networkidle' });
  await p.getByText(productTitle).first().waitFor();
  await p.goto(`${base}/categories/womens-wear/sarees?attr.fabric=Cotton`, { waitUntil: 'networkidle' });
  if (await p.getByText(productTitle).count()) throw new Error('Cotton filter should exclude the silk saree');
  ok('filters by fabric/colour include and exclude correctly');

  await p.goto(`${base}/products/${productId}`, { waitUntil: 'networkidle' });
  await p.getByText('20 left').waitFor();
  await p.getByRole('textbox', { name: /Quantity for Free Size Maroon/ }).fill('5');
  await p.getByRole('textbox', { name: /Quantity for Free Size Teal/ }).fill('0');
  await p.getByRole('button', { name: 'Add to Cart' }).click();
  await p.getByText(/Minimum order quantity is 10/).waitFor();
  ok('product detail shows stock; ordering 5 with MOQ 10 is blocked');
  await p.getByRole('textbox', { name: /Quantity for Free Size Maroon/ }).fill('6');
  await p.getByRole('textbox', { name: /Quantity for Free Size Teal/ }).fill('6');
  await p.getByRole('button', { name: 'Add to Cart' }).click();
  await p.getByText('Added to cart').first().waitFor();
  ok('12 pieces across two colours added to cart');

  await p.goto(`${base}/cart`, { waitUntil: 'networkidle' });
  const maroonQty = p.getByRole('textbox', { name: `Quantity for ${productTitle}` }).first();
  await maroonQty.fill('8');
  await maroonQty.press('Enter');
  await p.getByText('14', { exact: true }).first().waitFor();
  ok('cart quantity edited (total now 14)');
  await shot(p, 'retailer-cart');
  await p.getByRole('link', { name: 'Continue to request order' }).click();
  await p.getByRole('radio').first().waitFor();
  await p.getByRole('button', { name: 'Submit bulk order request' }).click();
  await p.getByText('Your bulk order request has been submitted').waitFor();
  const orderNumber = (await p.getByRole('heading', { level: 1 }).textContent()).replace('Order ', '').trim();
  await shot(p, 'retailer-order');
  ok(`checkout completed using the registered shop address → ${orderNumber}`);

  const dbRow = sql(`SELECT o."orderNumber"||'|'||o.status||'|'||o."subtotalPaise"||'|'||count(oi.id)||'|'||sum(oi.quantity) FROM orders o JOIN retailers r ON r.id=o."retailerId" JOIN users u ON u.id=r."userId" JOIN supplier_orders so ON so."orderId"=o.id JOIN order_items oi ON oi."supplierOrderId"=so.id WHERE u.email='${retailer.email}' GROUP BY o.id`);
  const stock = sql(`SELECT string_agg(v.colour||'='||v."stockQuantity", ',' ORDER BY v.colour) FROM product_variants v WHERE v."productId"='${productId}'`);
  if (!dbRow.startsWith(orderNumber) || !dbRow.endsWith('|2|14')) throw new Error(`unexpected DB row: ${dbRow}`);
  if (stock !== 'Maroon=12,Teal=9') throw new Error(`unexpected stock: ${stock}`);
  ok(`order saved in PostgreSQL (${dbRow}); stock reserved → ${stock}`);

  await p.goto(`${base}/account/orders`, { waitUntil: 'networkidle' });
  await p.getByText(orderNumber).waitFor();
  await p.getByText(orderNumber).click();
  await p.getByText('Requested').first().waitFor();
  ok('order history and order details show the order and its status');

  // ─── SUPPLIER SEES THE ORDER ──────────────────────────────────────────
  p = sup.page;
  await p.goto(`${base}/supplier/orders`, { waitUntil: 'networkidle' });
  await p.getByText(orderNumber).waitFor();
  await p.getByText(retailer.business).first().waitFor();
  await shot(p, 'supplier-orders');
  ok('the correct supplier sees the order with the retailer’s business details');

  // ─── SECURITY JOURNEY ─────────────────────────────────────────────────
  await ret.page.goto(`${base}/supplier`, { waitUntil: 'networkidle' });
  if (!/\/account$/.test(ret.page.url())) throw new Error('retailer reached supplier portal');
  await ret.page.goto(`${base}/admin`, { waitUntil: 'networkidle' });
  if (!/\/account$/.test(ret.page.url())) throw new Error('retailer reached admin portal');
  ok('retailer is redirected away from supplier and admin dashboards');
  const H = { 'X-Requested-With': 'dhaaga' };
  const statuses = {
    retailerToSupplierApi: (await ret.page.request.get(`${base}/api/supplier/products`)).status(),
    supplierToRetailerApi: (await sup.page.request.get(`${base}/api/retailer/orders`)).status(),
    supplierToAdminApi: (await sup.page.request.get(`${base}/api/admin/suppliers`)).status(),
    supplierEditsRetailerProfile: (await sup.page.request.put(`${base}/api/retailer/profile`, { headers: H, data: { businessName: 'Hacked' } })).status(),
  };
  const anon = await browser.newContext();
  statuses.anonymousCart = (await anon.request.get(`${base}/api/cart`)).status();
  statuses.anonymousOrders = (await anon.request.get(`${base}/api/retailer/orders`)).status();
  await anon.close();
  const expected = { retailerToSupplierApi: 403, supplierToRetailerApi: 403, supplierToAdminApi: 403, supplierEditsRetailerProfile: 403, anonymousCart: 401, anonymousOrders: 401 };
  for (const [k, v] of Object.entries(expected)) if (statuses[k] !== v) throw new Error(`${k}: expected ${v}, got ${statuses[k]}`);
  ok(`API role checks hold: ${JSON.stringify(statuses)}`);
  const me = await (await ret.page.request.get(`${base}/api/auth/me`)).text();
  if (/passwordHash|\$2[aby]\$/.test(me)) throw new Error('password hash exposed');
  ok('no password or hash in API responses');

  // ─── MOBILE ───────────────────────────────────────────────────────────
  const mobilePages = [
    ['retailer', ret.ctx, ['/account', '/account/orders', '/account/shipments', '/account/profile', '/account/settings', '/cart', `/products/${productId}`, '/categories/womens-wear/sarees']],
    ['supplier', sup.ctx, ['/supplier', '/supplier/products', '/supplier/products/new', `/supplier/products/${productId}`, '/supplier/inventory', '/supplier/orders', '/supplier/profile', '/supplier/onboarding', '/supplier/settings']],
    ['admin', adm.ctx, ['/admin', '/admin/applications', '/admin/suppliers/approved', '/admin/documents', '/admin/products/pending', '/admin/products/live', '/admin/orders', '/admin/categories', '/admin/retailers', '/admin/audit']],
  ];
  const overflow = [];
  for (const [name, ctx, urls] of mobilePages) {
    const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await ctx.storageState() });
    const mp = await m.newPage();
    mp.on('pageerror', (e) => errors.push(`pageerror(mobile): ${e.message}`));
    for (const url of urls) {
      await mp.goto(`${base}${url}`, { waitUntil: 'networkidle' });
      const width = await mp.evaluate(() => document.documentElement.scrollWidth);
      if (width > 392) overflow.push(`${url} (${width}px)`);
    }
    await mp.goto(`${base}${urls[0]}`, { waitUntil: 'networkidle' });
    await mp.screenshot({ path: path.join(out, `journey-mobile-${name}.png`) });
    await m.close();
  }
  if (overflow.length) throw new Error(`horizontal overflow at 390px: ${overflow.join(', ')}`);
  ok(`no horizontal overflow on ${mobilePages.reduce((s, [, , u]) => s + u.length, 0)} dashboard pages at 390px`);
} catch (e) {
  console.error('FAILED:', e.message.split(/\r?\n/)[0]);
  for (const [n, x] of [['supplier', sup], ['admin', adm], ['retailer', ret]]) await shot(x.page, `failure-${n}`).catch(() => {});
  process.exitCode = 1;
}
console.log(errors.length ? `Browser errors:\n${[...new Set(errors)].join('\n')}` : 'No browser errors.');
await browser.close();
