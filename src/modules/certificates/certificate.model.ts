import { Schema, model, Types } from 'mongoose';
import type { ScoreBand } from '../../types';

export interface ICertificate {
  certId: string;
  userId: Types.ObjectId;
  orgId: Types.ObjectId;
  score: number;
  scoreBand: ScoreBand;
  cycle: string;
  issuedAt: Date;
  evidenceRef: Types.ObjectId; // attemptId — the audit-grade evidence trail
  revoked: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const certificateSchema = new Schema<ICertificate>(
  {
    certId: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    orgId: { type: Schema.Types.ObjectId, ref: 'Organisation', required: true },
    score: { type: Number, required: true },
    scoreBand: { type: String, required: true },
    cycle: { type: String, required: true },
    issuedAt: { type: Date, required: true },
    evidenceRef: { type: Schema.Types.ObjectId, ref: 'AssessmentAttempt', required: true },
    revoked: { type: Boolean, default: false },
  },
  { timestamps: true },
);

certificateSchema.index({ userId: 1, cycle: 1 });
certificateSchema.index({ orgId: 1, cycle: 1 });

export const Certificate = model<ICertificate>('Certificate', certificateSchema);
