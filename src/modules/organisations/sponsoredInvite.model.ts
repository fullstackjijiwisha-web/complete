import { Schema, model, Types } from 'mongoose';

// A shareable registration link that waives the payment step: an organisation
// opening it registers normally and lands with seats already active. Only the
// super admin can mint one (PRD F2 — the payment gate is otherwise absolute).
//
// The code is stored in clear rather than hashed on purpose: it is a coupon the
// operator re-copies from the panel to share again, not a credential. It grants
// nothing beyond free seats, is revocable, use-capped and expirable — but treat
// it as sensitive, since anyone holding it can register without paying.
export interface ISponsoredInvite {
  code: string;
  label: string; // who it was minted for, e.g. "NGO partner — Sept batch"
  maxUses: number;
  uses: number;
  usedBy: Array<{ orgId: Types.ObjectId; orgName: string; orgCode: string; usedAt: Date }>;
  expiresAt?: Date;
  revoked: boolean;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const sponsoredInviteSchema = new Schema<ISponsoredInvite>(
  {
    code: { type: String, required: true, unique: true, index: true },
    label: { type: String, required: true, trim: true },
    maxUses: { type: Number, required: true, min: 1, default: 1 },
    uses: { type: Number, required: true, default: 0 },
    usedBy: [
      {
        orgId: { type: Schema.Types.ObjectId, ref: 'Organisation', required: true },
        orgName: { type: String, required: true },
        orgCode: { type: String, required: true },
        usedAt: { type: Date, required: true },
      },
    ],
    // Absent means it never expires — deliberately allowed for long-running
    // partner programmes; revoke to end one.
    expiresAt: { type: Date },
    revoked: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export const SponsoredInvite = model<ISponsoredInvite>('SponsoredInvite', sponsoredInviteSchema);

// Claims one use atomically, so two organisations registering at the same
// instant can never take the same last seat. Returns null when the code is
// unknown, revoked, expired or exhausted.
export async function claimSponsoredInvite(code: string) {
  return SponsoredInvite.findOneAndUpdate(
    {
      code: code.trim().toUpperCase(),
      revoked: false,
      $expr: { $lt: ['$uses', '$maxUses'] },
      $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    },
    { $inc: { uses: 1 } },
    { new: true },
  );
}

export async function releaseSponsoredInvite(code: string): Promise<void> {
  await SponsoredInvite.updateOne({ code: code.trim().toUpperCase() }, { $inc: { uses: -1 } });
}
