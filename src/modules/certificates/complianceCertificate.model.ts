import { Schema, model, Types } from 'mongoose';

export interface IComplianceCertificate {
  compId: string;
  orgId: Types.ObjectId;
  auditId: Types.ObjectId;
  issuedAt: Date;
  validTill: Date; // 13-month validity; renewal reminders at T-60/T-30 via cron
  createdAt: Date;
  updatedAt: Date;
}

const complianceCertificateSchema = new Schema<IComplianceCertificate>(
  {
    compId: { type: String, required: true, unique: true },
    orgId: { type: Schema.Types.ObjectId, ref: 'Organisation', required: true },
    auditId: { type: Schema.Types.ObjectId, ref: 'Audit', required: true },
    issuedAt: { type: Date, required: true },
    validTill: { type: Date, required: true },
  },
  { timestamps: true },
);

export const ComplianceCertificate = model<IComplianceCertificate>(
  'ComplianceCertificate',
  complianceCertificateSchema,
);
