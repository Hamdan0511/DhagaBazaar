import { z } from 'zod';

/** Payment statuses (see docs/PAYMENTS.md for the state machine). */
export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Awaiting payment',
  SUBMITTED: 'Pending verification',
  PAID: 'Paid · verified',
  REJECTED: 'Not verified',
  FAILED: 'Failed',
  PARTIALLY_REFUNDED: 'Partly refunded',
  REFUNDED: 'Refunded',
  CANCELLED: 'Cancelled',
};

/** Statuses in which the payment counts as received (suppliers may fulfil). */
export const PAYMENT_SETTLED_STATUSES = ['PAID', 'PARTIALLY_REFUNDED'] as const;

/**
 * UPI transaction reference (UTR, 12 digits) or a bank/IMPS reference. Spaces and dashes are
 * removed; 6–30 letters/digits. This is the customer's claim — it proves nothing until an admin
 * has found the credit in the business account.
 */
export const paymentReferenceSchema = z
  .string({ required_error: 'Enter the UPI transaction reference (UTR)' })
  .transform((v) => v.replace(/[\s-]/g, '').toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9]{6,30}$/, 'Enter the 12-digit UPI reference (UTR) or bank reference shown in your payment app'));

export const paymentSubmitSchema = z.object({ reference: paymentReferenceSchema });

/** VPA such as business@okhdfcbank. */
export const upiIdSchema = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/, 'Enter a valid UPI ID, e.g. business@bank');

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const paymentSettingsSchema = z.object({
  manualUpiEnabled: z.boolean(),
  gatewayEnabled: z.boolean(),
  upiId: z
    .union([upiIdSchema, z.literal(''), z.null()])
    .optional()
    .transform((v) => (v ? v : null)),
  beneficiaryName: optionalText(120),
  instructions: optionalText(2000),
  supportPhone: z
    .union([z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, 'Enter a valid phone number'), z.literal(''), z.null()])
    .optional()
    .transform((v) => (v ? v : null)),
  supportEmail: z
    .union([z.string().trim().email('Enter a valid email address'), z.literal(''), z.null()])
    .optional()
    .transform((v) => (v ? v : null)),
  paymentTerms: optionalText(4000),
  refundPolicy: optionalText(4000),
});
export type PaymentSettingsInput = z.infer<typeof paymentSettingsSchema>;

export const paymentVerifySchema = z.object({
  /** Required when verifying a payment the retailer has not submitted (admin found the credit). */
  reference: paymentReferenceSchema.optional(),
  note: z.string().trim().max(500).optional(),
});
export const paymentRejectSchema = z.object({ reason: z.string().trim().min(5, 'Give the retailer a reason (at least 5 characters)').max(500) });
export const paymentRefundSchema = z.object({
  amountPaise: z.number().int().positive('Enter a refund amount'),
  supplierOrderId: z.string().min(1).optional(),
  reference: z
    .union([paymentReferenceSchema, z.literal('')])
    .optional()
    .transform((v) => (v ? v : undefined)),
  note: z.string().trim().min(5, 'Describe the refund (at least 5 characters)').max(500),
});
export const paymentCancelSchema = z.object({ reason: z.string().trim().min(5, 'Give a reason (at least 5 characters)').max(500) });

/** Masks a reference for logs and lists: ••••1234. */
export const maskReference = (ref: string | null | undefined) => (ref ? `••••${ref.slice(-4)}` : null);
