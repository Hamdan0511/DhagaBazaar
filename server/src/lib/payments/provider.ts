import { razorpayConfigured } from './razorpay.js';
/**
 * Payment provider adapter interface.
 *
 * Checkout and the admin portal work with Payment records and statuses; HOW money is collected is
 * a provider concern. MANUAL_UPI: the retailer pays the business's own UPI QR and an admin
 * verifies the credit in the bank account. RAZORPAY: Standard Checkout, verified by signature and
 * the Razorpay API/webhooks. The state machine is provider-neutral.
 *
 * Razorpay is implemented in razorpay.ts (orders, signature + API verification, webhooks, refunds).
 * Additional gateways follow the GatewayProvider contract below. See docs/PAYMENTS.md ("Adding a payment gateway") for the
 * requirements: server-side order creation, signature and webhook verification, idempotent
 * webhook handling, reconciliation, refunds and — for supplier split payouts — a marketplace
 * product such as Razorpay Route, which needs separate eligibility approval.
 */

export type ProviderName = 'MANUAL_UPI' | 'RAZORPAY' | 'CASHFREE';

export interface PaymentProvider {
  name: ProviderName;
  /** Method stored on the Payment row. */
  method: string;
  /**
   * Whether payments are verified by the provider (signature/webhook) or by a human.
   * Manual providers must never mark a payment PAID on the customer's word.
   */
  verification: 'MANUAL_ADMIN' | 'PROVIDER_SIGNATURE';
}

/** What a future gateway adapter must implement. Every method runs on the server only. */
export interface GatewayProvider extends PaymentProvider {
  verification: 'PROVIDER_SIGNATURE';
  /** Create the provider order for the authoritative amount (never an amount from the browser). */
  createOrder(input: { paymentId: string; amountPaise: number; currency: 'INR'; receipt: string; idempotencyKey: string }): Promise<{ providerOrderId: string; checkoutPayload: Record<string, unknown> }>;
  /** Verify the client-side callback signature (e.g. HMAC-SHA256 of order_id|payment_id with the key secret). */
  verifyCheckoutSignature(input: { providerOrderId: string; providerPaymentId: string; signature: string }): boolean;
  /** Verify a webhook's signature against the raw request body before parsing it. */
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean;
  /** Fetch the provider's authoritative status (reconciliation). */
  fetchStatus(providerPaymentId: string): Promise<'PAID' | 'FAILED' | 'PENDING'>;
  refund(input: { providerPaymentId: string; amountPaise: number; idempotencyKey: string; note: string }): Promise<{ providerRefundId: string }>;
}

export const manualUpiProvider: PaymentProvider = { name: 'MANUAL_UPI', method: 'UPI_QR', verification: 'MANUAL_ADMIN' };

export const razorpayProvider: PaymentProvider = { name: 'RAZORPAY', method: 'RAZORPAY', verification: 'PROVIDER_SIGNATURE' };

/**
 * A gateway can be enabled only when one is configured on the server. Today that is Razorpay
 * (lib/payments/razorpay.ts) with RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET; live keys additionally
 * need RAZORPAY_ALLOW_LIVE=true.
 */
export const gatewayAvailable = () => razorpayConfigured();
