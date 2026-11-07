# Payments

Dhaaga Bazaar supports two ways for a retailer to pay for an order. Both can be switched on at the same time.

1. **Online payment through Razorpay** (UPI, cards, net banking, wallets, as enabled on the merchant account). The order is marked paid only after the server has verified Razorpay's signature **and** fetched the payment from Razorpay, or received a signed webhook. See [Razorpay online payments](#razorpay-online-payments).
2. **UPI QR with manual verification.** The business's own UPI QR is shown, and an **administrator verifies** each payment against the bank or UPI account.

In both cases, nothing is marked paid on the retailer's or the browser's word. A UTR, a screenshot or a "success" screen is only a claim until it has been verified.

Both are off by default. Razorpay needs server keys plus an admin switch; the UPI QR needs the uploaded QR plus an admin switch.

## Architecture

| Layer | Where |
|---|---|
| Data | `server/prisma/schema.prisma`: `Payment`, `PaymentEvent` (append-only history), `PaymentRefund`, `PaymentSettings` (one row, id `default`) |
| Provider adapter | `server/src/lib/payments/provider.ts`: `PaymentProvider`, the `GatewayProvider` interface, and `manualUpiProvider`. The registered gateway list is deliberately empty. |
| Rules | `server/src/lib/payments/service.ts`: payment creation in the checkout transaction, keeping the unpaid amount in step with supplier changes, the fulfilment gate, refund-due calculation |
| Retailer API | `server/src/routes/retailerPayments.ts`, mounted under `/api/retailer` (retailer role) |
| Admin API | `server/src/routes/adminPayments.ts`, mounted under `/api/admin` (admin role) |
| Shared validation | `shared/src/payments.ts`: UTR, UPI ID, settings and action schemas; status labels |
| Razorpay | `server/src/lib/payments/razorpay.ts`: SDK wrapper (official `razorpay` Node SDK), signature checks (constant-time HMAC-SHA256), and `applyRazorpayPayment`, the only place a gateway result changes a payment. `server/src/routes/webhooks.ts`: `POST /api/webhooks/razorpay` (raw body). Client: `client/src/lib/razorpay.ts` loads Standard Checkout. |
| UI | Checkout (`client/src/pages/CheckoutPage.tsx`); `/account/orders/:id/pay` (`PaymentPage.tsx`); `/admin/payments`, `/admin/payments/:id` and `/admin/settings/payments` (`AdminPayments.tsx`); supplier order detail (payment status only) |

### Business model decisions

- **One payment per retailer order.** The retailer pays the whole order in one UPI transaction to the business. `Payment.supplierOrderId` is reserved for a future split-payment model and is not used.
- **Amount** is always computed on the server: the sum of the order's supplier groups that are still active. The browser never sends an amount, order owner or status; extra fields are ignored.
- **Before payment:** if a supplier rejects its group, or the retailer cancels one, the amount due drops automatically. If every group is gone, the payment is cancelled.
- **After payment:** the paid amount is never rewritten. A rejected or cancelled group becomes **refund due**, shown on the admin payment page. The admin refunds outside the platform and records it.
- **Supplier confirmation is unchanged.** Suppliers may confirm or reject as before.
- **Fulfilment waits for payment.** Moving a group to *processing* or adding *dispatch* details is refused until the order's payment is verified (`PAID` or `PARTIALLY_REFUNDED`). This applies **only to orders placed with a payment**. Orders placed while payments were switched off (including all orders from before this release) keep the old behaviour.
- **Stock** is still reserved at checkout, exactly as before. It's released when a supplier rejects or cancels, when the retailer cancels a group, or when an admin cancels an unpaid order (*Cancel order (not paid)*). Unpaid orders are **not** cancelled automatically, so reserved stock stays reserved until someone acts. Use the *Awaiting payment* tab to follow up.
- **Payments off:** while UPI QR is disabled or not configured, checkout works exactly as before (an order request with no payment record). The page tells the retailer that payment terms will be shared.

## Status transitions

