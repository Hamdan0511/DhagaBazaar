#!/usr/bin/env node
/**
 * Registration landing page acceptance test (real browser, running dev servers, dev DB).
 * Checks both choices are visible (desktop, mobile, signed-in), both forms register and
 * log in to the right dashboard, and the header/drawer expose both registrations.
 *
 *   node scripts/e2e-registration.mjs <outDir>      → then: npm run e2e:cleanup
 */
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const out = process.argv[2] ?? 'e2e-shots';
mkdirSync(out, { recursive: true });
const base = process.env.BASE_URL ?? 'http://localhost:5173';
const executablePath = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((p) => p && existsSync(p));
const browser = await chromium.launch({ executablePath, headless: true });
const errors = [];
let n = 0;
const ok = (m) => console.log(`✓ ${String(++n).padStart(2, '0')} ${m}`);
const stamp = Date.now();

async function page(viewport, mobile = false) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && !/40[0-9]|422/.test(m.text()) && errors.push(m.text()));
  return p;
}
async function bothChoicesVisible(p, label) {
  for (const name of ['Retailer Registration', 'Supplier Registration']) await p.getByRole('heading', { name }).waitFor({ state: 'visible' });
  for (const name of ['Register as Retailer', 'Register as Supplier']) {
    const link = p.getByRole('link', { name, exact: true });
    await link.scrollIntoViewIfNeeded();
    if (!(await link.isVisible())) throw new Error(`${name} not visible (${label})`);
  }
}
async function fill(p, d) {
  const f = p.locator('form');
  await f.getByLabel('Full name').fill(d.name);
  await f.getByLabel('Email address').fill(d.email);
  await f.getByLabel('Mobile number').fill(d.phone);
  await f.locator('input[autocomplete="new-password"]').nth(0).fill(d.password);
  await f.locator('input[autocomplete="new-password"]').nth(1).fill(d.password);
  await f.getByLabel(/business name/i).fill(d.business);
  await f.getByLabel(/(Business|Shop) address/).fill('12 Commercial Street');
  await f.getByLabel('City').fill('Bengaluru');
  await f.getByLabel('State').selectOption('Karnataka');
  await f.getByLabel('PIN code').fill('560001');
}
async function signOut(p) {
  await p.getByRole('button', { name: 'Account menu' }).click();
  await Promise.all([p.waitForResponse((r) => r.url().endsWith('/api/auth/logout') && r.ok()), p.getByRole('button', { name: 'Sign out', exact: true }).click()]);
}
async function signIn(p, email, password, landing) {
  await p.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await p.getByLabel('Email address').fill(email);
  await p.locator('input[autocomplete="current-password"]').fill(password);
  await p.getByRole('button', { name: 'Sign in', exact: true }).click();
  await p.waitForURL(landing);
}

