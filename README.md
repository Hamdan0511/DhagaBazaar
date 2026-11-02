# Dhaaga Bazaar — India's B2B Garment Marketplace

A zero-inventory B2B marketplace connecting garment **manufacturers, wholesalers and distributors** with **retailers, boutique owners and resellers**. Launching in Bengaluru, with women's wear as the first supplier-acquisition focus — and every other garment category supported from day one.

Suppliers own their stock, set their own wholesale prices and MOQs, and ship directly to retailers. Dhaaga Bazaar handles discovery, bulk ordering, supplier connections and order coordination.

---

## What's built

| Area | Highlights |
| --- | --- |
| **Public marketplace** | Homepage built to the supplied visual reference, 6 top-level / 63 sub-categories, category pages with arched illustrative imagery, supplier directory and public supplier profiles, search with taxonomy + live-listing suggestions, recent searches, info & policy pages. |
| **B2B discovery** | Category-specific filter sets (saree, kurti, dupatta, lehenga, dress material, menswear, kidswear, footwear, fabrics, accessories…), MOQ ranges + custom MOQ, order-quantity filter that respects MOQ and order steps, price filters (shown only when priced listings exist), supplier location, applied-filter chips, real facet counts, URL-persisted state, mobile filter drawer. |
| **Two portals, one database** | Separate registration at `/register/retailer` and `/register/supplier` (chooser at `/register`) with full business details, confirm-password and category selection. Suppliers start *pending review*; retailers get a default shop address and can order immediately. Admin, supplier and retailer roles are enforced on every API. |
| **Guest-first auth** | Browse everything without an account. Add to cart / save / enquire opens a *Sign in to continue* modal; after login or sign-up the original action is replayed automatically. Role-aware registration (retailer, boutique owner, reseller, wholesaler, manufacturer, distributor), forgot/reset password, change password. |
| **B2B cart & orders** | Server-persisted cart grouped by supplier, MOQ validated across all sizes/colours of a product, order steps, **stock validation and atomic stock reservation at checkout** (returned on decline/cancel), supplier minimum order value, availability checks, multiple business addresses, one order group per supplier, price snapshots, printable quotation / order request, cancel unconfirmed groups, shipment tracking, complaints & returns. |
| **Retailer dashboard** | Overview, catalogue, cart, enquiries, orders, shipment tracking, saved products, saved suppliers, complaints, notifications, business profile, settings, help. |
| **Supplier portal** | Business profile, verification documents (always *pending* until an admin approves), product management (add / edit / delete drafts / archive) with category → subcategory, category-specific attributes, size × colour option builder, per-option stock, a stock-management page, wholesale price (per piece/set/metre/pair), MOQ, order multiples, dispatch time, original photo uploads with usage-rights declaration, availability, enquiries inbox, order confirmation, dispatch details. |
| **Admin** | Live overview, supplier review (approve / reject / suspend with reasons), document review & private viewing, a separate deliberate *documents verified* action, listing approval / change requests / **unpublish**, user deactivation, category management (new categories get full pages automatically), retailers, orders & fulfilment monitoring, commissions, complaints, contact messages, audit log. |

### Commercial honesty, enforced in code

- **No fake inventory.** The production seed creates the category taxonomy (and optionally an admin) only. Empty categories show *"New collections are coming soon."*
- **Illustrative images are labelled** and never behave like products. Every photo is licensed (Unsplash License), mapped to the correct category, stored locally as WebP, and credited at `/image-credits`.
- **No fake metrics.** Counts, prices, facets, "verified" marks and availability come only from the database. Price filters appear only when priced listings exist.
- **Suppliers are never auto-approved or auto-verified.** Verification requires approval *and* an accepted document.
- **Development fixtures are isolated.** Fixture rows carry `isFixture=true` and a "[DEV FIXTURE]" label, are hidden unless `ENABLE_DEV_FIXTURES=true`, and **can never be shown when `NODE_ENV=production`** (verified).
- **No placeholder business details.** Address/phone/email/GSTIN live in `client/src/config/business.ts` as `null` and render as neutral "to be published" text until real values exist.

---

## Tech stack

