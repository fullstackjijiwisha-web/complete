import { Schema, model, Types } from 'mongoose';

// Organisation-level "POSH Ready" certificate: issued automatically when the
// org crosses the 95% readiness threshold (Step 5). This attests self-assessed
// readiness only — NOT the audited "POSH Compliant" status (that is a separate
// ComplianceCertificate issued after a Jijiwisha audit). One per org per cycle.
export interface IReadyCertificate {
  readyId: string;
  orgId: Types.ObjectId;
  cycle: string;
  score: number; // readiness score at issue (share of employees certified)
  issuedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const readyCertificateSchema = new Schema<IReadyCertificate>(
  {
    readyId: { type: String, required: true, unique: true },
    orgId: { type: Schema.Types.ObjectId, ref: 'Organisation', required: true, index: true },
    cycle: { type: String, required: true },
    score: { type: Number, required: true },
    issuedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

readyCertificateSchema.index({ orgId: 1, cycle: 1 }, { unique: true });

export const ReadyCertificate = model<IReadyCertificate>('ReadyCertificate', readyCertificateSchema);
