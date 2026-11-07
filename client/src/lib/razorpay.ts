/**
 * Loads Razorpay Standard Checkout (checkout.js) on demand and opens it. The browser only ever
 * receives the public key id and a server-created order id; the result is sent back to our API,
 * which verifies the signature and asks Razorpay for the payment's real status.
 */
export interface RazorpaySuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open(): void;
  on(event: 'payment.failed', cb: (r: { error?: { description?: string } }) => void): void;
}
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

const SRC = 'https://checkout.razorpay.com/v1/checkout.js';
let loading: Promise<void> | null = null;

export function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      s.remove();
      reject(new Error('Razorpay Checkout could not be loaded. Check your connection and try again.'));
    };
    document.body.appendChild(s);
  });
  return loading;
}

export interface CheckoutOptions {
  keyId: string;
  razorpayOrderId: string;
  amountPaise: number;
  currency: string;
  name: string;
  description: string;
  prefill: { name?: string; email?: string; contact?: string };
  notes: Record<string, string>;
}

/** Opens Checkout. Resolves with Razorpay's ids + signature, or null if the customer closed it. */
export async function openRazorpayCheckout(o: CheckoutOptions, onFailed: (message: string) => void): Promise<RazorpaySuccess | null> {
  await loadRazorpayCheckout();
  return new Promise((resolve) => {
    const rzp = new window.Razorpay!({
      key: o.keyId,
      order_id: o.razorpayOrderId,
      amount: o.amountPaise,
      currency: o.currency,
      name: o.name,
      description: o.description,
      image: `${window.location.origin}/brand/logo.png`,
      prefill: o.prefill,
      notes: o.notes,
      theme: { color: '#54270F' },
      handler: (r: RazorpaySuccess) => resolve(r),
      modal: { ondismiss: () => resolve(null), confirm_close: true },
    });
    rzp.on('payment.failed', (r) => onFailed(r.error?.description ?? 'The payment did not go through.'));
    rzp.open();
  });
}
