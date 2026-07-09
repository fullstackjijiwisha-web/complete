import { Schema, model, Types } from 'mongoose';

export type PaymentType = 'seats' | 'audit';
export type PaymentStatus = 'created' | 'paid' | 'failed';
export type PaymentProvider = 'razorpay' | 'shopify';

export interface IPayment {
  orgId: Types.ObjectId;
  type: PaymentType;
  provider: PaymentProvider;
  // Gateway order reference (Razorpay order id, or "shopify-<orderId>"). Kept
  // under the original field name to avoid a migration; unique across providers.
  razorpayOrderId: string;
  amountPaise: number; // amounts in paise only — never floats (PRD §6)
  status: PaymentStatus;
  webhookVerifiedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Organisation', required: true, index: true },
    type: { type: String, enum: ['seats', 'audit'], required: true },
    provider: { type: String, enum: ['razorpay', 'shopify'], default: 'razorpay' },
    razorpayOrderId: { type: String, required: true, unique: true },
    amountPaise: { type: Number, required: true },
    status: { type: String, enum: ['created', 'paid', 'failed'], default: 'created' },
    webhookVerifiedAt: { type: Date },
  },
  { timestamps: true },
);

export const Payment = model<IPayment>('Payment', paymentSchema);
