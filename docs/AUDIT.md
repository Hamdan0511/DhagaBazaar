# Dhaaga Bazaar — Production-Readiness Audit

**Date:** 1 November 2026 · **Scope:** the whole repository (shared, server, client, database, scripts, docs).
**Method:** code review of every module, 45 automated tests (36 server integration + 9 client), a 32-step browser acceptance journey against the real dev database, a guest sign-up journey, mobile overflow checks on 34 pages, a production-build boot test, `npm audit`, and a verified backup → restore.

Every issue below marked **Fixed** has a test or recorded check that demonstrates it. Nothing here is claimed from inspection alone unless it says so.

---

## 1. Summary

| Priority | Found | Fixed | Open |
| --- | --- | --- | --- |
| Critical | 3 | 3 | 0 |
| High | 10 | 7 | 3 |
| Medium | 15 | 8 | 7 |
| Low | 9 | 4 | 5 |

The open items are mostly things that need an external service (email, object storage, payments) or a decision from you (legal review, image replacement, dependency major upgrades). None of them weakens the security fixes already in place.

---

## 2. Fixed issues

### Critical

| # | Issue | Why it mattered | Fix | Files | Evidence |
| --- | --- | --- | --- | --- | --- |
| C1 | **One cart could become several orders.** Checkout read the cart, then created the order and cleared the cart in separate steps. | Double-clicks or retries could send duplicate bulk orders to suppliers. | The order transaction first deletes the exact cart rows it priced; a second submission blocks on the row locks, finds nothing to claim and gets 409. | `server/src/routes/retailer.ts` | `security.test.ts` → "creates exactly one order when checkout is submitted twice concurrently". That test passed even before the fix (by timing), so the guarantee now rests on the lock, not luck. |
| C2 | **Overselling.** There was no stock model, so any quantity could be ordered. | Retailers could order goods that do not exist. | New nullable stock columns per product and per size/colour option. Cart and checkout validate stock, and checkout reserves it with conditional atomic decrements. Supplier decline/cancel and retailer cancel return the stock. | `prisma/migrations/20261101130000_inventory`, `server/src/lib/stock.ts`, `lib/cart.ts`, `routes/cart.ts`, `routes/retailer.ts`, `routes/supplier.ts` | `portals.test.ts` stock tests; journey step 26 (DB stock 20/15 → 12/9) |
| C3 | **Money overflow crashed checkout.** Totals are 32-bit paise columns; an order above about ₹2.14 crore hit a database error (HTTP 500). | Large B2B orders failed with an opaque error. | The cart flags groups and orders above ₹2 crore, and checkout refuses them with a clear message. | `shared/src/format.ts`, `server/src/lib/cart.ts` | `security.test.ts` → "refuses order values that would overflow" |

### High

| # | Issue | Fix | Files | Evidence |
| --- | --- | --- | --- | --- |
| H1 | Supplier tracking links accepted `javascript:` / `data:` URLs (stored XSS risk; React 19 blocked `javascript:` at render, but other channels would not) | http(s)-only validation on the server; links rendered only if safe | `shared/src/schemas.ts`, `shared/src/format.ts`, `client/src/pages/account/AccountRoutes.tsx` | security test "only accepts http(s) tracking links" |
| H2 | `trust proxy` was always on, so spoofed `X-Forwarded-For` bypassed every IP rate limit | `TRUST_PROXY` env (default 0) | `server/src/app.ts`, `config.ts` | security test "does not trust X-Forwarded-For" |
| H3 | Password guessing was limited per IP only | Per-account lockout (10 failures / 15 min, any IP) plus a global API limit and upload/message limits | `server/src/lib/rateLimits.ts`, `routes/auth.ts` | security test "locks login for an account…" |
| H4 | Photos still under review were publicly downloadable (hot-linking of unreviewed content) | Gated image route: public only when accepted; owner/admin otherwise | `server/src/lib/storage.ts`, `app.ts` | security test "does not expose unapproved product photos" |
| H5 | Supplier minimum order value was shown but never enforced | Cart issue + checkout block | `server/src/lib/cart.ts`, `client/src/pages/CartPage.tsx` | security test "enforces a supplier's minimum order value" |
| H6 | Editing a listing deleted and recreated its size/colour options, silently emptying retailers' cart lines | Options updated in place; only removed options are deleted | `server/src/routes/supplier.ts`, `client/src/pages/supplier/ProductEditor.tsx` | security test "keeps retailers' cart lines…" |
| H7 | No backup or recovery procedure | `npm run db:backup` (pg_dump + uploads + manifest) and `db:restore` (restores only into a **new** database, refuses to overwrite) | `scripts/db-backup.mjs`, `db-restore.mjs`, `pg-tools.mjs` | Dev DB backed up; restore verified (users 3 / categories 69 / products 6 match); overwrite refused |