```
            checkout (payments enabled)
                      │
                      ▼
   ┌──────────────► PENDING ──── all groups rejected/cancelled ───► CANCELLED
   │                  │   └───── admin: cancel order (not paid) ──► CANCELLED
   │                  │   └───── admin: verify with bank ref ───────► PAID
   │     retailer submits UTR (+ receipt)
   │                  ▼
   │              SUBMITTED ──── admin: verify (once) ─────────────► PAID
   │                  │                                              │
   │      admin: reject (reason required)            admin: record refund(s)
   │                  ▼                                              ▼
   └─ resubmit ─── REJECTED ── admin: cancel order ──► CANCELLED   PARTIALLY_REFUNDED ──► REFUNDED
```

- `FAILED` means a Razorpay payment failed. The retailer can retry, online or by UPI QR, and an admin can still cancel the order. A Razorpay capture moves `PENDING`, `REJECTED`, `FAILED` or `SUBMITTED` to `PAID`. It can also move `CANCELLED` to `PAID`, because money that arrived after a cancellation must be recorded; it then shows as a full **refund due**.
- Every transition is a **conditional update** on the current status, so a double click or two admins acting at once can't apply twice. The loser gets HTTP 409.
- Each transition writes a `PaymentEvent` (who, when, from → to, note, reference) and an `AuditLog` entry.
- References are masked in audit logs, for example `••••0577`.

## Admin: set up the QR (one time)

1. In your bank's merchant app, or the UPI app of the **business** account, download the account's static UPI QR as PNG or JPG. Use the original image, not a photo of a printout.
2. Sign in as admin and open **Settings · Payments** (`/admin/settings/payments`).
3. Click **Upload QR**. PNG, JPG or WebP, up to 2 MB, at least 200 px; the file's real signature and dimensions are checked. The image is stored privately (`uploads/private/payments/qr/…`) and is never served from a public URL.
4. **Scan the preview with a UPI app** and confirm the payee name it shows.
5. Enter the **Beneficiary display name**, exactly as UPI apps show it. Optionally also enter:
   - the UPI ID (enables *Copy UPI ID* and the mobile *Open UPI app* button);
   - payment instructions;
   - a support phone and email;
   - payment terms and refund instructions.
6. Tick **Enable UPI QR payments at checkout** and save. Enabling is refused until a QR and beneficiary name exist.
- *Enable payment gateway* stays disabled; the API refuses it while no gateway is integrated.
- **Replace QR** swaps the image and deletes the old file.
- **Remove** deletes it and switches UPI payments off.
- Every change is audited.

## How the retailer pays

1. **Checkout** shows *UPI QR payment*. **Place order and pay by UPI** creates the order, reserves stock and creates one `PENDING` payment, all in one transaction. The request carries a per-attempt `idempotencyKey`, so a refresh, retry or double click returns the **same** order.
2. They land on **Pay for your order** (`/account/orders/:id/pay`). It shows:
   - the order number and exact amount;
   - the internal reference (`PAY-<order number>`);
   - the QR, beneficiary and UPI ID (with copy and *Open UPI app* on phones);
   - instructions, support contacts, terms and a security note.
3. They pay in any UPI app, then submit the **UTR**, with an optional screenshot (JPG, PNG, WebP or PDF, up to 5 MB, signature-checked, stored privately).
4. The status becomes **Pending verification**, with the message *"Payment details submitted. Our team will verify your transaction."* No success animation is shown.
5. When the admin decides, they're notified:
   - **Verified:** the order shows *Paid · verified*.
   - **Rejected:** the reason is shown and they can resubmit on the same payment record.

The order page always shows the payment status and a *Pay now* link while payment is due.

## Admin: verify payments

**Payments** in the admin sidebar (`/admin/payments`) has:
- **Tabs:** Pending verification (with a sidebar badge), Awaiting payment, Paid, Rejected, Failed, Refunds and All.
- **Search** by order number, retailer business, UTR or `PAY-` reference.
- **Filters** for date range and amount range.

