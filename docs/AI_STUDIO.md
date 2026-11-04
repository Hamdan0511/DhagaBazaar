# Dhaaga Bazaar AI Studio

AI Studio helps suppliers turn everyday garment photos into clean catalogue photographs. Google Gemini improves the background, lighting, creases and clarity, while the product itself must stay the same. Every result is reviewed by the supplier and then by the normal admin listing review. Nothing is published automatically.

- **Supplier page:** `/supplier/ai-studio` (sidebar: *Dhaaga Bazaar AI Studio*).
- **Inside a listing:** *Add new product → Create draft → Product photos → Enhance with Dhaaga Bazaar AI*. This opens the studio in place. The ✨ button on an existing photo enhances that photo.
- **API:** `server/src/routes/ai.ts`, mounted under `/api/supplier/ai`, which is supplier-only.
- **Gemini access:** `server/src/lib/ai/gemini.ts`, using the official `@google/genai` SDK and its Interactions API.
- **Prompts:** `server/src/lib/ai/prompts.ts` holds the fidelity rules, the per-category handling and the analysis schema.
- **Options:** backgrounds, modes and levels are defined in `shared/src/ai.ts`.

## Configuration

Set these in `server/.env`. They are server-side only: never put them in `VITE_` variables, and never commit a real key.

| Variable | Default | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | (none) | Key from https://aistudio.google.com/apikey. Without it, the studio says AI is not configured and makes no calls. |
| `GEMINI_IMAGE_MODEL` | `gemini-nano-banana-2.1` | Image-editing model (image and text in, image out). |
| `GEMINI_ANALYSIS_MODEL` | `gemini-3.6-flash` | Vision model for the garment analysis. |
| `GEMINI_IMAGE_SIZE` | `2K` | Output size: `1K`, `2K` or `4K`. |
| `GEMINI_TIMEOUT_MS` | `180000` | Per-request timeout. |
| `AI_DAILY_GENERATIONS` | `20` | Generations per supplier per rolling 24 hours. |
| `AI_DAILY_ANALYSES` | `60` | Analyses per supplier per rolling 24 hours. |

The SDK is installed in the server workspace (`npm install @google/genai -w server`). Restart the API after changing `.env`.

### Billing is required for image editing

On the Gemini **free tier**, the image models have a quota of **0**. Every generation request is refused with HTTP 429 ("limit: 0 … on Free Tier"). The studio shows this to suppliers as "Dhaaga Bazaar AI has reached its image-generation quota with Google Gemini. No image was generated." Analysis does work on the free tier.

To enable image editing, turn on billing for the Google Cloud project that owns the key: https://ai.dev/rate-limit.

### Costs

Google's published paid-tier price for Nano Banana 2.1 is about **$0.034 per 1K image**, **$0.050 per 2K image** and **$0.113 per 4K image**, plus input tokens at $1.50 per 1M. Check https://ai.google.dev/pricing for current figures.

- One **Generate** or **Regenerate** press is one image request.
- Analysis is a small text-and-vision request.
- With the defaults, one supplier can make at most 20 generations a day, about $1 a day at 2K.

## How the workflow behaves

1. **Take Photo** (live camera, rear camera preferred) or **Upload from Gallery / Device**.
   - The photo is checked and, if very large, resized on the device to 2560px.
   - It is then stored privately as the **original** (`uploads/private/ai/<supplier>/originals/`). The original is never modified.
   - Uploading the same photo again reuses it; nothing is stored twice.
2. **Analyse photo**, an explicit button.
   - Gemini reports garment type, colours, fabric look, pattern, print or embroidery, neckline, sleeves, closures, wrinkles, lighting and background problems, possible defects, photo quality and whether it is safe to enhance.
   - The supplier can correct the garment type and colour.
   - A finished analysis is reused, never paid for twice.
3. **Background, enhancement and level.**
   - Backgrounds: Pure White (default), Warm Ivory, Premium Beige, Light Grey, Soft Neutral.
   - Modes: Full enhancement (default), Wrinkle reduction, Background cleanup, Lighting, Clarity, White studio, Premium background.
   - Levels: Natural, Balanced, Professional Studio.
   - If the analysis flagged defects or an unsafe photo, the supplier must tick *I have reviewed the warnings* first.
4. **Generate.**
   - Returns at once and runs in the background. The page shows honest stages and elapsed time; it never shows a fake percentage.
   - Only one generation runs per supplier at a time, so double clicks and second tabs get "already being generated".
   - Generation is **never retried automatically**. Refreshing the page only reads the status; it never starts another request.
