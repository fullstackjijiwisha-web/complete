import { Schema, model } from 'mongoose';

export type ComplianceStatus =
  | 'not_started'
  | 'declined' // HR chose to stop at the POSH Ready certificate (no audit)
  | 'requested'
  | 'scheduled'
  | 'in_review'
  | 'changes_requested'
  | 'passed'
  | 'failed'
  | 'certificate_issued';

export interface IOrganisation {
  name: string;
  orgCode: string;
  registrationNo?: string;
  headcount: number;
  reportingPeriod?: { start: Date; end: Date };
  pricingTier?: string;
  // Seats unlock after Razorpay payment (PRD F2). Enforced only when Razorpay
  // is configured so local development works without a gateway account.
  seatsActive: boolean;
  employeeSeq: number;
  readiness: {
    score: number;
    isReady: boolean;
    achievedAt?: Date;
    cycle?: string;
    // POSH Ready certificate — org-level, issued automatically at 95% (Step 5).
    // Distinct from the audited POSH Compliant certificate below.
    certificateId?: string;
    certificateIssuedAt?: Date;
  };
  compliance: {
    status: ComplianceStatus;
    certificateId?: string;
    validTill?: Date;
  };
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const organisationSchema = new Schema<IOrganisation>(
  {
    name: { type: String, required: true, trim: true },
    orgCode: { type: String, required: true, unique: true },
    registrationNo: { type: String },
    headcount: { type: Number, required: true, min: 1 },
    reportingPeriod: { start: Date, end: Date },
    pricingTier: { type: String },
    seatsActive: { type: Boolean, default: false },
    employeeSeq: { type: Number, default: 0 },
    readiness: {
      score: { type: Number, default: 0 },
      isReady: { type: Boolean, default: false },
      achievedAt: { type: Date },
      cycle: { type: String },
      certificateId: { type: String },
      certificateIssuedAt: { type: Date },
    },
    compliance: {
      status: {
        type: String,
        enum: [
          'not_started',
          'declined',
          'requested',
          'scheduled',
          'in_review',
          'changes_requested',
          'passed',
          'failed',
          'certificate_issued',
        ],
        default: 'not_started',
      },
      certificateId: { type: String },
      validTill: { type: Date },
    },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

export const Organisation = model<IOrganisation>('Organisation', organisationSchema);