The **payment detail** page shows:
- the amount and the supplier breakdown, with each group's status;
- retailer and business details;
- the submitted UTR, submission time and attempt number;
- the receipt image or PDF (each view is audited);
- the full history and any refunds.

It flags a **UTR that appears on another payment**.

Actions:
- **Verify payment.** Only after you find a credit of the exact amount with that UTR in the business statement; a confirmation checkbox is required. It can be verified once only. If the retailer never submitted but you found the credit, you can verify with the bank reference you found. Suppliers are notified that they may start fulfilment.
- **Reject submission.** Requires a reason, which the retailer sees. The order isn't marked paid, and fulfilment stays blocked.
- **Record refund.** Only on verified payments, and capped at the remaining paid amount. Records the amount, an optional supplier group and reference, and a mandatory note. The status becomes `PARTIALLY_REFUNDED`, then `REFUNDED`. The retailer is notified.
- **Cancel order (not paid).** For unpaid payments only. Cancels every group that isn't in fulfilment, releases stock and notifies everyone.

Suppliers and retailers get 403 on every admin payment endpoint.

## Refund workflow

1. A supplier rejects or cancels a group after payment, or the business agrees a refund. The payment page shows **Refund due**.
2. Send the money from the business account (UPI or bank transfer) **outside the platform**.
3. **Record refund** with the amount, the supplier group, the refund transaction reference and a note.
4. The retailer is notified, and the status and history update.

The platform never moves money itself.

## Security controls

- **Permissions:** admin role for settings and verification; retailer role, scoped to the retailer's own orders, for payment pages, QR, submission and receipts. Suppliers see only the payment **status**, never the UTR, receipt or bank details.
- **Validation:** every input goes through server-side Zod. UTR: 6–30 letters or digits after removing spaces. UPI ID: `name@handle`. Phone and email are format-checked.
- **Uploads:** checked by real file signature and size, not by name or the browser's claimed type. Stored under `uploads/private/payments/…`, served only through role-checked routes with `Cache-Control: private, no-store` and a sandbox CSP. They can't be reached through `/uploads`.
- **Settings:** the QR and UPI ID are returned only to the retailer whose order is awaiting payment, and to admins. `/api/retailer/payment-options` returns only booleans.
- **Abuse protection:** at most 15 submissions per user per hour, plus the global API limit.
- **Duplicate protection:**
  - checkout idempotency key (unique);
  - same UTR resubmitted → idempotent;
  - different UTR while pending → 409;
  - a UTR already used on another order → 409.
- **Logging:** request logs contain only paths. Audit logs mask UTRs. No PINs, passwords, card numbers or CVVs are ever requested or stored.
- **No automatic bank verification:** nothing scrapes UPI apps or bank portals.

## Database migration

The migration is `server/prisma/migrations/20261107090000_payments` and is **additive only**:
- new `PaymentStatus` values: `SUBMITTED`, `REJECTED`, `PARTIALLY_REFUNDED`, `CANCELLED`;
- new nullable or defaulted columns on `payments` (`reference` is reused as the customer UTR);
- unique indexes on `internalReference`, `idempotencyKey` and `(provider, providerPaymentId)`;
- new tables `payment_events`, `payment_refunds` and `payment_settings`.

Before applying it, the development database was backed up and the migration was rehearsed on a restored copy with no drift. Apply it with `npm run prisma:deploy -w server`, or `npm run docker:migrate` for Docker, after `npm run db:backup` or `npm run docker:backup`.

## Testing

- `server/src/test/payments.test.ts` has 14 tests on a throwaway database, using a test image as the QR:
  - settings RBAC and validation;
  - one order and one payment per checkout, plus idempotent replay;
  - ownership and privacy of the QR and receipts;
  - the server-side amount;
  - submission never means paid;
  - duplicate UTRs;
  - verify once, reject with a reason, and no conflicting transitions;
  - suppliers can't verify;
  - fulfilment gate;
  - notifications;
  - amount sync after supplier rejection;
  - refund-due and refund caps;
  - cancel for non-payment releases stock;
  - payments off keeps the old behaviour.
