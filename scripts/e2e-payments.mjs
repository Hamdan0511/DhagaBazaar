#!/usr/bin/env node
/**
 * UPI QR payment acceptance run (real Chrome, running dev servers, dev DB). No money moves.
 *
 *   ADMIN_EMAIL=… ADMIN_PASSWORD=… node scripts/e2e-payments.mjs <outDir> <test-qr.png> <test-receipt.png> <product-photo.jpg>
 *   then: npm run e2e:cleanup
 *
 * Safety: refuses to run if a QR is already configured (it never touches real business payment
 * settings). It uploads a clearly labelled TEST image as the QR, and at the end removes it and
 * switches UPI payments off again — restoring the "payments not configured" state.
 */
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const [out = 'e2e-shots', qr, receipt, photo] = process.argv.slice(2);
if (!qr || !receipt || !photo || !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
  console.error('Usage: ADMIN_EMAIL=… ADMIN_PASSWORD=… node scripts/e2e-payments.mjs <outDir> <test-qr.png> <test-receipt.png> <product-photo.jpg>');
  process.exit(1);
}
mkdirSync(out, { recursive: true });
const base = process.env.BASE_URL ?? 'http://localhost:5173';
const H = { 'X-Requested-With': 'dhaaga' };
const executablePath = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((p) => p && existsSync(p));
const browser = await chromium.launch({ executablePath, headless: true });
const errors = [];
let n = 0;
const ok = (m) => console.log(`✓ ${String(++n).padStart(2, '0')} ${m}`);
const stamp = Date.now();
const shot = (p, name, full = true) => p.screenshot({ path: path.join(out, `pay-${name}.png`), fullPage: full });

async function context(viewport = { width: 1440, height: 1000 }, mobile = false) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/status of (40\d|409|422)/.test(m.text()) && errors.push(m.text()));
  return { ctx, page };
}
async function json(r) {
  const body = await r.json().catch(() => ({}));
  if (!r.ok()) throw new Error(`${r.url()} → ${r.status()} ${JSON.stringify(body).slice(0, 200)}`);
  return body;
}
const post = (ctx, url, data) => ctx.request.post(`${base}/api${url}`, { headers: H, data }).then(json);
const put = (ctx, url, data) => ctx.request.put(`${base}/api${url}`, { headers: H, data }).then(json);
const upload = (ctx, url, multipart) => ctx.request.post(`${base}/api${url}`, { headers: H, multipart }).then(json);
const file = (p, mimeType) => ({ name: path.basename(p), mimeType, buffer: readFileSync(p) });
const pdf = { name: 'gst.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% TEST DOCUMENT - automated e2e\n') };

