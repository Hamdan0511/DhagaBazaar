#!/usr/bin/env node
/**
 * Dhaaga Bazaar AI Studio acceptance run against the REAL Gemini API configured in server/.env
 * (real Chrome with Chrome's simulated camera, running dev servers, dev DB).
 *
 *   node scripts/e2e-ai-studio.mjs <outDir> <garment-photo.jpg> <second-photo.jpg>
 *   then: npm run e2e:cleanup
 *
 * It reports what the live API actually returned. If image generation is refused (for example a
 * Gemini quota of 0 on a free-tier key), the run checks that the supplier sees an honest error and
 * that nothing was attached to the listing — it never treats that as a successful enhancement.
 * Records use e2e-supplier-*@supplier.test so `npm run e2e:cleanup` removes them (and their AI files).
 */
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const [out = 'e2e-shots', photo, photo2] = process.argv.slice(2);
if (!photo || !photo2) {
  console.error('Usage: node scripts/e2e-ai-studio.mjs <outDir> <garment-photo.jpg> <second-photo.jpg>');
  process.exit(1);
}
mkdirSync(out, { recursive: true });
const base = process.env.BASE_URL ?? 'http://localhost:5173';
const executablePath = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((p) => p && existsSync(p));
const browser = await chromium.launch({ executablePath, headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const errors = [];
let n = 0;
const ok = (m) => console.log(`✓ ${String(++n).padStart(2, '0')} ${m}`);
const note = (m) => console.log(`  · ${m}`);
const stamp = Date.now();
const shot = (p, name, full = false) => p.screenshot({ path: path.join(out, `ai-${name}.png`), fullPage: full });
const api = (p, method, url, body) =>
  p.evaluate(
    async ([m, u, b]) => {
      const r = await fetch(`/api${u}`, { method: m, credentials: 'include', headers: { 'X-Requested-With': 'dhaaga', ...(b ? { 'Content-Type': 'application/json' } : {}) }, body: b ? JSON.stringify(b) : undefined });
      return { status: r.status, body: await r.json().catch(() => null) };
    },
    [method, url, body],
  );

// Same simulated camera, but no auto-accept: camera permission is refused (as when a supplier taps "Block").
const strictBrowser = await chromium.launch({ executablePath, headless: true, args: ['--use-fake-device-for-media-stream'] });

async function context(viewport = { width: 1440, height: 1000 }, mobile = false, permissions = ['camera'], b = browser) {
  const ctx = await b.newContext({ viewport, isMobile: mobile, hasTouch: mobile, permissions });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/the server responded with a status of (40\d|42\d|429|50[23])/.test(m.text()) && errors.push(m.text()));
  page.on('response', (r) => r.url().includes('/api/') && r.status() === 500 && errors.push(`500 ${r.url()}`));
  return { ctx, page };
}

try {
  const { page: p } = await context();
  // ── Supplier account (registered through the real API) and a draft listing ──
  await p.goto(`${base}/`, { waitUntil: 'networkidle' });
  const reg = await api(p, 'POST', '/auth/register', {
    fullName: 'Kavya Iyer', phone: '9845011122', password: 'Weave2026', confirmPassword: 'Weave2026', city: 'Tiruppur', state: 'Tamil Nadu', pincode: '641601', addressLine: '4 Knitwear Street', acceptTerms: true,
    email: `e2e-supplier-ai-${stamp}@supplier.test`, businessName: `E2E Kavya Knits ${stamp}`, businessType: 'MANUFACTURER', categoryPaths: ['mens-wear/t-shirts'], description: 'Cotton knit T-shirts for wholesale buyers.',
  });
  if (reg.status !== 201) throw new Error(`registration failed: ${reg.status} ${JSON.stringify(reg.body)}`);
  const draft = await api(p, 'POST', '/supplier/products', { title: 'Plain White Cotton T-Shirt', description: 'Half-sleeve crew-neck white cotton T-shirts, sold in bulk.', categoryPath: 'mens-wear/t-shirts', price: 180, priceUnit: 'PIECE', moq: 20 });
  const productId = draft.body.product.id;
  ok('e2e supplier registered (pending review) and created a draft T-shirt listing');

  // ── Sidebar entry and AI Studio page ──
  await p.goto(`${base}/supplier`, { waitUntil: 'networkidle' });
  await p.getByRole('link', { name: 'Dhaaga Bazaar AI Studio' }).first().click();
  await p.waitForURL(/\/supplier\/ai-studio$/);
  await p.getByRole('heading', { name: 'Dhaaga Bazaar AI Studio' }).waitFor();
  await p.getByRole('link', { name: 'Back to Supplier Dashboard' }).waitFor();
  const status = await api(p, 'GET', '/supplier/ai/status');
  if (!status.body.configured) throw new Error('GEMINI_API_KEY is not configured on the API');
  ok(`"Dhaaga Bazaar AI Studio" is in the supplier sidebar and opens /supplier/ai-studio (AI configured: ${status.body.imageModel} + ${status.body.analysisModel})`);

  // ── Camera capture inside the studio (Chrome's simulated camera) ──
  await p.getByRole('button', { name: 'Take Photo' }).click();
  const cam = p.getByRole('dialog', { name: 'Take garment photo' });
  await cam.getByRole('button', { name: 'Capture' }).click();
  await cam.getByRole('button', { name: 'Retake' }).click();
  await cam.getByRole('button', { name: 'Capture' }).click();
  await cam.getByRole('button', { name: 'Use photo' }).click();
  await cam.waitFor({ state: 'hidden' });
  await p.getByRole('img', { name: 'Original photograph' }).waitFor();
  const live = await p.evaluate(() => [...document.querySelectorAll('video')].filter((v) => v.srcObject).length);
  if (live !== 0) throw new Error('camera stream still attached after closing');
  ok('Take Photo in AI Studio: live camera, capture, retake, use photo → original stored; camera released');

  // ── Inside Add/Edit Product: "Enhance with Dhaaga Bazaar AI" without leaving the listing ──
  await p.goto(`${base}/supplier/products/${productId}`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Enhance with Dhaaga Bazaar AI' }).click();
  const studio = p.getByRole('dialog', { name: 'Dhaaga Bazaar AI Studio' });
  await studio.getByTestId('ai-file-input').setInputFiles(photo);
  await studio.getByRole('img', { name: 'Original photograph' }).waitFor({ timeout: 30_000 });
  ok('Add New Product → "Enhance with Dhaaga Bazaar AI" opens the studio in place; gallery photo uploaded as the original');

  // ── REAL Gemini analysis ──
  const t0 = Date.now();
  // Like a supplier, press "Analyse photo" again if Google reports a temporary failure (max 3 attempts).
  for (let attempt = 1; ; attempt++) {
    const [resp] = await Promise.all([p.waitForResponse((r) => r.url().includes('/analyse'), { timeout: 200_000 }), studio.getByRole('button', { name: 'Analyse photo' }).click()]);
    if (resp.ok()) break;
    const body = await resp.json().catch(() => ({}));
    note(`analysis attempt ${attempt}: HTTP ${resp.status()} ${body.error?.code} — "${body.error?.message}"`);
    if (attempt === 3) throw new Error('Gemini analysis unavailable after 3 attempts');
    await p.waitForTimeout(15_000);
  }
  await studio.getByLabel('Garment type').waitFor({ timeout: 30_000 });
  const garment = await studio.getByLabel('Garment type').inputValue();
  const colour = await studio.getByLabel('Main colour').inputValue();
  await shot(p, 'analysis', true);
  ok(`REAL Gemini analysis in ${((Date.now() - t0) / 1000).toFixed(1)}s → garment "${garment}", colour "${colour}"`);
  if (!/shirt|tee|t-shirt/i.test(garment) || !/white/i.test(colour)) note(`analysis did not match a white T-shirt exactly: "${garment}" / "${colour}"`);
  await studio.getByLabel('Garment type').fill('Half-sleeve crew-neck T-shirt');
  ok('supplier corrected the detected garment type');

  // ── Settings: backgrounds and options ──
  for (const label of ['Pure White Studio', 'Warm Ivory Studio', 'Premium Beige Studio', 'Light Grey Studio', 'Soft Neutral Studio']) await studio.getByText(label, { exact: true }).waitFor();
  await studio.getByText('Premium Beige Studio', { exact: true }).click();
  await studio.getByLabel('Enhancement', { exact: true }).selectOption('FULL');
  await studio.getByText('Professional Studio', { exact: true }).click();
  const ack = studio.getByLabel('I have reviewed the warnings above');
  if (await ack.count()) {
    await ack.check();
    note('analysis flagged warnings (defects or unsafe) — acknowledged before generating');
  }
  ok('five studio backgrounds, enhancement modes and levels are selectable (Premium Beige + Professional Studio chosen)');

  // ── REAL Gemini image generation ──
  const t1 = Date.now();
  await studio.getByRole('button', { name: /Generate enhanced photo|Regenerate/ }).click();
  const outcome = await Promise.race([
    studio.getByRole('img', { name: 'Dhaaga Bazaar AI enhanced' }).first().waitFor({ timeout: 300_000 }).then(() => 'image'),
    // The Result panel keeps the failure message (the toast is transient).
    studio.getByText(/No image was generated|Nothing was saved/).first().waitFor({ timeout: 300_000 }).then(() => 'failed'),
  ]);
  const hist = await api(p, 'GET', '/supplier/ai/generations');
  const gen = hist.body.generations[0];
  await shot(p, 'generation-result', true);
  if (outcome === 'image') {
    ok(`REAL Gemini image-to-image generation returned an image in ${((Date.now() - t1) / 1000).toFixed(1)}s (${gen.width}×${gen.height})`);
    await studio.getByRole('button', { name: 'Before / after slider' }).click();
    await studio.getByLabel('Before and after position').fill('30');
    await studio.getByRole('button', { name: 'Side by side' }).click();
    ok('before/after: side-by-side and slider comparison');
    await studio.getByLabel('Make the enhanced photo the primary photo').check();
    await studio.getByRole('button', { name: 'Accept Image' }).click();
    await studio.waitFor({ state: 'hidden', timeout: 30_000 });
    const prod = await api(p, 'GET', `/supplier/products/${productId}`);
    const imgs = prod.body.product.images;
    if (!imgs[0]?.aiEnhanced) throw new Error('accepted image is not the primary photo of the draft');
    ok(`accepted: enhanced photo is the primary photo of the draft (${imgs.length} photos incl. the original)`);
  } else {
    const msg = (await studio.getByText(/No image was generated|Nothing was saved/).first().textContent()) ?? '';
    ok(`REAL Gemini generation was refused by Google — status ${gen.status}, code ${gen.errorCode}; supplier saw: "${gen.error}"`);
    if (gen.url) throw new Error('a failed generation must not have an image');
    const prod = await api(p, 'GET', `/supplier/products/${productId}`);
    if (prod.body.product.images.length !== 0) throw new Error('nothing may be attached to the listing after a failed generation');
    ok('honest failure: no image stored, nothing attached to the listing, no fake result');
    note(msg.trim().slice(0, 160));
  }
  await p.keyboard.press('Escape');

  // ── Gallery upload in product photos: multiple, duplicate guard, zoom, replace ──
  await p.goto(`${base}/supplier/products/${productId}`, { waitUntil: 'networkidle' });
  const before = (await api(p, 'GET', `/supplier/products/${productId}`)).body.product.images.length;
  await p.getByTestId('photo-file-input').setInputFiles([photo, photo2]);
  await p.getByText('Ready to upload (2)').waitFor();
  await p.getByTestId('photo-file-input').setInputFiles([photo]);
  await p.getByText('is already in the list').waitFor();
  ok('Upload from Gallery / Device: two photos staged; picking the same file again is refused');
  await p.getByLabel('Who owns these photos?').selectOption('SUPPLIER_OWNED');
  await p.getByRole('button', { name: 'Upload 2 photos' }).click();
  await p.getByText('2 photo(s) uploaded').first().waitFor();
  await p.getByRole('button', { name: `Zoom photo ${before + 1}` }).click();
  const zoom = p.getByRole('dialog', { name: /Product photo|AI-enhanced photo/ });
  await zoom.getByRole('button', { name: 'Zoom in' }).click();
  await zoom.getByText('150%').waitFor();
  await p.keyboard.press('Escape');
  ok('photos uploaded; zoom viewer opens and zooms');
  const beforeIds = (await api(p, 'GET', `/supplier/products/${productId}`)).body.product.images.map((i) => i.id);
  const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.getByRole('button', { name: `Replace photo ${before + 2}` }).click()]);
  await chooser.setFiles(photo2.replace(/(\.\w+)$/, '-alt$1'));
  await p.getByText('Photo replaced').first().waitFor();
  const afterIds = (await api(p, 'GET', `/supplier/products/${productId}`)).body.product.images.map((i) => i.id);
  if (JSON.stringify(beforeIds) !== JSON.stringify(afterIds)) throw new Error('replace changed photo ids/order');
  ok('Replace photo: new file in the same position (same photo id, order unchanged)');

  // ── Verification document via camera ──
  await p.goto(`${base}/supplier/onboarding`, { waitUntil: 'networkidle' });
  await p.getByLabel('Document type').selectOption('GST_CERTIFICATE');
  await p.getByRole('button', { name: 'Take Photo of Document' }).click();
  const dcam = p.getByRole('dialog', { name: 'Photograph document' });
  await dcam.getByRole('button', { name: 'Capture' }).click();
  await dcam.getByRole('button', { name: 'Use photo' }).click();
  await p.getByRole('img', { name: 'Document preview' }).waitFor();
  await p.getByRole('button', { name: 'Retake' }).click();
  await p.getByRole('dialog', { name: 'Photograph document' }).getByRole('button', { name: 'Capture' }).click();
  await p.getByRole('dialog', { name: 'Photograph document' }).getByRole('button', { name: 'Use photo' }).click();
  await p.getByRole('button', { name: 'Submit document' }).click();
  await p.getByText('Document uploaded').first().waitFor();
  const docs = (await api(p, 'GET', '/supplier/me')).body.supplier.documents;
  if (!docs.some((d) => d.type === 'GST_CERTIFICATE')) throw new Error('document not stored');
  ok('Take Photo of Document: capture → preview → retake → submit; stored privately (no AI used)');

  // ── Camera denied / unavailable → clear message and gallery fallback ──
  const { ctx: c2, page: q } = await context({ width: 1280, height: 900 }, false, [], strictBrowser);
  await q.goto(`${base}/login?as=supplier`, { waitUntil: 'networkidle' });
  await q.getByLabel('Email address').fill(`e2e-supplier-ai-${stamp}@supplier.test`);
  await q.locator('input[autocomplete="current-password"]').fill('Weave2026');
  await q.locator('#main form').getByRole('button', { name: 'Sign in', exact: true }).click();
  await q.waitForURL(/\/supplier/);
  await q.goto(`${base}/supplier/ai-studio`, { waitUntil: 'networkidle' });
  await q.getByRole('button', { name: 'Take Photo' }).click();
  await q.getByText(/Camera permission was denied|No camera was found|could not be started/).waitFor();
  const deniedMsg = await q.getByText(/Camera permission was denied|No camera was found|could not be started/).textContent();
  await q.getByRole('button', { name: 'Cancel' }).click();
  await q.getByRole('button', { name: 'Upload from Gallery / Device' }).waitFor();
  ok(`camera permission not granted → "${deniedMsg?.slice(0, 60)}…"; Upload from Gallery / Device remains available`);
  await c2.close();

  // ── Mobile layout ──
  const { ctx: c3, page: m } = await context({ width: 390, height: 844 }, true);
  await m.goto(`${base}/login?as=supplier`, { waitUntil: 'networkidle' });
  await m.getByLabel('Email address').fill(`e2e-supplier-ai-${stamp}@supplier.test`);
  await m.locator('input[autocomplete="current-password"]').fill('Weave2026');
  await m.locator('#main form').getByRole('button', { name: 'Sign in', exact: true }).click();
  await m.waitForURL(/\/supplier/);
  await m.goto(`${base}/supplier/ai-studio`, { waitUntil: 'networkidle' });
  await m.getByRole('button', { name: 'Take Photo' }).waitFor();
  const width = await m.evaluate(() => document.documentElement.scrollWidth);
  await shot(m, 'mobile', true);
  if (width > 392) throw new Error(`horizontal overflow on mobile: ${width}px`);
  ok('mobile (390px): AI Studio fits the screen, camera and gallery buttons visible');
  await c3.close();

  // ── Security spot checks through the browser session ──
  const { ctx: c4, page: r } = await context();
  await r.goto(`${base}/`, { waitUntil: 'networkidle' });
  const anon = await api(r, 'GET', '/supplier/ai/status');
  const anonFile = await r.evaluate(async (id) => (await fetch(`/api/supplier/ai/files/generation/${id}`, { headers: { 'X-Requested-With': 'dhaaga' } })).status, gen.id);
  if (anon.status !== 401 || anonFile !== 401) throw new Error(`guest access not blocked: ${anon.status}/${anonFile}`);
  ok('guest cannot reach AI endpoints or private AI files (401)');
  await c4.close();
} catch (e) {
  console.error('✗ FAILED:', e.message);
  process.exitCode = 1;
}
console.log(errors.length ? `Browser errors:\n${[...new Set(errors)].join('\n')}` : 'No browser errors.');
await browser.close();
await strictBrowser.close();
if (errors.length) process.exitCode = 1;
