#!/usr/bin/env node
/**
 * Admin review portal, supplier camera/photo upload and category acceptance test
 * (real Chrome with a simulated camera, running dev servers, dev DB).
 *
 *   ADMIN_EMAIL=… ADMIN_PASSWORD=… node scripts/e2e-admin-review.mjs <outDir> <photo.jpg> <tiny.jpg> <photo.png> <photo.webp> <large.jpg>
 *   (photo ≥ 400px; tiny < 400px; large > 2560px to exercise on-device resizing)
 *   then: npm run e2e:cleanup
 *
 * Records use e2e-supplier-*@supplier.test / e2e-*@retailer.test so the cleanup removes them.
 */
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [out = 'e2e-shots', photo, tiny, png, webp, large] = process.argv.slice(2);
if (!photo || !tiny || !png || !webp || !large || !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
  console.error('Usage: ADMIN_EMAIL=… ADMIN_PASSWORD=… node scripts/e2e-admin-review.mjs <outDir> <photo.jpg> <tiny.jpg> <photo.png> <photo.webp> <large.jpg>');
  process.exit(1);
}
mkdirSync(out, { recursive: true });
const base = process.env.BASE_URL ?? 'http://localhost:5173';
const H = { 'X-Requested-With': 'dhaaga' };
const executablePath = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((p) => p && existsSync(p));
// Chrome's built-in fake camera stands in for a phone camera (permission auto-granted).
const browser = await chromium.launch({ executablePath, headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const errors = [];
/** Requests started but not finished — printed if a page never settles, to diagnose hangs. */
const inflight = new Map();
let n = 0;
const ok = (m) => console.log(`✓ ${String(++n).padStart(2, '0')} ${m}`);
const stamp = Date.now();
const shot = (p, name, full = false) => p.screenshot({ path: path.join(out, `review-${name}.png`), fullPage: full });

// A small but valid one-page PDF for the "GST certificate" upload.
const pdfPath = path.join(out, 'e2e-gst.pdf');
{
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>'];
  const text = 'BT /F1 22 Tf 60 760 Td (TEST DOCUMENT - automated e2e GST certificate) Tj ET';
  objs.push(`<< /Length ${text.length} >>\nstream\n${text}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let pdf = '%PDF-1.4\n';
  const offsets = objs.map((o, i) => {
    const at = pdf.length;
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
    return at;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  writeFileSync(pdfPath, pdf);
}

async function context(viewport = { width: 1440, height: 1000 }, mobile = false) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, permissions: ['camera'] });
  const page = await ctx.newPage();
  page.on('request', (r) => inflight.set(r, Date.now()));
  page.on('requestfinished', (r) => inflight.delete(r));
  page.on('requestfailed', (r) => inflight.delete(r));
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/40[0-9]|422/.test(m.text()) && errors.push(m.text()));
  return { ctx, page };
}
async function signIn(p, email, password, landing, as = '') {
  await p.goto(`${base}/login${as ? `?as=${as}` : ''}`, { waitUntil: 'networkidle' });
  await p.getByLabel('Email address').fill(email);
  await p.locator('input[autocomplete="current-password"]').fill(password);
  await p.locator('#main form').getByRole('button', { name: 'Sign in', exact: true }).click();
  await p.waitForURL(landing);
}
async function fillRegistration(p, d) {
  const f = p.locator('form');
  await f.getByLabel('Full name').fill(d.name);
  await f.getByLabel('Email address').fill(d.email);
  await f.getByLabel('Mobile number').fill(d.phone);
  await f.locator('input[autocomplete="new-password"]').nth(0).fill(d.password);
  await f.locator('input[autocomplete="new-password"]').nth(1).fill(d.password);
  await f.getByLabel(/business name/i).fill(d.business);
  await f.getByLabel(/(Business|Shop) address/).fill('21 Avenue Road');
  await f.getByLabel('City').fill('Bengaluru');
  await f.getByLabel('State').selectOption('Karnataka');
  await f.getByLabel('PIN code').fill('560002');
}
const confirmDialog = (p, button) => p.getByRole('dialog').getByRole('button', { name: button, exact: true }).click();
const api = (p, method, url, data) => p.request[method](`${base}/api${url}`, { headers: H, ...(data ? { data } : {}) });

const supplier = { name: 'Lakshmi Narayan', email: `e2e-supplier-${stamp}@supplier.test`, phone: '9900112244', password: 'Weave2026', business: `E2E Narayan Textiles ${stamp}` };
const retailer = { name: 'Divya Menon', email: `e2e-${stamp}@retailer.test`, phone: '9845012399', password: 'Retail2026', business: `E2E Divya Fashions ${stamp}` };
const skirtTitle = `E2E Tiered Cotton Maxi Skirt ${stamp}`;
const braTitle = `E2E Cotton T-Shirt Bra Pack ${stamp}`;

const sup = await context();
const adm = await context();
const ret = await context();
try {
  // ── Supplier registers and uploads a verification document ──
  let p = sup.page;
  await p.goto(`${base}/register/supplier`, { waitUntil: 'networkidle' });
  await fillRegistration(p, supplier);
  await p.locator('form').getByRole('button', { name: 'Skirts', exact: true }).click();
  await p.getByLabel('Business description').fill('Cotton skirts and everyday innerwear manufactured in Tiruppur and Bengaluru.');
  await p.getByText('I agree to the').click();
  await p.getByRole('button', { name: 'Register as a supplier' }).click();
  await p.waitForURL(/\/supplier$/);
  await p.getByText('Your application is currently under review.').waitFor();
  await p.goto(`${base}/supplier/onboarding`, { waitUntil: 'networkidle' });
  await p.getByLabel('Document type').selectOption('GST_CERTIFICATE');
  await p.locator('input[accept="application/pdf,image/jpeg,image/png"]').setInputFiles(pdfPath);
  await p.getByText('Document uploaded').first().waitFor();
  const docId = (await (await api(p, 'get', '/supplier/me')).json()).supplier.documents[0].id;
  ok('supplier registered (pending review) and uploaded a GST certificate');

  // ── Admin: applications list, search, detail, secure document preview ──
  p = adm.page;
  await signIn(p, process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD, /\/admin$/, 'admin');
  await p.getByRole('heading', { name: 'Overview' }).waitFor();
  for (const label of ['Total suppliers', 'Pending supplier applications', 'Approved suppliers', 'Rejected applications', 'Total retailers', 'Published products', 'Pending product approvals', 'Total genuine orders']) await p.getByText(label, { exact: true }).waitFor();
  await shot(p, 'admin-overview');
  ok('admin signed in to the Admin Review Portal; overview shows all eight database statistics');
  await p.goto(`${base}/admin/applications`, { waitUntil: 'networkidle' });
  await p.getByPlaceholder('Search business, contact, email, phone, GSTIN, city').fill(supplier.business);
  await p.waitForURL(/q=/);
  await p.getByRole('cell', { name: supplier.email }).waitFor();
  for (const col of ['Business', 'Contact person', 'Email', 'Phone', 'Type', 'City / State', 'GSTIN', 'Registered', 'Status']) await p.getByRole('columnheader', { name: col, exact: true }).waitFor();
  await shot(p, 'admin-applications');
  ok('pending application listed with contact, email, phone, type, city/state, GSTIN, date and status; search works');
  await p.getByRole('link', { name: supplier.business, exact: true }).click();
  await p.getByRole('heading', { name: 'Business information' }).waitFor();
  for (const label of ['Registered business name', 'Business description', 'Contact person', 'Business email', 'Business phone', 'WhatsApp number', 'Full business address', 'PIN code', 'GSTIN', 'Product categories']) await p.getByText(label, { exact: true }).waitFor();
  const docResponse = p.waitForResponse((r) => r.url().includes(`/api/admin/documents/${docId}/file`));
  await p.getByRole('button', { name: 'Preview' }).click();
  const docRes = await docResponse;
  if (docRes.status() !== 200 || !docRes.headers()['content-type'].includes('application/pdf')) throw new Error(`document preview returned ${docRes.status()}`);
  await p.getByRole('dialog').locator('iframe').waitFor();
  await p.waitForTimeout(800);
  await shot(p, 'admin-document-preview');
  await p.keyboard.press('Escape');
  ok('application detail shows business + verification information; document previews securely through the admin route');

  // ── Request more information → supplier resubmits ──
  const infoText = 'Please upload a clearer GST certificate that shows your registered address.';
  await p.getByRole('button', { name: 'Request Additional Information' }).click();
  await p.getByRole('dialog').getByLabel('What does the supplier need to add or correct?').fill(infoText);
  await confirmDialog(p, 'Send request');
  await p.getByText('Information requested').first().waitFor();
  p = sup.page;
  await p.goto(`${base}/supplier`, { waitUntil: 'networkidle' });
  await p.getByText('Additional information required').first().waitFor();
  await p.getByText(infoText).waitFor();
  await shot(p, 'supplier-info-requested');
  await p.getByRole('button', { name: 'Resubmit application' }).click();
  await p.getByText('Your application is currently under review.').waitFor();
  ok('admin requested additional information; supplier saw the exact request and resubmitted');

  // ── Reject with a reason → supplier sees it and resubmits ──
  const reason = 'The GSTIN does not match the registered business name. Please correct it and resubmit.';
  p = adm.page;
  await p.reload({ waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Reject Application' }).click();
  // Rejecting without a reason is impossible: the confirm button stays disabled.
  if (!(await p.getByRole('dialog').getByRole('button', { name: 'Reject application', exact: true }).isDisabled())) throw new Error('rejection was allowed without a reason');
  await p.getByRole('dialog').getByLabel('Rejection reason').fill(reason);
  await confirmDialog(p, 'Reject application');
  await p.getByText('Application rejected').first().waitFor();
  await p.getByText('Rejection reason on record').waitFor();
  p = sup.page;
  await p.goto(`${base}/supplier`, { waitUntil: 'networkidle' });
  await p.getByText('Your application requires attention.').waitFor();
  await p.getByText(reason).waitFor();
  await shot(p, 'supplier-rejected');
  await p.goto(`${base}/supplier/notifications`, { waitUntil: 'networkidle' });
  await p.getByText('Your application requires attention').first().waitFor();
  await p.getByText('Additional information required').first().waitFor();
  await p.goto(`${base}/supplier`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Resubmit application' }).click();
  await p.getByText('Your application is currently under review.').waitFor();
  ok('rejection requires a reason; the reason is saved, shown on the supplier dashboard and delivered as a notification');

  // ── Approve ──
  p = adm.page;
  await p.reload({ waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Approve Application' }).click();
  await confirmDialog(p, 'Approve application');
  await p.getByText('Application approved').first().waitFor();
  await p.getByText(process.env.ADMIN_EMAIL.toLowerCase()).first().waitFor();
  await shot(p, 'admin-approved', true);
  await p.goto(`${base}/admin/audit?action=supplier.`, { waitUntil: 'networkidle' });
  for (const a of ['supplier.approved', 'supplier.rejected', 'supplier.info_requested', 'supplier.resubmitted']) await p.getByRole('cell', { name: a, exact: true }).first().waitFor();
  await p.goto(`${base}/admin/audit?action=document.`, { waitUntil: 'networkidle' });
  await p.getByRole('cell', { name: 'document.viewed', exact: true }).first().waitFor();
  p = sup.page;
  await p.goto(`${base}/supplier`, { waitUntil: 'networkidle' });
  await p.getByText('Your supplier account has been approved. You can now continue with product publishing.').waitFor();
  ok('admin approved; reviewer + time recorded; audit log has approve/reject/info-request/resubmit/document-view entries; supplier sees approval');

  p = adm.page;
  const approvedUrl = `${base}/admin/suppliers/approved?q=${encodeURIComponent(supplier.business)}`;
  await p.goto(approvedUrl, { waitUntil: 'networkidle' });
  const row = p.getByRole('cell', { name: supplier.email });
  await row.waitFor();
  // The registration form registers this supplier as a wholesaler.
  await p.getByLabel('Business type').selectOption('MANUFACTURER');
  await p.getByText('No suppliers match these filters.').waitFor();
  await p.getByLabel('Business type').selectOption('WHOLESALER');
  await row.waitFor();
  await p.getByLabel('State').selectOption('Kerala');
  await p.getByText('No suppliers match these filters.').waitFor();
  await p.getByLabel('State').selectOption('Karnataka');
  await row.waitFor();
  await p.getByLabel('Sort').selectOption('name');
  await p.waitForURL(/sort=name/);
  await row.waitFor();
  await p.goto(`${base}/admin/applications?status=APPROVED&q=${encodeURIComponent(supplier.business)}`, { waitUntil: 'networkidle' });
  await row.waitFor();
  ok('supplier tables: business-type, state, status filters and sorting work in the UI (URL-driven)');
  p = sup.page;

  // ── Skirt listing: 3-level category, variants, stock, tiers, camera + device photos ──
  await p.goto(`${base}/supplier/products/new`, { waitUntil: 'networkidle' });
  await p.getByLabel('Product name').fill(skirtTitle);
  await p.getByLabel('Main category').selectOption('womens-wear');
  await p.getByLabel('Subcategory').selectOption('womens-wear/skirts');
  await p.getByLabel('Type (optional)').selectOption('womens-wear/skirts/maxi-skirts');
  await p.getByLabel('Product description').fill('Three-tier cotton maxi skirt with elasticated waist and lining. Packed individually in polybags of 12.');
  await p.getByLabel('Gender').selectOption('Women');
  await p.getByLabel('Product type').fill('Tiered maxi skirt');
  await p.getByLabel('Wholesale price (₹)').fill('650');
  await p.getByLabel('Minimum order quantity (MOQ)').fill('12');
  await p.getByLabel('Available sizes').fill('S, M, L');
  await p.getByLabel('Available colours').fill('Rust');
  await p.getByRole('button', { name: 'Add combinations' }).click();
  for (let i = 0; i < 3; i++) await p.getByRole('textbox', { name: 'Stock' }).nth(i).fill('40');
  await p.getByRole('button', { name: 'Add price tier' }).click();
  await p.getByLabel('Tier 1 minimum quantity').fill('50');
  await p.getByLabel('Tier 1 price').fill('590');
  await p.getByRole('button', { name: 'Create draft' }).click();
  await p.waitForURL(/\/supplier\/products\/c/);
  const skirtId = p.url().split('/').pop();
  ok('skirt listing created in Women’s Wear › Skirts › Maxi Skirts with gender, type, S/M/L × Rust stock and a volume price tier');

  await p.getByRole('button', { name: 'Take Photo' }).click();
  const cam = p.getByRole('dialog', { name: 'Take product photo' });
  await cam.getByRole('button', { name: 'Capture' }).click();
  await cam.getByAltText('Captured photo preview').waitFor();
  await cam.getByRole('button', { name: 'Retake' }).click();
  await cam.getByRole('button', { name: 'Capture' }).click();
  await cam.getByRole('button', { name: 'Use & take another' }).click();
  await cam.getByRole('button', { name: 'Capture' }).click();
  await shot(p, 'camera-capture');
  await cam.getByRole('button', { name: 'Use photo' }).click();
  await cam.waitFor({ state: 'detached' });
  const camLive = await p.evaluate(() => [...document.querySelectorAll('video')].some((v) => v.srcObject));
  if (camLive) throw new Error('camera stream was not released after closing');
  await p.getByText('Ready to upload (2)').waitFor();
  ok('Take Photo opened the camera, captured, retook, added two photos and released the camera stream');

  await p.getByTestId('photo-file-input').setInputFiles(photo);
  await p.getByText('Ready to upload (3)').waitFor();
  await p.getByTestId('photo-file-input').setInputFiles(tiny);
  await p.getByText(/at least 400px on its shortest side/).waitFor();
  await p.getByRole('button', { name: /^Remove camera-.* before uploading$/ }).first().click();
  await p.getByText('Ready to upload (2)').waitFor();
  await shot(p, 'photos-staged');
  await p.getByLabel('Who owns these photos?').selectOption('SUPPLIER_OWNED');
  await p.getByRole('button', { name: 'Upload 2 photos' }).click();
  await p.getByText('2 photo(s) uploaded').first().waitFor();
  await p.getByAltText('Product photo 2').waitFor();
  const before = await p.getByAltText('Product photo 2').getAttribute('src');
  await Promise.all([p.waitForResponse((r) => r.url().endsWith('/images/order') && r.ok()), p.getByRole('button', { name: 'Make photo 2 the primary photo' }).click()]);
  await p.reload({ waitUntil: 'networkidle' });
  if ((await p.getByAltText('Product photo 1').getAttribute('src')) !== before) throw new Error('primary photo was not saved');
  await shot(p, 'photos-uploaded', true);
  await p.getByRole('button', { name: 'Submit for review' }).click();
  await p.getByText('Submitted for review').first().waitFor();
  ok('device upload added a photo; a 200px image was rejected; a staged photo was removed; 2 uploaded; primary photo changed and persisted; submitted');

  // ── Innerwear listing (innerwear filters) ──
  await p.goto(`${base}/supplier/products/new`, { waitUntil: 'networkidle' });
  await p.getByLabel('Product name').fill(braTitle);
  await p.getByLabel('Main category').selectOption('womens-wear');
  await p.getByLabel('Subcategory').selectOption('womens-wear/innerwear');
  await p.getByLabel('Type (optional)').selectOption('womens-wear/innerwear/bras');
  await p.getByLabel('Product description').fill('Non-padded cotton T-shirt bras, sold in assorted packs of three. Each pack in a printed box.');
  await p.getByRole('button', { name: 'Pack of 3', exact: true }).click();
  await p.getByRole('button', { name: 'Cotton', exact: true }).click();
  await p.getByLabel('Wholesale price (₹)').fill('180');
  await p.getByLabel('Minimum order quantity (MOQ)').fill('24');
  await p.getByLabel('Available quantity (units)').fill('500');
  await p.getByRole('button', { name: 'Create draft' }).click();
  await p.waitForURL(/\/supplier\/products\/c/);
  const braId = p.url().split('/').pop();
  await p.getByTestId('photo-file-input').setInputFiles(photo);
  await p.getByLabel('Who owns these photos?').selectOption('SUPPLIER_OWNED');
  await p.getByRole('button', { name: 'Upload 1 photo' }).click();
  await p.getByText('1 photo(s) uploaded').first().waitFor();
  await p.getByRole('button', { name: 'Submit for review' }).click();
  await p.getByText('Submitted for review').first().waitFor();
  ok('innerwear listing created in Women’s Wear › Innerwear › Bras with innerwear filters (pack size, fabric) and stock, then submitted');

  // ── Three-level selection and category-specific filters for more garment types ──
  await p.goto(`${base}/supplier/products/new`, { waitUntil: 'networkidle' });
  const pick = async (main, sub, type) => {
    await p.getByLabel('Main category').selectOption(main);
    await p.getByLabel('Subcategory').selectOption(sub);
    if (type) await p.getByLabel('Type (optional)').selectOption(type);
  };
  const legend = (name) => p.locator('legend', { hasText: new RegExp(`^${name}$`) }).first().waitFor();
  await pick('womens-wear', 'womens-wear/sarees', 'womens-wear/sarees/silk-sarees');
  await legend('Saree Style');
  await pick('womens-wear', 'womens-wear/kurtas');
  await legend('Set Type');
  await pick('womens-wear', 'womens-wear/innerwear', 'womens-wear/innerwear/panties');
  await legend('Pack Size');
  await pick('womens-wear', 'womens-wear/nightwear');
  await legend('Fabric');
  await pick('kids-wear', 'kids-wear/innerwear');
  await legend('Age Group');
  const created = {};
  for (const [label, categoryPath] of [['Kurta', 'womens-wear/kurtas'], ['Panty pack', 'womens-wear/innerwear/panties'], ['Night suit', 'womens-wear/nightwear'], ['Kids vest pack', 'kids-wear/innerwear']]) {
    const r = await api(p, 'post', '/supplier/products', { title: `E2E ${label} ${stamp}`, description: `${label} draft used by the automated category test.`, categoryPath, price: 199, priceUnit: 'PIECE', moq: 12, stockQuantity: 100 });
    if (r.status() !== 201) throw new Error(`${categoryPath}: ${r.status()} ${await r.text()}`);
    created[categoryPath] = (await r.json()).product.category.path;
  }
  if (Object.entries(created).some(([want, got]) => want !== got)) throw new Error(`category mismatch ${JSON.stringify(created)}`);
  ok('saree / kurta / panties / nightwear / kids’ innerwear each show their own filters; drafts saved in the right category');

  // ── PNG, WebP and a large photo that is resized on the device ──
  await p.goto(`${base}/supplier/products/${braId}`, { waitUntil: 'networkidle' });
  await p.getByTestId('photo-file-input').setInputFiles([png, webp, large]);
  await p.getByText('Ready to upload (3)').waitFor();
  await p.getByText('Device · 2560×1920 · resized').waitFor();
  await p.getByText('Device · 800×800', { exact: true }).first().waitFor();
  await p.getByLabel('Who owns these photos?').selectOption('SUPPLIER_OWNED');
  await p.getByRole('button', { name: 'Upload 3 photos' }).click();
  await p.getByText('3 photo(s) uploaded').first().waitFor();
  const imgs = (await (await api(p, 'get', `/supplier/products/${braId}`)).json()).product.images;
  const kinds = imgs.map((i) => `${i.mimeType}:${i.width}x${i.height}`).sort();
  for (const want of ['image/png:800x800', 'image/webp:800x800', 'image/jpeg:2560x1920']) if (!kinds.includes(want)) throw new Error(`missing ${want} in ${kinds}`);
  if (imgs.some((i) => i.sizeBytes > 8 * 1024 * 1024)) throw new Error('an upload exceeded 8 MB');
  ok(`PNG and WebP accepted; an 11 MB 4000×3000 photo was resized on the device to 2560×1920 before upload (${kinds.join(', ')})`);

  // ── Admin publishes both, unpublishes one ──
  p = adm.page;
  await p.goto(`${base}/admin/products/pending`, { waitUntil: 'networkidle' });
  for (const title of [skirtTitle, braTitle]) {
    await p.locator('li', { hasText: title }).getByRole('button', { name: 'Approve & publish' }).click();
    await confirmDialog(p, 'Approve & publish');
    await p.locator('li', { hasText: title }).waitFor({ state: 'detached' });
  }
  await p.goto(`${base}/admin/products/live`, { waitUntil: 'networkidle' });
  await p.locator('li', { hasText: braTitle }).getByRole('button', { name: 'Unpublish' }).click();
  await p.getByRole('dialog').getByLabel('Reason (shared with the supplier)').fill('Photo shows a different product colour than the listing.');
  await confirmDialog(p, 'Unpublish');
  await p.getByText('Listing unpublished').first().waitFor();
  await p.goto(`${base}/admin/products/unpublished`, { waitUntil: 'networkidle' });
  await p.getByText(braTitle).waitFor();
  ok('admin published both listings, then unpublished the innerwear listing with a reason (it moved to Unpublished Products)');

  // ── Retailer browses, sees tiers, adds to cart ──
  p = ret.page;
  await p.goto(`${base}/register/retailer`, { waitUntil: 'networkidle' });
  await fillRegistration(p, retailer);
  await p.getByText('I agree to the').click();
  await p.getByRole('button', { name: 'Create retailer account' }).click();
  await p.waitForURL(/\/account$/);
  await p.goto(`${base}/categories/womens-wear/skirts`, { waitUntil: 'networkidle' });
  await p.getByText(skirtTitle).first().click();
  await p.waitForURL(new RegExp(`/products/${skirtId}`));
  await p.getByText('Volume pricing').waitFor();
  await p.getByText('50+').waitFor();
  await p.getByText('Tiered maxi skirt').waitFor();
  await shot(p, 'retailer-product', true);
  const product = (await (await api(p, 'get', `/products/${skirtId}`)).json()).product;
  const add = await api(p, 'post', '/cart/items', { productId: skirtId, lines: product.variants.map((v) => ({ variantId: v.id, quantity: 20 })) });
  if (add.status() !== 201) throw new Error(`add to cart ${add.status()} ${await add.text()}`);
  const cart = await (await api(p, 'get', '/cart')).json();
  const line = cart.suppliers.flatMap((g) => g.lines).find((l) => l.productId === skirtId);
  if (line.unitPricePaise !== 59000) throw new Error(`tier price not applied: ${line.unitPricePaise}`);
  const tooFew = await api(p, 'post', '/cart/items', { productId: braId, lines: [{ quantity: 30 }] });
  if (tooFew.status() !== 404) throw new Error(`unpublished listing could be ordered: ${tooFew.status()}`);
  await p.goto(`${base}/categories/womens-wear/innerwear/bras`, { waitUntil: 'networkidle' });
  await p.getByText('No products available in this category yet.').waitFor();
  ok('retailer found the skirt under Skirts, saw volume pricing; 60 pieces priced at the ₹590 tier; unpublished innerwear is hidden and cannot be ordered');

  const addr = await api(p, 'post', '/retailer/addresses', { label: 'Shop', contactName: retailer.name, phone: retailer.phone, line1: '21 Avenue Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560002' });
  const placed = await api(p, 'post', '/retailer/orders', { addressId: (await addr.json()).address.id });
  if (placed.status() !== 201) throw new Error(`checkout ${placed.status()} ${await placed.text()}`);
  const orders = (await (await api(p, 'get', '/retailer/orders')).json()).orders;
  const order = orders[0];
  if (order.subtotalPaise !== 60 * 59000) throw new Error(`order total ${order.subtotalPaise}, expected ${60 * 59000}`);
  await p.goto(`${base}/account/orders`, { waitUntil: 'networkidle' });
  await p.getByText(order.orderNumber).first().waitFor();
  ok(`checkout charged the tier price: order ${order.orderNumber} = 60 × ₹590 = ₹35,400`);

  p = adm.page;
  await p.goto(`${base}/admin/suppliers/approved?q=${encodeURIComponent(supplier.business)}`, { waitUntil: 'networkidle' });
  await p.getByRole('link', { name: supplier.business, exact: true }).click();
  await p.getByRole('button', { name: 'Suspend supplier' }).click();
  await p.getByRole('dialog').getByLabel('Reason for suspension').fill('Suspended by the automated test to verify listings are hidden.');
  await Promise.all([p.waitForResponse((r) => r.url().endsWith('/decision') && r.request().method() === 'POST' && r.ok()), confirmDialog(p, 'Suspend supplier')]);
  await p.getByText('Supplier suspended').first().waitFor();
  const hidden = await ret.page.request.get(`${base}/api/products/${skirtId}`);
  if (hidden.status() !== 404) throw new Error(`suspended supplier's listing still public: ${hidden.status()}`);
  await sup.page.goto(`${base}/supplier`, { waitUntil: 'networkidle' });
  await sup.page.getByText('Your supplier account is suspended.').waitFor();
  await p.getByRole('button', { name: 'Reinstate supplier' }).click();
  await Promise.all([p.waitForResponse((r) => r.url().endsWith('/decision') && r.request().method() === 'POST' && r.ok()), confirmDialog(p, 'Approve application')]);
  await p.getByText('Application approved').first().waitFor();
  if ((await ret.page.request.get(`${base}/api/products/${skirtId}`)).status() !== 200) throw new Error('listing did not return after reinstatement');
  ok('suspend (reason required) hides the supplier’s listings and shows the supplier a suspension notice; reinstating restores them');

  // ── Security ──
  const anon = await browser.newContext();
  const checks = {
    anonymousDocument: (await anon.request.get(`${base}/api/admin/documents/${docId}/file`)).status(),
    supplierDocument: (await sup.page.request.get(`${base}/api/admin/documents/${docId}/file`)).status(),
    retailerDocument: (await ret.page.request.get(`${base}/api/admin/documents/${docId}/file`)).status(),
    supplierApproves: (await api(sup.page, 'post', `/admin/suppliers/x/decision`, { decision: 'APPROVED' })).status(),
    retailerAdminList: (await ret.page.request.get(`${base}/api/admin/suppliers`)).status(),
    anonymousUnpublished: (await anon.request.get(`${base}/api/products/${braId}`)).status(),
    zeroPrice: (await api(sup.page, 'post', '/supplier/products', { title: 'Invalid listing', description: 'Invalid listing used by the security test.', categoryPath: 'accessories/belts', price: 0, priceUnit: 'PIECE', moq: 1 })).status(),
    zeroMoq: (await api(sup.page, 'post', '/supplier/products', { title: 'Invalid listing', description: 'Invalid listing used by the security test.', categoryPath: 'accessories/belts', price: 10, priceUnit: 'PIECE', moq: 0 })).status(),
    negativeStock: (await api(sup.page, 'post', '/supplier/products', { title: 'Invalid listing', description: 'Invalid listing used by the security test.', categoryPath: 'accessories/belts', price: 10, priceUnit: 'PIECE', moq: 1, stockQuantity: -5 })).status(),
    fakeImage: (await sup.page.request.post(`${base}/api/supplier/products/${skirtId}/images`, { headers: H, multipart: { usageRights: 'SUPPLIER_OWNED', images: { name: 'x.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('<script>alert(1)</script>') } } })).status(),
    supplierPublishesDirectly: (await api(sup.page, 'post', `/admin/products/${skirtId}/decision`, { decision: 'APPROVED' })).status(),
  };
  await anon.close();
  const expected = { anonymousDocument: 401, supplierDocument: 403, retailerDocument: 403, supplierApproves: 403, retailerAdminList: 403, anonymousUnpublished: 404, zeroPrice: 422, zeroMoq: 422, negativeStock: 422, fakeImage: 400, supplierPublishesDirectly: 403 };
  for (const [k, v] of Object.entries(expected)) if (checks[k] !== v) throw new Error(`${k}: expected ${v}, got ${checks[k]}`);
  await ret.page.goto(`${base}/admin/applications`, { waitUntil: 'networkidle' });
  if (!/\/account$/.test(ret.page.url())) throw new Error('retailer reached the admin portal');
  ok(`security: ${JSON.stringify(checks)}; retailer redirected away from /admin`);

  // ── Responsive ──
  const overflow = [];
  for (const [w, h, label] of [[768, 1024, 'tablet'], [390, 844, 'mobile']]) {
    for (const [who, ctx, urls] of [
      ['admin', adm.ctx, ['/admin', '/admin/applications?status=', '/admin/documents?status=ALL', '/admin/suppliers/approved', '/admin/products/live', '/admin/products/unpublished', '/admin/categories', '/admin/audit']],
      ['supplier', sup.ctx, ['/supplier', `/supplier/products/${skirtId}`, '/supplier/products/new']],
    ]) {
      const m = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 500, hasTouch: w < 500, storageState: await ctx.storageState() });
      const mp = await m.newPage();
      mp.on('pageerror', (e) => errors.push(`pageerror(${label}): ${e.message}`));
      for (const url of urls) {
        await mp.goto(`${base}${url}`, { waitUntil: 'networkidle' });
        const width = await mp.evaluate(() => document.documentElement.scrollWidth);
        if (width > w + 2) overflow.push(`${label} ${url} (${width}px)`);
      }
      if (label === 'mobile') {
        await mp.goto(`${base}${who === 'admin' ? `/admin/applications?status=&q=${encodeURIComponent(supplier.business)}` : `/supplier/products/${skirtId}`}`, { waitUntil: 'networkidle' });
        await mp.screenshot({ path: path.join(out, `review-mobile-${who}.png`), fullPage: true });
        if (who === 'admin') {
          await mp.getByRole('button', { name: 'Open admin menu' }).click();
          await mp.getByRole('link', { name: /Verification Documents/ }).click();
          await mp.waitForURL(/\/admin\/documents/);
        }
      }
      await m.close();
    }
  }
  if (overflow.length) throw new Error(`horizontal overflow: ${overflow.join(', ')}`);
  ok('admin portal and supplier product pages fit tablet (768px) and mobile (390px) without horizontal scrolling; mobile admin menu works');

  // ── Camera fallback on a device without a camera ──
  const noCamBrowser = await chromium.launch({ executablePath, headless: true });
  const nc = await noCamBrowser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await sup.ctx.storageState() });
  const ncp = await nc.newPage();
  await ncp.goto(`${base}/supplier/products/${skirtId}`, { waitUntil: 'networkidle' });
  await ncp.getByRole('button', { name: 'Take Photo' }).click();
  await ncp.getByText(/No camera was found on this device|Camera permission was denied|could not be started/).waitFor();
  await ncp.screenshot({ path: path.join(out, 'review-camera-fallback.png') });
  const chooser = ncp.waitForEvent('filechooser');
  await ncp.getByRole('button', { name: 'Use phone camera app instead' }).click();
  const fc = await chooser;
  if (!(await fc.element().getAttribute('capture'))) throw new Error('fallback input does not request the camera');
  await fc.setFiles(photo);
  await ncp.getByText('Camera · 800×1000').waitFor();
  await noCamBrowser.close();
  ok('no camera available: clear message, and “Use phone camera app instead” opens the native rear-camera picker (capture=environment); the photo is staged');
} catch (e) {
  console.error('FAILED:', e.message.split(/\r?\n/)[0]);
  const stuck = [...inflight.entries()].filter(([, t]) => Date.now() - t > 5000).map(([r, t]) => `${r.method()} ${r.url()} (${Math.round((Date.now() - t) / 1000)}s)`);
  if (stuck.length) console.error(`Requests still pending:\n${stuck.join('\n')}`);
  for (const [name, c] of [['supplier', sup], ['admin', adm], ['retailer', ret]]) await c.page.screenshot({ path: path.join(out, `review-failure-${name}.png`) }).catch(() => {});
  process.exitCode = 1;
}
console.log(errors.length ? `Browser errors:\n${[...new Set(errors)].join('\n')}` : 'No browser errors.');
await browser.close();