**Client:** React 19, Vite, TypeScript, Tailwind CSS v4, React Router, TanStack Query, Zustand, React Hook Form, Zod, lucide icons, self-hosted Playfair Display + Inter.
**Server:** Node.js, Express 5, TypeScript, REST, Prisma 6, PostgreSQL, bcrypt, JWT in an HTTP-only cookie, Helmet, rate limiting, Multer with file-signature checks.
**Shared:** `@dhaaga/shared` — category taxonomy, filter definitions, Zod schemas and money/MOQ helpers used by both apps.
**Architecture:** modular monolith (`client/`, `server/`, `shared/` npm workspaces).

---

## Getting started

Prerequisites: Node.js 20+ and PostgreSQL 15+ binaries installed locally (or any PostgreSQL you can point `DATABASE_URL` at).

```bash
# 1. Configure the API
cp server/.env.example server/.env
#    then replace CHANGE_ME in DATABASE_URL with a database password of your choice, set
#    JWT_SECRET (64+ random chars) and, for a dev admin, ADMIN_EMAIL / ADMIN_PASSWORD (12+ chars)
cp server/.env.test.example server/.env.test   # same database password; used by `npm test`

# 2. Install, create a private dev database on 127.0.0.1:5433, migrate and seed the taxonomy
npm run setup

# 3. Run everything (dev DB + API on :4000 + web on :5173)
npm run dev
```

Open http://localhost:5173. The admin console is at `/admin` (sign in with the `ADMIN_*` credentials you configured — there is no public admin registration).

`npm run db:init` creates a self-contained cluster in `./.pgdata` using your installed PostgreSQL binaries (override with `PG_BIN`). To use an existing PostgreSQL instead, just set `DATABASE_URL`.

### Trying the shopping flow before suppliers exist

```bash
npm run seed:dev-fixtures -w server           # clearly labelled test suppliers + listings
# start the API with fixtures visible (development only):
ENABLE_DEV_FIXTURES=true npm run dev:server
npm run seed:dev-fixtures -w server -- --remove   # remove them again
```

### Useful scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev database + API + web client |
| `npm test` | Server integration tests (throwaway database per run) + client unit tests |
| `npm run typecheck` | TypeScript across server and client |
| `npm run build` | Production builds (`server/dist`, `client/dist`) |
| `npm run db:backup` / `npm run db:restore -- <dump> <new_db>` | Backup (dump + uploads) and restore into a **new** database (never overwrites) |
| `npm run e2e:journeys` | 32-step browser acceptance run: supplier → admin → retailer → order → security → mobile (needs `ADMIN_EMAIL`/`ADMIN_PASSWORD` env and a photo path; clean up with `npm run e2e:cleanup`) |
| `npm run e2e:guest` | Browser flow: guest → Add to Cart → sign up → auto-added → multi-supplier checkout (needs fixtures) |
| `npm run e2e:cleanup` | Remove records created by the browser flows |
| `node scripts/screenshot.mjs <dir> 1440x900 / /categories/womens-wear --full` | Visual QA screenshots + console error report |

---

## Project structure

```
shared/src/        taxonomy.ts · filters.ts · schemas.ts · format.ts
server/
  prisma/          schema.prisma · migrations · seed.ts (taxonomy + admin) · dev-fixtures.ts · cleanup-e2e.ts
  src/lib/         catalog (visibility + filtering + facets) · cart · storage · auth · audit
  src/routes/      auth · public · cart · retailer · supplier · admin · notifications
  src/test/        integration tests against a per-run throwaway database
client/
  public/brand/    official logo (extracted from the supplied artwork), favicon, placeholder
  public/images/   licensed category photography (WebP)
  src/lib/images.ts  central category → image mapping
  src/components/  layout (header, search, nav, footer) · home · catalog · auth · dashboard · ui
  src/pages/       public pages · account/ (retailer) · supplier/ · admin/ · info/
docs/              ARCHITECTURE.md · DEPLOYMENT.md · reference/ (supplied logo + UI reference)
scripts/           dev-db · dev · screenshot · e2e flows
```

The production-readiness audit (issues, fixes, open items, priorities) is in [docs/AUDIT.md](docs/AUDIT.md). See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the data model and key flows, and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for production.