- `scripts/e2e-payments.mjs <dir> <test-qr.png> <test-receipt.png> <photo.jpg>` runs the full flow in Chrome.
  - It refuses to run if a QR is already configured.
  - It uploads a clearly labelled TEST image, then removes it and switches payments off again. It verifies the restore and fails loudly if it can't.
  - Run `npm run e2e:cleanup` afterwards.

## Limitations of a static QR with manual verification

- A **static QR** doesn't carry the amount or order. The retailer types the amount (the *Open UPI app* link pre-fills it on phones) and may forget the remark. Matching relies on the **UTR plus the amount**.
- **Manual verification** takes staff time and isn't instant. Fulfilment waits for it.
- A **screenshot can be faked** and a UTR can be mistyped or reused. That's why verification must be against the bank statement, and why duplicate UTRs are flagged.
- **No automatic expiry.** Unpaid orders hold stock until an admin cancels them. Review *Awaiting payment* regularly. An automatic expiry, for example after 7 days, is a possible next step that the business must decide on.
- **Regulatory.** Collecting a retailer's money for goods sold by third-party suppliers, then paying those suppliers, can amount to acting as a payment aggregator or intermediary. Confirm the arrangement (commission-agent model, invoicing, GST and TCS obligations) with your CA or legal adviser before going live.

## Razorpay online payments

### How it works

1. **Checkout.** When online payments are on, checkout offers *Pay online — UPI, cards, net banking, wallets*. Placing the order creates the order, reserves stock and creates one `PENDING` payment (`provider = RAZORPAY`), in the same transaction as before. The order is idempotent per checkout attempt.
2. **Pay now.** On the payment page or the order page, *Pay ₹… now* calls `POST /api/retailer/orders/:id/payment/razorpay/order`.
   - The server creates a Razorpay **order** for the payment's **server-computed amount in paise**, stored in `payment_gateway_orders`.
   - Repeated clicks reuse the open order while the amount is unchanged, for up to 6 hours.
   - Only the **public key id** and the order id are returned.
3. **Standard Checkout** (`checkout.razorpay.com/v1/checkout.js`) opens. Card and UPI details are entered on Razorpay, never on Dhaaga Bazaar.
4. **Callback check.** On success, the browser posts `razorpay_order_id`, `razorpay_payment_id` and `razorpay_signature` to `…/payment/razorpay/verify`. The server:
   - checks the Razorpay order belongs to this retailer's payment;
   - verifies `HMAC_SHA256(order_id + "|" + payment_id, key_secret)` in constant time;
   - **fetches the payment from the Razorpay API** and acts only on what Razorpay reports:
     - `captured` with the expected amount and INR → `PAID`;
     - `authorized` → captured for exactly the order amount, then `PAID`;
     - `failed` → `FAILED`, and the retailer can retry;
     - anything else → pending; the page polls our own API until the webhook arrives.
5. **Webhooks** (`payment.captured`, `payment.authorized`, `order.paid`, `payment.failed`, `refund.processed`, `refund.failed`) apply the same rules, so a retailer who closes the browser after paying is still marked paid.
6. **Notifications:** the retailer and the suppliers in the order are notified. Suppliers may then start processing or dispatch, under the same fulfilment rule as manual payments.

**Never trusted:** a "success" event in the browser, any amount, order id or status sent by the browser, or a webhook without a valid signature.

### Idempotency and edge cases