const admin = await context();
let restored = false;
let before = null;
async function restoreSettings() {
  if (restored) return;
  restored = true;
  // Retried a few times: if the web server is down the clean-up must not silently give up.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await admin.ctx.request.delete(`${base}/api/admin/payment-settings/qr`, { headers: H }).then(json);
      // Put back every text field exactly as it was; UPI stays off because there is no QR any more.
      const { upiId, beneficiaryName, instructions, supportPhone, supportEmail, paymentTerms, refundPolicy } = before ?? {};
      await put(admin.ctx, '/admin/payment-settings', { manualUpiEnabled: false, gatewayEnabled: false, upiId, beneficiaryName, instructions, supportPhone, supportEmail, paymentTerms, refundPolicy });
      return;
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

try {
  // ── Admin: Settings → Payments (UI) with a labelled TEST QR ──
  const a = admin.page;
  await post(admin.ctx, '/auth/login', { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
  before = (await admin.ctx.request.get(`${base}/api/admin/payment-settings`, { headers: H }).then(json)).settings;
  if (before.hasQr) {
    restored = true;
    throw new Error('A payment QR is already configured — refusing to modify real payment settings. Run this suite on a development database only.');
  }
  await a.goto(`${base}/admin/settings/payments`, { waitUntil: 'networkidle' });
  await a.getByRole('heading', { name: 'Settings · Payments' }).waitFor();
  await a.getByText('UPI QR payments are off').waitFor();
  await a.getByLabel('Enable online payments (Razorpay)').isDisabled().then((d) => { if (!d) throw new Error('gateway toggle must be disabled'); });
  await a.getByTestId('qr-input').setInputFiles(qr);
  await a.getByTestId('qr-preview').waitFor();
  await a.getByLabel('Beneficiary display name').fill('TEST ONLY — automated e2e');
  await a.getByLabel('UPI ID (optional)').fill('test-only@testbank');
  await a.getByLabel('Payment support phone').fill('+91 90000 00000');
  await a.getByLabel('Payment instructions').fill('TEST instructions: this is an automated test, do not pay.');
  await a.getByLabel('Enable UPI QR payments at checkout').check();
  await a.getByRole('button', { name: 'Save payment settings' }).click();
  await a.getByText('Payment settings saved').first().waitFor();
  await shot(a, 'admin-settings');
  ok('admin uploaded a (labelled TEST) QR, previewed it, filled payee details and enabled UPI QR; gateway toggle is disabled');

  // ── Setup via API: approved supplier with a published product ──
  const sup = await context();
  await post(sup.ctx, '/auth/register', {
    fullName: 'Pay Test Supplier', phone: '9845011177', password: 'Weave2026', confirmPassword: 'Weave2026', city: 'Surat', state: 'Gujarat', pincode: '395003', addressLine: '1 Ring Road', acceptTerms: true,
    email: `e2e-supplier-pay-${stamp}@supplier.test`, businessName: `E2E Pay Textiles ${stamp}`, businessType: 'WHOLESALER', categoryPaths: ['accessories/belts'], description: 'Payment acceptance test supplier.',
  });
  const supplierId = (await sup.ctx.request.get(`${base}/api/supplier/me`, { headers: H }).then(json)).supplier.id;
  await put(sup.ctx, '/supplier/profile', { businessName: `E2E Pay Textiles ${stamp}`, businessType: 'WHOLESALER', contactName: 'Pay Test', phone: '9845011177', addressLine: '1 Ring Road', city: 'Surat', state: 'Gujarat', pincode: '395003', categoryPaths: ['accessories/belts'] });
  await upload(sup.ctx, '/supplier/documents', { type: 'GST_CERTIFICATE', file: pdf });
  await post(admin.ctx, `/admin/suppliers/${supplierId}/decision`, { decision: 'APPROVED' });
  const product = (await post(sup.ctx, '/supplier/products', { title: `E2E Payment Belt ${stamp}`, description: 'Belt used by the payment acceptance test.', categoryPath: 'accessories/belts', price: 120, priceUnit: 'PIECE', moq: 10, stockQuantity: 500 })).product;
  await upload(sup.ctx, `/supplier/products/${product.id}/images`, { usageRights: 'SUPPLIER_OWNED', images: file(photo, 'image/jpeg') });
  await post(sup.ctx, `/supplier/products/${product.id}/submit`, {});
  await post(admin.ctx, `/admin/products/${product.id}/decision`, { decision: 'APPROVED' });
  ok('test supplier approved and a ₹120 belt (MOQ 10) published');

  // ── Retailer: checkout with UPI QR (UI) ──
  const ret = await context();
  const r = ret.page;
  await post(ret.ctx, '/auth/register', {
    fullName: 'Pay Test Retailer', phone: '9845011188', password: 'Retail2026', confirmPassword: 'Retail2026', city: 'Bengaluru', state: 'Karnataka', pincode: '560002', addressLine: '12 Chickpet Main Road', acceptTerms: true,
    email: `e2e-pay-${stamp}@retailer.test`, businessName: `E2E Pay Boutique ${stamp}`, businessType: 'RETAILER',
  });
  await post(ret.ctx, '/cart/items', { productId: product.id, lines: [{ quantity: 25 }] });
  await r.goto(`${base}/checkout`, { waitUntil: 'networkidle' });
  await r.getByText('UPI QR payment', { exact: true }).waitFor();
  await r.getByText('Amount payable').waitFor();
  await shot(r, 'checkout');
  // Double click: the idempotency key makes both clicks resolve to one order.
  const placeBtn = r.getByRole('button', { name: 'Place order and pay by UPI' });
  await Promise.all([placeBtn.click(), placeBtn.click({ force: true }).catch(() => undefined)]);
  await r.waitForURL(/\/account\/orders\/[^/]+\/pay$/);
  const orderId = r.url().split('/').at(-2);
  const orders = (await ret.ctx.request.get(`${base}/api/retailer/orders`, { headers: H }).then(json)).orders;
  if (orders.length !== 1) throw new Error(`expected 1 order, got ${orders.length}`);
  ok('checkout offered UPI QR, showed the amount payable, placed exactly one order (double click) and opened the payment page');

  // ── Payment page ──
  await r.getByTestId('amount-due').waitFor();
  const amount = await r.getByTestId('amount-due').textContent();
  if (!/3,000/.test(amount ?? '')) throw new Error(`amount due shows ${amount}, expected ₹3,000`);
  await r.getByRole('img', { name: /UPI QR code for TEST ONLY/ }).waitFor();
  const qrOk = await r.getByRole('img', { name: /UPI QR code/ }).evaluate((i) => i.complete && i.naturalWidth > 0);
  if (!qrOk) throw new Error('QR image did not load');
  await r.getByTestId('beneficiary').filter({ hasText: 'TEST ONLY — automated e2e' }).waitFor();
  await r.getByRole('button', { name: 'Copy UPI ID' }).click();
  await r.getByText('UPI ID copied').first().waitFor();
  const orderNumber = orders[0].orderNumber;
  await r.getByText(`PAY-${orderNumber}`).first().waitFor();
  await shot(r, 'payment-page');
  ok(`payment page: order ${orderNumber}, exact amount ₹3,000, QR, beneficiary, UPI ID (copied), internal reference`);

  await r.getByLabel('UPI transaction ID / UTR').fill('12');
  await r.getByRole('button', { name: 'Submit payment details' }).click();
  await r.getByText(/Enter the 12-digit UPI reference/).first().waitFor();
  const utr = String(stamp).slice(-12).padStart(12, '4');
  await r.getByLabel('UPI transaction ID / UTR').fill(`${utr.slice(0, 6)} ${utr.slice(6)}`);
  await r.getByTestId('receipt-input').setInputFiles(receipt);
  await r.getByRole('button', { name: 'Submit payment details' }).click();
  await r.getByText('Payment details submitted. Our team will verify your transaction.').waitFor();
  await r.getByText('Pending verification').first().waitFor();
  if (await r.getByText('Payment verified').count()) throw new Error('must not show success before verification');
  await shot(r, 'submitted');
  ok('invalid UTR rejected with a clear message; valid UTR + screenshot submitted → "Pending verification" (no success shown)');

  // ── Supplier cannot dispatch before verification ──
  const so = (await sup.ctx.request.get(`${base}/api/supplier/orders`, { headers: H }).then(json)).orders[0];
  await post(sup.ctx, `/supplier/orders/${so.id}/status`, { status: 'CONFIRMED' });
  await sup.page.goto(`${base}/supplier/orders/${so.id}`, { waitUntil: 'networkidle' });
  await sup.page.getByText(/Payment: Pending verification/).waitFor();
  const blocked = await sup.ctx.request.post(`${base}/api/supplier/orders/${so.id}/dispatch`, { headers: H, data: { carrier: 'VRL', trackingNumber: 'LR-E2E' } });
  if (blocked.status() !== 422) throw new Error(`dispatch before verification returned ${blocked.status()}`);
  ok('supplier confirmed the order, sees "Payment: Pending verification" and cannot dispatch yet (422)');

  // ── Admin: Payments → verify ──
  await a.goto(`${base}/admin/payments`, { waitUntil: 'networkidle' });
  await a.getByRole('link', { name: 'Payments' }).first().waitFor();
  await a.getByLabel('Search').fill(utr);
  await a.keyboard.press('Enter');
  await a.getByRole('cell', { name: orderNumber }).waitFor();
  await shot(a, 'admin-list');
  await a.getByRole('link', { name: 'Verify' }).first().click();
  await a.getByTestId('utr').filter({ hasText: utr }).waitFor();
  await a.getByRole('img', { name: 'Receipt submitted by the retailer' }).waitFor();
  await a.getByText(`E2E Pay Boutique ${stamp}`).first().waitFor();
  await shot(a, 'admin-detail');
  await a.getByRole('button', { name: 'Verify payment' }).click();
  const dlg = a.getByRole('dialog', { name: 'Verify payment' });
  const mark = dlg.getByRole('button', { name: 'Mark as paid' });
  if (!(await mark.isDisabled())) throw new Error('Mark as paid must require the confirmation checkbox');
  await dlg.getByLabel('I have confirmed this credit in the business account').check();
  await mark.click();
  await a.getByText('Payment marked as paid').first().waitFor();
  await a.getByText(/Verified .* by/).waitFor();
  ok('admin searched by UTR, opened the payment (UTR, receipt, retailer, supplier breakdown) and verified it after confirming the credit');

  // ── Retailer + supplier see the verified payment ──
  await r.goto(`${base}/account/orders/${orderId}`, { waitUntil: 'networkidle' });
  await r.getByText('Paid · verified').first().waitFor();
  const notes = (await ret.ctx.request.get(`${base}/api/notifications`, { headers: H }).then(json)).notifications ?? [];
  if (!notes.some((x) => x.type === 'PAYMENT_VERIFIED')) throw new Error('retailer was not notified');
  await post(sup.ctx, `/supplier/orders/${so.id}/dispatch`, { carrier: 'VRL Logistics', trackingNumber: `LR-${stamp}` });
  ok('retailer order shows "Paid · verified" and was notified; supplier could then dispatch');

  // ── Rejection path on a second order ──
  await post(ret.ctx, '/cart/items', { productId: product.id, lines: [{ quantity: 10 }] });
  const addr = (await ret.ctx.request.get(`${base}/api/retailer/profile`, { headers: H }).then(json)).profile.addresses[0].id;
  const o2 = (await post(ret.ctx, '/retailer/orders', { addressId: addr, paymentMethod: 'UPI_QR', idempotencyKey: `e2e-${stamp}-second-order` })).order;
  await ret.ctx.request.post(`${base}/api/retailer/orders/${o2.id}/payment/submit`, { headers: H, multipart: { reference: `${utr.slice(0, 11)}9` } }).then(json);
  const p2 = (await admin.ctx.request.get(`${base}/api/admin/payments?q=${o2.orderNumber}&status=SUBMITTED`, { headers: H }).then(json)).payments[0];
  await a.goto(`${base}/admin/payments/${p2.id}`, { waitUntil: 'networkidle' });
  await a.getByRole('button', { name: 'Reject submission' }).click();
  const rj = a.getByRole('dialog', { name: 'Reject this submission' });
  if (!(await rj.getByRole('button', { name: 'Reject submission' }).isDisabled())) throw new Error('reject must require a reason');
  await rj.getByLabel('Reason shown to the retailer').fill('No credit with this UTR was found in our account.');
  await rj.getByRole('button', { name: 'Reject submission' }).click();
  await a.getByText('Submission rejected — retailer notified').first().waitFor();
  await r.goto(`${base}/account/orders/${o2.id}/pay`, { waitUntil: 'networkidle' });
  await r.getByText('We could not verify your previous submission').waitFor();
  await r.getByText('No credit with this UTR was found in our account.').first().waitFor();
  await r.getByLabel('UPI transaction ID / UTR').waitFor();
  ok('admin rejection requires a reason; retailer sees the reason, the order is not paid, and can resubmit');

  // ── Mobile payment page ──
  const mob = await context({ width: 390, height: 844 }, true);
  await post(mob.ctx, '/auth/login', { email: `e2e-pay-${stamp}@retailer.test`, password: 'Retail2026' });
  await mob.page.goto(`${base}/account/orders/${o2.id}/pay`, { waitUntil: 'networkidle' });
  await mob.page.getByRole('img', { name: /UPI QR code/ }).waitFor();
  await mob.page.getByRole('link', { name: 'Open UPI app' }).waitFor();
  const width = await mob.page.evaluate(() => document.documentElement.scrollWidth);
  await shot(mob.page, 'mobile');
  if (width > 392) throw new Error(`mobile overflow ${width}px`);
  ok('mobile (390px): QR, amount and "Open UPI app" button fit the screen');

  // ── Privacy ──
  const intruder = await context();
  await post(intruder.ctx, '/auth/register', {
    fullName: 'Other Retailer', phone: '9845011199', password: 'Retail2026', confirmPassword: 'Retail2026', city: 'Pune', state: 'Maharashtra', pincode: '411001', addressLine: '3 FC Road', acceptTerms: true,
    email: `e2e-pay-other-${stamp}@retailer.test`, businessName: `E2E Other ${stamp}`, businessType: 'RETAILER',
  });
  const statuses = await Promise.all([
    intruder.ctx.request.get(`${base}/api/retailer/orders/${orderId}/payment/receipt`, { headers: H }).then((x) => x.status()),
    intruder.ctx.request.get(`${base}/api/retailer/orders/${o2.id}/payment/qr`, { headers: H }).then((x) => x.status()),
    sup.ctx.request.get(`${base}/api/admin/payments/${p2.id}/receipt`, { headers: H }).then((x) => x.status()),
    sup.ctx.request.post(`${base}/api/admin/payments/${p2.id}/verify`, { headers: H, data: {} }).then((x) => x.status()),
  ]);
  if (statuses.join() !== '404,404,403,403') throw new Error(`privacy checks: ${statuses}`);
  ok(`another retailer cannot see receipts or QR (404); supplier cannot read receipts or verify payments (403)`);
} catch (e) {
  console.error('✗ FAILED:', e.message.split('\n')[0]);
  process.exitCode = 1;
} finally {
  const restoreError = await restoreSettings().then(() => null, (e) => e);
  const after = await admin.ctx.request.get(`${base}/api/admin/payment-settings`, { headers: H }).then(json).then((b) => b.settings).catch(() => null);
  if (restoreError || !after || after.hasQr || after.manualUpiEnabled) {
    console.error('✗ COULD NOT RESTORE PAYMENT SETTINGS — the TEST QR may still be live. Remove it in Admin → Settings → Payments (Remove QR) and untick "Enable UPI QR payments".');
    process.exitCode = 1;
  } else console.log('  · payment settings restored: test QR removed, UPI QR disabled (verified)');
}
console.log(errors.length ? `Browser errors:\n${[...new Set(errors)].join('\n')}` : 'No browser errors.');
await browser.close();
if (errors.length) process.exitCode = 1;
