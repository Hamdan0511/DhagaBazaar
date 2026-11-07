/** Payment shapes returned by the API (see server/src/routes/retailerPayments.ts and adminPayments.ts). */
export interface RetailerPayment {
  id: string;
  status: string;
  method: string;
  amountPaise: number;
  refundedPaise: number;
  internalReference: string | null;
  reference: string | null;
  hasReceipt: boolean;
  submittedAt: string | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
  failureReason: string | null;
  provider: string;
  gatewayMethod: string | null;
  submissionCount: number;
  createdAt: string;
  history: { type: string; status: string | null; note: string | null; at: string }[];
}

export interface RetailerPaymentResponse {
  orderNumber: string;
  payment: RetailerPayment;
  instructions: {
    beneficiaryName: string | null;
    upiId: string | null;
    qrUrl: string;
    upiUri: string | null;
    instructions: string | null;
    paymentTerms: string | null;
  } | null;
  paymentsAvailable: boolean;
  /** Present when online payment (Razorpay) can be used for this order. */
  gateway: { provider: 'RAZORPAY'; mode: 'test' | 'live' | null } | null;
  support: { phone: string | null; email: string | null };
  refundPolicy: string | null;
  receiptUrl: string | null;
}

export interface PaymentSettingsView {
  manualUpiEnabled: boolean;
  gatewayEnabled: boolean;
  gatewayAvailable: boolean;
  hasQr: boolean;
  qrUrl: string | null;
  upiId: string | null;
  beneficiaryName: string | null;
  instructions: string | null;
  supportPhone: string | null;
  supportEmail: string | null;
  paymentTerms: string | null;
  refundPolicy: string | null;
  ready: boolean;
  updatedAt: string;
  gateway: {
    provider: 'RAZORPAY';
    configured: boolean;
    mode: 'test' | 'live' | null;
    keyId: string | null;
    webhookConfigured: boolean;
    webhookUrl: string;
    problem: string | null;
    ready: boolean;
  };
}

/** Status-badge tone for each payment status. */
export const PAYMENT_TONE: Record<string, string> = {
  PENDING: 'PENDING',
  SUBMITTED: 'PENDING_REVIEW',
  PAID: 'APPROVED',
  REJECTED: 'REJECTED',
  FAILED: 'REJECTED',
  PARTIALLY_REFUNDED: 'INFO_REQUESTED',
  REFUNDED: 'ARCHIVED',
  CANCELLED: 'CANCELLED',
};
