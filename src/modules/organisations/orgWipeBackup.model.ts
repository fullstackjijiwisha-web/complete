import { Schema, model, Types } from 'mongoose';

// Full snapshot taken immediately before a super-admin "wipe all organisations"
// reset (see organisation.reset.ts). Stored in Mongo rather than on disk so it
// survives a serverless/ephemeral filesystem (Vercel) — this is the recovery
// copy if the reset is ever triggered by mistake.
export interface IOrgWipeBackup {
  triggeredBy: string; // human-readable origin: admin email, or 'cli-script'
  performedBy?: Types.ObjectId; // set when triggered via the API by an authenticated super admin
  performedAt: Date;
  counts: Record<string, number>;
  data: Record<string, unknown[]>;
  createdAt: Date;
  updatedAt: Date;
}

const orgWipeBackupSchema = new Schema<IOrgWipeBackup>(
  {
    triggeredBy: { type: String, required: true },
    performedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    performedAt: { type: Date, required: true },
    counts: { type: Schema.Types.Mixed, required: true },
    data: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

orgWipeBackupSchema.index({ performedAt: -1 });

export const OrgWipeBackup = model<IOrgWipeBackup>('OrgWipeBackup', orgWipeBackupSchema);