try {
  // 1–2. Guest opens /register on desktop and mobile: both choices visible.
  const desk = await page({ width: 1440, height: 1000 });
  await desk.goto(`${base}/register`, { waitUntil: 'networkidle' });
  await bothChoicesVisible(desk, 'desktop');
  await desk.screenshot({ path: path.join(out, 'register-desktop.png') });
  ok('desktop /register (guest): Retailer and Supplier registration both visible');
  const mob = await page({ width: 390, height: 844 }, true);
  await mob.goto(`${base}/register`, { waitUntil: 'networkidle' });
  await bothChoicesVisible(mob, 'mobile');
  if ((await mob.evaluate(() => document.documentElement.scrollWidth)) > 392) throw new Error('mobile /register overflows horizontally');
  await mob.screenshot({ path: path.join(out, 'register-mobile.png'), fullPage: true });
  ok('mobile /register (guest): both choices visible, no horizontal overflow');

  // Homepage: both sides of the marketplace are visible and lead to the right places.
  await desk.goto(base, { waitUntil: 'networkidle' });
  const header = desk.locator('header');
  const main = desk.locator('#main, main').first();
  for (const name of ['Buy Wholesale', 'Sell Wholesale']) if (!(await header.getByRole('link', { name }).first().isVisible())) throw new Error(`${name} not visible in header`);
  for (const name of ['Start Buying Wholesale', 'Become a Supplier']) if (!(await main.getByRole('link', { name }).first().isVisible())) throw new Error(`hero CTA ${name} not visible`);
  ok('guest homepage: header Buy Wholesale + Sell Wholesale, hero Start Buying Wholesale + Become a Supplier');
  for (const name of ['Everything Your Clothing Business Needs', 'Buy or Sell Wholesale Garments', 'New Arrivals', 'Shop by Supplier', 'Shop by Category']) await desk.getByRole('heading', { name }).waitFor();
  const linkTarget = (name) => main.getByRole('link', { name, exact: true }).first().getAttribute('href');
  const targets = { 'Join as a Retailer': '/register/retailer', 'Register as Retailer': '/register/retailer', 'Register as Supplier': '/register/supplier', 'Start Buying Wholesale': '/categories', 'Become a Supplier': '/register/supplier' };
  for (const [name, href] of Object.entries(targets)) {
    const actual = await linkTarget(name);
    if (actual !== href) throw new Error(`${name} links to ${actual}, expected ${href}`);
  }
  await desk.screenshot({ path: path.join(out, 'home-desktop.png') });
  ok('retailer section, two-sided cards, new arrivals, shop by supplier present; every CTA links to its real route');
  await header.getByRole('link', { name: 'Buy Wholesale' }).first().click();
  await desk.waitForURL(/\/register\/retailer$/);
  await desk.getByRole('heading', { name: 'Retailer registration' }).waitFor();
  await desk.goto(base, { waitUntil: 'networkidle' });
  await header.getByRole('link', { name: 'Sell Wholesale' }).first().click();
  await desk.waitForURL(/\/register\/supplier$/);
  await desk.goto(base, { waitUntil: 'networkidle' });
  await desk.getByRole('link', { name: 'Start Buying Wholesale' }).click();
  await desk.waitForURL(/\/categories$/);
  ok('Buy Wholesale -> retailer registration, Sell Wholesale -> supplier registration, Start Buying Wholesale -> marketplace');
  await desk.goto(`${base}/become-a-supplier`, { waitUntil: 'networkidle' });
  await desk.getByRole('heading', { name: 'How supplier onboarding works' }).waitFor();
  await mob.goto(base, { waitUntil: 'networkidle' });
  for (const name of ['Buy Wholesale', 'Sell Wholesale']) if (!(await mob.locator('header').getByRole('link', { name }).first().isVisible())) throw new Error(`${name} not visible on mobile`);
  if ((await mob.evaluate(() => document.documentElement.scrollWidth)) > 392) throw new Error('mobile homepage overflows horizontally');
  await mob.screenshot({ path: path.join(out, 'home-mobile.png') });
  ok('mobile homepage: Buy/Sell Wholesale visible, no horizontal overflow; Become a Supplier page still loads');

  // Header + drawer entry points for guests.
  await desk.goto(base, { waitUntil: 'networkidle' });
  await desk.getByRole('button', { name: 'Login / Register' }).click();
  const menu = desk.locator('header');
  for (const name of ['Retailer Login', 'Supplier Login', 'Admin login']) await menu.getByRole('link', { name, exact: true }).waitFor();
  await menu.getByRole('link', { name: /Register as Retailer/ }).waitFor();
  await menu.getByRole('link', { name: /Register as Supplier/ }).waitFor();
  await desk.screenshot({ path: path.join(out, 'header-guest-menu.png') });
  await menu.getByRole('link', { name: 'Retailer Login', exact: true }).click();
  await desk.waitForURL(/\/login\?as=retailer$/);
  await desk.getByRole('heading', { name: 'Retailer Login' }).waitFor();
  await desk.goto(base, { waitUntil: 'networkidle' });
  await desk.getByRole('button', { name: 'Login / Register' }).click();
  await menu.getByRole('link', { name: /Register as Retailer/ }).click();
  await desk.waitForURL(/\/register\/retailer$/);
  ok('Login / Register menu: Retailer, Supplier and Admin login + both registrations');
  await mob.goto(base, { waitUntil: 'networkidle' });
  await mob.getByRole('button', { name: 'Open menu' }).click();
  await mob.getByRole('dialog').getByRole('link', { name: 'Register as Retailer' }).waitFor();
  await mob.getByRole('dialog').getByRole('link', { name: 'Register as Supplier' }).waitFor();
  await mob.getByRole('dialog').getByRole('link', { name: 'Buy Wholesale' }).waitFor();
  await mob.getByRole('dialog').getByRole('link', { name: 'Sell Wholesale' }).waitFor();
  await mob.screenshot({ path: path.join(out, 'mobile-drawer.png') });
  ok('mobile menu drawer offers Buy Wholesale, Sell Wholesale and both registrations');

  // 3–4. Retailer card → retailer form → register → dashboard → logout → login → retailer dashboard.
  const retailer = { name: 'Asha Rao', email: `e2e-${stamp}@retailer.test`, phone: '9845012345', password: 'Retail2026', business: `E2E Asha Boutique ${stamp}` };
  await desk.goto(`${base}/register`, { waitUntil: 'networkidle' });
  await desk.getByRole('link', { name: 'Register as Retailer', exact: true }).click();
  await desk.waitForURL(/\/register\/retailer$/);
  await desk.getByRole('heading', { name: 'Retailer registration' }).waitFor();
  ok('Register as Retailer opens the retailer registration form');
  await fill(desk, retailer);
  await desk.getByText('I agree to the').click();
  await desk.getByRole('button', { name: 'Create retailer account' }).click();
  await desk.waitForURL(/\/account$/);
  await desk.getByText('Welcome, Asha').waitFor();
  ok('retailer registered → retailer dashboard (/account)');
  await signOut(desk);
  await signIn(desk, retailer.email, retailer.password, /\/account$/);
  await desk.reload({ waitUntil: 'networkidle' });
  await desk.getByText('Welcome, Asha').waitFor();
  await desk.screenshot({ path: path.join(out, 'retailer-dashboard.png') });
  ok('retailer logged in again → retailer dashboard, session survives refresh');
  const dashNav = desk.getByRole('navigation', { name: 'My Account navigation' });
  for (const name of ['Overview', 'Browse Products', 'Categories', 'My Cart', 'My Orders', 'Saved Products', 'Order Tracking', 'Business Profile', 'Addresses', 'Account Settings']) await dashNav.getByRole('link', { name, exact: true }).waitFor();
  await dashNav.getByRole('button', { name: 'Log out' }).waitFor();
  await dashNav.getByRole('link', { name: 'Addresses', exact: true }).click();
  await desk.getByRole('heading', { name: 'Addresses', exact: true }).waitFor();
  await desk.getByRole('button', { name: 'Add address' }).waitFor();
  await desk.screenshot({ path: path.join(out, 'retailer-addresses.png') });
  if ((await desk.locator('header').getByRole('link', { name: 'Buy Wholesale' }).first().getAttribute('href')) !== '/categories') throw new Error('signed-in Buy Wholesale should open the marketplace');
  ok('retailer dashboard menu: Overview, Browse Products, Categories, Cart, Orders, Saved, Order Tracking, Profile, Addresses, Settings, Log out');

  // The original cause: a signed-in visitor on /register still sees both choices.
  await desk.goto(`${base}/register`, { waitUntil: 'networkidle' });
  await bothChoicesVisible(desk, 'signed in');
  await desk.getByText(/You're signed in as/).waitFor();
  await desk.screenshot({ path: path.join(out, 'register-signed-in.png') });
  ok('signed-in visitor on /register: both choices still visible + clear sign-out option');
  await desk.getByRole('link', { name: 'Register as Supplier', exact: true }).click();
  await desk.waitForURL(/\/register\/supplier$/);
  await Promise.all([desk.waitForResponse((r) => r.url().endsWith('/api/auth/logout') && r.ok()), desk.getByRole('button', { name: 'Sign out to register' }).click()]);
  await desk.locator('form').getByLabel('Full name').waitFor();
  ok('“Sign out to register” on a registration page reveals the form');

  // 5–6. Supplier card → supplier form → register → supplier dashboard → logout → login.
  const supplier = { name: 'Ramesh Kumar', email: `e2e-supplier-${stamp}@supplier.test`, phone: '9900112233', password: 'Weave2026', business: `E2E Kumar Weavers ${stamp}` };
  await desk.goto(`${base}/register`, { waitUntil: 'networkidle' });
  await desk.getByRole('link', { name: 'Register as Supplier', exact: true }).click();
  await desk.waitForURL(/\/register\/supplier$/);
  await desk.getByRole('heading', { name: 'Supplier registration' }).waitFor();
  ok('Register as Supplier opens the supplier registration form');
  await fill(desk, supplier);
  await desk.locator('form').getByRole('button', { name: 'Sarees', exact: true }).click();
  await desk.getByLabel('Business description').fill('Handloom silk sarees woven in our own units since 1998.');
  await desk.getByText('I agree to the').click();
  await desk.getByRole('button', { name: 'Register as a supplier' }).click();
  await desk.waitForURL(/\/supplier$/);
  await desk.getByText('Your application is currently under review.').waitFor();
  ok('supplier registered → supplier dashboard (/supplier), pending admin approval');
  await signOut(desk);
  await signIn(desk, supplier.email, supplier.password, /\/supplier$/);
  await desk.reload({ waitUntil: 'networkidle' });
  await desk.getByText('Your application is currently under review.').waitFor();
  await desk.screenshot({ path: path.join(out, 'supplier-dashboard.png') });
  ok('supplier logged in again → supplier dashboard, session survives refresh');

  // 7. Each dashboard's own pages load; roles stay separated.
  for (const url of ['/supplier/products', '/supplier/profile', '/supplier/inventory']) {
    await desk.goto(`${base}${url}`, { waitUntil: 'networkidle' });
    if (!desk.url().endsWith(url)) throw new Error(`supplier could not open ${url}`);
  }
  await desk.goto(`${base}/account`, { waitUntil: 'networkidle' });
  if (!/\/supplier$/.test(desk.url())) throw new Error('supplier reached the retailer dashboard');
  ok('supplier dashboard pages load; supplier is kept out of the retailer dashboard');
} catch (e) {
  console.error('FAILED:', e.message.split(/\r?\n/)[0]);
  process.exitCode = 1;
}
console.log(errors.length ? `Browser errors:\n${[...new Set(errors)].join('\n')}` : 'No browser errors.');
await browser.close();