### Medium

| # | Issue | Fix | Files |
| --- | --- | --- | --- |
| M1 | No database-level integrity rules | CHECK constraints (positive prices, MOQ ≥ 1, quantities, ratings, commissions, stock ≥ 0) + storage-key index; verified drift-free | `prisma/migrations/20261101120000_integrity_constraints` |
| M2 | Unbounded arrays/maps (exposure to Zod advisory GHSA-mrhx-c7xc-m3w5) | Size caps on categories, attributes, values | `shared/src/schemas.ts` |
| M3 | Bad filters / missing records / oversized bodies returned 500 | Error handler maps Prisma P2025/P2003/P2000, validation errors and body-parser errors to 4xx; admin filters validated | `server/src/middleware/error.ts`, `routes/admin.ts` |
| M4 | "Documents verified" mark survived a change of business name/address | Verification resets on identity changes | `server/src/routes/supplier.ts` |
| M5 | Verification PDFs rendered same-origin without restrictions | `Content-Security-Policy: sandbox` on document responses | `server/src/routes/admin.ts` |
| M6 | No structured logs, no request IDs, no crash handlers; logged paths were router-relative | JSON logs in production, `X-Request-Id`, error reference in 500 responses, full paths, `unhandledRejection`/`uncaughtException` handlers | `server/src/lib/logger.ts`, `middleware/error.ts`, `index.ts` |
| M7 | Production could start with an unsafe config | Refuses weak `JWT_SECRET`, localhost `CLIENT_ORIGIN`, non-https `APP_URL`; warns when email is not configured; health returns 503 when the DB is down | `server/src/config.ts`, `app.ts` |
| M8 | Header menus and mobile drawer closed by themselves if opened while a page was still loading (React Router commits lazy-route navigations as transitions) — found by the browser journey, reproduced in the production build | Close on navigation only when the URL actually changed since opening; a click pins the menu open | `client/src/components/layout/SiteHeader.tsx`, `MobileNav.tsx` |

### Low

| # | Issue | Fix |
| --- | --- | --- |
| L1 | Dashboards overflowed horizontally on phones | Grid column `min-w-0`; compact product quantity table — verified on 23 dashboard + 11 public pages at 390 px |
| L2 | Password mismatch / supplier-only errors appeared only after all other fields were valid | Cross-field checks always run in the form resolver |
| L3 | Order numbers used 24 random bits per day | 32 bits |
| L4 | Auth limits blocked heavy local testing | `AUTH_ATTEMPTS_PER_IP` (30 in production, 300 in development) |

---

## 3. Open issues and recommendations