| Situation | Behaviour |
|---|---|
| Checkout callback and webhook both arrive | One `PAID` and one `GATEWAY_CAPTURED` history entry. Every transition is a conditional update. |
| Same webhook delivered twice | `x-razorpay-event-id` is stored in `payment_webhook_events` (unique), and the repeat gets `200 {duplicate:true}`. |
| Processing error in a webhook | HTTP 500 and nothing recorded, so Razorpay retries. |
| Unknown order id or unhandled event type | `200`, recorded as `IGNORED`. |
| Captured amount ≠ order amount, or not INR | **Not** marked paid. A `GATEWAY_AMOUNT_MISMATCH` entry is recorded and admins are notified. |
| Second successful payment for an already-paid order | The original payment is kept. A `DUPLICATE_GATEWAY_PAYMENT` entry is recorded and admins are notified to refund it. |
| Payment captured after the order was cancelled | Recorded as `PAID` with a full **refund due**. Admins are notified. Stock is not re-reserved. |
| Supplier rejects a group before payment | The amount due drops, and the next *Pay now* creates a new Razorpay order for the new amount. |
| Callback lost and webhook not configured | Admin **Sync with Razorpay** re-reads the payment's Razorpay orders and applies them. |

### Refunds

For Razorpay payments, **Record refund** in the admin portal calls the Razorpay refund API, refunding to the original method. The refund is saved with its `rfnd_…` id as `PENDING`. A `refund.processed` webhook marks it `PROCESSED`. A `refund.failed` webhook marks it `FAILED`, **reverses** the refunded total and payment status, and alerts admins. Every attempt stays in the refund history.

Manual UPI refunds are unchanged: refund outside the platform, then record it.

### Test-mode setup

1. Create a Razorpay account. In **Test Mode**, go to Dashboard → Account & Settings → API Keys and generate a key pair (`rzp_test_…`).
2. Put the keys in `server/.env`, or `.env.docker` for Docker. Never commit them, and never put them in `VITE_` variables:
   ```
   RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
   RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxx
   RAZORPAY_WEBHOOK_SECRET=<a long random string you choose>
   ```
3. Restart the API. **Admin → Settings · Payments** shows *Configured · TEST mode*, the masked key id and the webhook URL.
4. **Webhook:** in Dashboard → Webhooks (Test Mode), add
   - **URL:** `https://<your-domain>/api/webhooks/razorpay`. The exact URL appears in Settings · Payments; it is `APP_URL` plus `/api/webhooks/razorpay`.
   - **Secret:** the same value as `RAZORPAY_WEBHOOK_SECRET`.
   - **Events:** `payment.captured`, `payment.failed`, `payment.authorized`, `order.paid`, `refund.processed`, `refund.failed`.

   Razorpay can't reach `localhost`. For local testing use a tunnel (for example `cloudflared tunnel --url http://localhost:4000`, or `ngrok http 4000`) and register the tunnel URL. Without webhooks, payments still complete through the checkout callback, and admins can use **Sync with Razorpay**.
5. Tick **Enable online payments (Razorpay)** and save.
6. Pay with Razorpay's test instruments, for example a test card or the test UPI ID `success@razorpay` / `failure@razorpay`, as listed in Razorpay's test-mode documentation. No real money moves.
7. **Behind nginx (Docker):** the web container's CSP already allows `checkout.razorpay.com` (script), `api.razorpay.com` and `checkout.razorpay.com` (frames), and `api.razorpay.com` and `lumberjack.razorpay.com` (connect). nginx forwards `/api/webhooks/razorpay` to the API unchanged.

### Live-mode activation (checklist)

