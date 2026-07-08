import { Schema, model, Types } from 'mongoose';

export interface IInvite {
  email: string;
  orgId: Types.ObjectId;
  userId: Types.ObjectId;
  tokenHash: string; // sha256 of the raw token — raw value only ever lives in the email link
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const inviteSchema = new Schema<IInvite>(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    orgId: { type: Schema.Types.ObjectId, ref: 'Organisation', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tokenHash: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// TTL sweep — Mongo removes expired invites automatically (blueprint §6).
inviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Invite = model<IInvite>('Invite', inviteSchema);