| Priority | Issue | Why it matters | Recommended solution | Files |
| --- | --- | --- | --- | --- |
| **High** | **No email provider.** Password-reset links are only logged in development; in production the server logs an error instead of sending. | Users who forget passwords are locked out; no email verification. | Wire Resend/SES/SendGrid, set `EMAIL_PROVIDER`, send reset + new-order emails. | `server/src/routes/auth.ts` (+ new `lib/email.ts`) |
| **High** | **Uploads on local disk.** | Ephemeral or multi-instance hosting loses photos and documents. | Implement the `StorageAdapter` for S3/R2 (documents in a private bucket) or mount a persistent backed-up volume. | `server/src/lib/storage.ts` |
| **High** | **Legal & operational readiness.** Terms, Privacy and Returns are marked drafts; business contact details are unpublished. | Indian e-commerce rules (Consumer Protection (E-Commerce) Rules 2020 grievance-officer requirements), DPDP Act 2023 consent/erasure duties, GST invoicing responsibilities between marketplace and suppliers. | Legal review; publish grievance officer + registered address; add data export/deletion workflow. | `client/src/pages/info/InfoRoutes.tsx`, `client/src/config/business.ts` |
| Medium | `zod` < 4.6.6 advisory (runtime) | Memory exhaustion on oversized collections — mitigated by 1 MB body limit and new caps | Migrate to Zod 4 (breaking API changes in `errorMap`) | `shared/src/schemas.ts`, forms |
| Medium | `prisma` / `deepmerge-ts` advisory | CLI/build-time only, not request-reachable | Upgrade to Prisma 7 (major; new config file) | `server/prisma/*`, `package.json` |
| Medium | Rate limits use in-memory storage | Limits reset on restart and are per instance | Redis store when scaling beyond one instance | `server/src/lib/rateLimits.ts` |
| Medium | Supplier photos keep EXIF metadata (possibly GPS) | Privacy of supplier premises | Keep original privately; serve a re-encoded, EXIF-stripped copy (e.g. `sharp`) | `server/src/routes/supplier.ts`, `lib/storage.ts` |
| Medium | Money columns are 32-bit (₹2 crore ceiling enforced) | Very large orders must be split | Migrate totals to `BIGINT` with serialization helpers | `prisma/schema.prisma`, order routes |
| Medium | Some illustrative photos show third-party marks (e.g. branded sneakers on *Casual Shoes*, brand labels on *Shirts*/*Jeans*) and identifiable people | Unsplash License excludes trademarks and does not include model releases | Replace branded images; legal check on people imagery used in marketing | `client/public/images`, `client/src/lib/images.ts` |
| Medium | Listing filters run in memory per request | Fine for thousands of listings, not hundreds of thousands | Move to Postgres facets or a search index behind the same API | `server/src/lib/catalog.ts` |
| Medium | Accessibility and performance not machine-audited | No axe/Lighthouse run was performed in this audit | Add axe-core to the journey script; Lighthouse in CI; responsive `srcset` images | `scripts/`, `client/src/lib/images.ts` |
| Low | Logout does not revoke the JWT server-side | A stolen cookie stays valid until expiry (7 days) | Session table or token-version bump on logout-everywhere | `server/src/routes/auth.ts` |
| Low | Registration reveals whether an email exists (409) | Minor account enumeration | Accept the trade-off or require email verification first | `routes/auth.ts` |
| Low | No email verification / phone OTP | Fake sign-ups | Verify email on registration once email is wired | — |
| Low | Reviews table exists without UI | — | Enable after delivered orders exist, moderated | — |
| Low | One unexplained server-test run (11 tests not executed) that could not be reproduced in 7 later runs | Possible flakiness | Watch in CI; tests use one shared throwaway DB per run | `server/src/test/*` |

---

## 4. Backup and recovery strategy

1. **Primary (production):** managed PostgreSQL with automated daily backups and point-in-time recovery (7–30 days).
2. **Secondary (off-site):** nightly `npm run db:backup` → copy `backups/<timestamp>/` (dump + uploads + manifest) to separate storage; keep 14 daily, 8 weekly.
3. **Recovery:** `npm run db:restore -- backups/<ts>/dhaaga_bazaar.dump <new_db_name>` → verify counts printed by the script → point `DATABASE_URL` at the new database → restart. The script never overwrites an existing database.
4. **Drill:** restore into a new database at least monthly (verified once on 1 Nov 2026).

---

## 5. Implementation priorities (next)

1. Email provider (password reset, order notifications).
2. Object storage for uploads + EXIF stripping.
3. Legal pages, grievance officer, business details.
4. Replace trademark-bearing illustrative images.
5. Zod 4 and Prisma 7 upgrades.
6. Redis rate-limit store and BIGINT money columns before scaling.
7. Automated accessibility/performance checks in CI.