1. **KYC and activation** of the Razorpay account are complete: business documents, bank account, website review. Razorpay must approve the **business model**, including that this is a marketplace selling goods of third-party suppliers.
2. Generate **live** keys in Live Mode, and add a **live** webhook with a new secret and the same events.
3. Set `RAZORPAY_KEY_ID=rzp_live_…`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` and **`RAZORPAY_ALLOW_LIVE=true`**. Live keys are refused without it. Restart and check that Settings · Payments shows *LIVE mode*.
4. `APP_URL` is your https domain, and the webhook URL is reachable over HTTPS.
5. Make one small real payment and one refund before announcing the feature. Check settlement in the Razorpay dashboard.
6. **Reconcile** daily against the Razorpay settlement report. Payments are searchable by `pay_…` and `order_…` ids.

### Marketplace settlement: what is NOT implemented

Ordinary Razorpay checkout settles **all** money to Dhaaga Bazaar's own account. **Supplier payouts and split settlements are deliberately not implemented.**
- Paying suppliers out of collected funds requires a marketplace product such as **Razorpay Route**.
- Under the RBI payment aggregator guidelines (September 2025), Route requires:
  - a turnover threshold (domestic turnover above ₹40 lakh in FY25 or FY26, evidenced by GST-3B, or export turnover above ₹5 lakh);
  - an approved use-case declaration;
  - onboarding of each supplier as a linked account.
- Confirm the merchant account's eligibility with Razorpay, and the arrangement (commission agent, invoicing, GST and TCS) with your CA, **before** building payouts.
- Until then, suppliers are settled outside the platform. The existing commission records track what is owed.

## Adding another payment gateway

Razorpay is implemented. A second provider, such as Cashfree, should follow the same pattern: a wrapper with a test seam, `payment_gateway_orders` to map provider orders to payments, a raw-body webhook with event-id idempotency, and one function that applies verified provider data. Requirements:

1. **Server-side order creation.** Create the provider order from `Payment.amountPaise`, never from the browser, and store the provider order and payment IDs (`provider`, `providerPaymentId`).
2. **Checkout signature verification.** For example, Razorpay's HMAC-SHA256 of `order_id|payment_id` with the key secret, verified on the server before anything else.
3. **Webhooks.** Verify the signature against the **raw** request body before parsing. Make handling idempotent: dedupe by event ID, and use conditional status updates. Mark `PAID` only from a verified event or a reconciliation fetch.
4. **Reconciliation.** A scheduled job fetches the status of payments stuck in pending and compares settlement reports with `payments`.
5. **Refunds.** Use the provider refund API with an idempotency key, recorded as `PaymentRefund` rows.
6. **Secrets.** Key ID and secret go in server environment variables only, never in `VITE_` variables or the database.
7. **Supplier split payouts.** Paying suppliers directly from the platform needs a marketplace product such as **Razorpay Route** or Cashfree's equivalent; a standard merchant account does **not** automatically permit holding and distributing third-party funds. Per Razorpay's Route documentation (checked November 2026):
   - Route is for "one-to-many disbursement" to linked accounts.
   - Under the RBI payment aggregator guidelines (September 2025), the platform must meet a turnover threshold: domestic turnover above ₹40 lakh in FY25 or FY26, evidenced by GST-3B, or export turnover above ₹5 lakh.
   - Razorpay must approve a written use-case declaration ("payer-payee transparency").
   - Linked accounts (suppliers) must be onboarded.
   - Access can be withdrawn if compliance proofs aren't submitted.
   - Confirm current eligibility with the provider before building split payouts.

Keep `gatewayEnabled` false until the integration, merchant account and credentials are in place and tested in the provider's test mode.

## Razorpay database migration

The migration is `server/prisma/migrations/20261108090000_razorpay` and is **additive only**:
- `payments.gatewayMethod` and `payments.failureReason`;
- `payment_refunds.providerRefundId` (unique) and `payment_refunds.status` (default `PROCESSED`, so existing refunds are unchanged);
- new tables `payment_gateway_orders` (unique `providerOrderId`) and `payment_webhook_events` (unique `provider + eventId`).

Before applying it, the development database was backed up and the migration was rehearsed on a restored copy with no drift.

## Razorpay tests

`server/src/test/razorpay.test.ts` has 14 tests using a **mocked Razorpay API**, so no network and no payments. They use test-only secrets and real HMAC signatures, and cover:
- configuration and admin-only access, with no secrets in responses;
- the server-side amount and order reuse;
- forged and wrong signatures rejected;
- a signed callback still not trusted when Razorpay reports failure;
- authorized → capture;
- amount mismatch;
- webhook signature, duplicate event id, callback/webhook race, a second payment on a paid order, `payment.failed`, unknown orders and event types;
- payment after cancellation;
- admin sync;
- refunds with `refund.processed` and `refund.failed` reversal;
- search by `pay_` id.