5. **Compare** side by side or with the before/after slider, zoom full screen, **Download preview**, **Regenerate**, **Accept Image** or **Discard Image**.
   - Every attempt is kept as a separate version under *Versions of this photo* and in *Enhancement history*.
6. **Accept** copies the version into the chosen listing as a **new photo**. It is pending review and marked `aiEnhanced`.
   - Optionally the original is added too, and the enhanced photo can be made primary.
   - An approved listing goes back to draft, exactly as when any photo is added.
   - Admin reviewers see "AI-enhanced" on the photo. Retailers see a note under it on the product page.

### Garment fidelity

Every prompt states that the edit must keep:
- the exact colour, fabric look, print, pattern, embroidery, buttons, zips, stitching, neckline, sleeves, shape, proportions, labels and logos;
- intentional pleats, drape and texture.

It must not:
- redesign the item or add people, props or logos;
- hide damage. Defects noted by the analysis are listed in the prompt as "MUST stay visible".

Category-specific instructions cover sarees, dupattas, dress materials, flat fabrics (print scale, weave), innerwear (never a person or body), footwear, accessories, ethnic wear, denim, outerwear, kidswear (never a child), dresses, shirts and tops, bottomwear and nightwear.

**AI image editing is not deterministic.** The UI asks the supplier to check every detail before accepting, and the admin review still applies.

### Output validation

A generation counts as successful only when Gemini returns image data that:
- has a real JPEG, PNG or WebP signature;
- has readable dimensions, at least 256px on the shortest side;
- is **not identical to the original**.

Anything else is stored as `FAILED` with a safe error code, and no image is saved or shown.

## Security

- Every route requires a signed-in **supplier**. Retailers and admins get 403, guests 401.
- Suspended or rejected suppliers cannot use AI.
- Every lookup uses the record id **and** the caller's supplier id, so one supplier gets 404 for another supplier's originals, versions, files and listings.
- Supplier ids from the browser are never trusted.
- Originals and versions are private files, served only through `/api/supplier/ai/files/...` with `Cache-Control: private, no-store`. They cannot be reached through `/uploads`.
- Provider error messages go to the server log only. Suppliers see fixed, safe messages.
- **Verification documents are never sent to Gemini.** Document capture (*Take Photo of Document*) only photographs and uploads the document unchanged.
- Gemini requests use `store: false`.

## Storage

Local disk (`server/uploads`) is for development and single-server installs only. For production with more than one server, or ephemeral disks, implement the S3-compatible adapter in `server/src/lib/storage.ts`. Keys are already namespaced:

- `private/ai/<supplierId>/originals/<uuid>.<ext>`
- `private/ai/<supplierId>/generated/<uuid>.jpg`
- `public/products/<uuid>.<ext>` (accepted listing photos)

Housekeeping (`server/src/lib/ai/maintenance.ts`, runs at start-up and every 6 hours) only touches AI Studio records:
- Jobs interrupted by a restart are marked failed.
- Originals never used for an enhancement are removed after 3 days.
- Files of discarded or failed versions are removed after 30 days. The history row is kept.

The duplicate guard and the one-generation-per-supplier lock are in-process. Run a single API instance, or move the lock to the database or Redis before scaling out.

## Troubleshooting

| Supplier sees | Cause | Fix |
|---|---|---|
| "AI is not configured" | `GEMINI_API_KEY` is missing | Set it in `server/.env` and restart the API. |
| "…reached its image-generation quota…" | Free-tier key (quota 0) or quota used up | Enable billing or raise the quota at https://ai.dev/rate-limit. |
| "…is busy right now…" | Gemini rate limit or temporary overload (503) | Wait and retry. Analysis retries twice automatically; generation does not. |
| "…could not authenticate…" | Invalid or revoked key | Create a new key. |
| "…did not return an image…" | The model answered without an image, or returned the input unchanged | Retake the photo with only the garment in frame and retry. |
| "…took too long…" | Timeout | Retry. Consider `GEMINI_IMAGE_SIZE=1K`. |

The server log (`[error] ai generation failed` / `ai analysis failed`) has the provider's exact message.

## Testing

- `server/src/test/ai.test.ts` exercises the API with a **fake Gemini client**: permissions, ownership, validation, duplicates, the generation lock, output checks, error mapping, accept/discard, listing integration and admin approval. The test environment always blanks `GEMINI_API_KEY`, so automated tests can never call the paid API.
- `scripts/e2e-ai-studio.mjs <outDir> <garment.jpg> <second.jpg>` runs in a real browser against the **live** Gemini key in `server/.env`. It covers camera, gallery, analysis, generation, document capture, a denied camera, mobile layout and guest access. Run `npm run e2e:cleanup` afterwards.
