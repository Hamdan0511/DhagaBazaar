# Architecture

Dhaaga Bazaar is a modular monolith: one Express API, one React SPA and a shared TypeScript package, deployed together or separately.

## Shared package (`@dhaaga/shared`)

- **taxonomy.ts** — the category tree (6 roots, 63 subcategories). Seeded into `categories`; admins can add more and they automatically get full category pages, navigation entries and filters.
- **filters.ts** — category-specific *filter sets* (vocabulary only, never results), MOQ ranges, order-quantity presets, sort options.
- **schemas.ts** — Zod schemas used for client forms *and* server validation (registration, addresses, supplier profile, products, enquiries, complaints, dispatch).
- **format.ts** — paise/₹ helpers and `validateOrderQuantity` (MOQ + order step), the single MOQ rule used by the product page, cart API and checkout.

## Data model (PostgreSQL via Prisma)

```
users ─┬─ retailers ── addresses, orders, enquiries, complaints, saved_products, saved_suppliers, reviews
       ├─ suppliers ── supplier_documents, products, supplier_orders, commissions
       ├─ carts ── cart_items (product, optional variant)
       ├─ notifications, audit_logs, password_reset_tokens
categories (tree, filterSet) ── products ── product_variants (size/colour/price override)
                                         └─ product_images (storage key, usage rights, attribution, review status)
orders (address snapshot) ── supplier_orders (one per supplier) ── order_items (title/price/MOQ snapshots)
                                                               ├─ shipments
                                                               ├─ commissions
                                                               └─ payments (ready for a payment provider)
contact_messages
```

Key decisions:

- **Money is integer paise.** Orders store price, title, variant and MOQ snapshots so later listing edits never change a submitted order.
- **Category-specific attributes** are stored as JSON on `products.attributes`; the server keeps only keys/values defined by the category's filter set. Variant sizes/colours are merged into filterable attributes.
- **Approval states:** supplier `INCOMPLETE → PENDING_REVIEW → APPROVED/REJECTED/SUSPENDED`; product `DRAFT → PENDING_REVIEW → APPROVED/REJECTED/ARCHIVED`; images `PENDING → ACCEPTED/REJECTED`. Editing an approved listing sends it back to draft.
- **Verification is separate from approval** (`suppliers.isVerified`) and requires an accepted document.
- **Fixtures** carry `isFixture` on suppliers and products; `publicProductWhere()` in `server/src/lib/catalog.ts` is the single definition of public visibility.

## Key flows

**Guest → commerce action → sign-in → replay.** `useCommerceAction()` stores the attempted action (add to cart, save product/supplier, open enquiry) in session storage and opens the auth modal. `<PendingActionRunner/>` executes it after any successful sign-in (modal or full page).

**Listing & filtering.** `GET /api/products` loads the lightweight candidate set for the category scope, filters in memory, computes disjunctive facet counts (each facet ignores its own selection), sorts and paginates, then hydrates only the page. Exact counts with simple code; swap to a search index behind the same API when categories reach tens of thousands of listings.

**Cart → order.** The cart is grouped by supplier; MOQ is validated per product across all variants. Checkout re-validates, then creates one `order` with one `supplier_order` per supplier inside a transaction, clears the cart and notifies suppliers. The parent order status is derived from its groups.

**Fulfilment.** Suppliers confirm/decline, mark processing, add dispatch details (creates a shipment, notifies the retailer) and mark delivered. Admins monitor every group and record commissions.

## Security

- Passwords: bcrypt (cost 12). Sessions: signed JWT in an HTTP-only, SameSite=Lax cookie (Secure in production), invalidated via `tokenVersion` on password change/reset/deactivation.
- CSRF: every non-GET request must send `X-Requested-With: dhaaga`; CORS only allows configured origins.
- RBAC per router (`requireRole`), ownership checks on every supplier/retailer resource.
- Uploads: memory upload with size limits, MIME verified from file signatures (JPEG/PNG/WebP/PDF), random storage keys, path-traversal-safe storage adapter. Verification documents are stored outside the public folder and served only to admins.
- Helmet security headers, rate-limited auth and contact endpoints, generic login errors (no account enumeration), audit log for admin and order actions.

## Images

`client/src/lib/images.ts` is the central category → image map. All photos are Unsplash License images downloaded once, converted to WebP and stored in `client/public/images`; attribution is generated into `client/src/data/image-credits.json` and shown at `/image-credits`. Categories without a suitable licensed photo use a neutral branded placeholder rather than an unrelated picture. The homepage hero is the same licensed photo cropped to waist height with the plain background wall extended for the wide layout; the garment and model are unaltered.

## Extensibility (prepared, not yet built)

- **Payments:** `payments` table and order statuses are ready; integrate Razorpay/Cashfree when payment flows are agreed.
- **Email/SMS/WhatsApp notifications:** in-app notifications exist; the password-reset link is logged in development and must be wired to an email provider before launch.
- **S3-compatible storage:** implement `StorageAdapter` in `server/src/lib/storage.ts`.
- **Reviews:** table exists; enable once delivered orders exist, with moderation.
- **Product/supplier comparison, invoices, supplier performance:** add when real order data exists — no synthetic scores.
- **Dhaaga AI Studio:** image processing would operate on copies in storage, never altering garment features, with originals retained.
