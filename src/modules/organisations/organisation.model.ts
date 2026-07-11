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

export type CompanySize = 'micro' | 'small' | 'medium' | 'large';

export interface IOrganisation {
  name: string;
  orgCode: string;
  registrationNo?: string;
  industry?: string;
  companySize?: CompanySize;
  /** GST Identification Number — optional; formats vary by state */
  gst?: string;
  billingContact?: {
    name?: string;
    email?: string;
  };
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
  lastImportErrors?: Array<{ row: number; error: string }>;
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
    industry: { type: String, trim: true },
    companySize: { type: String, enum: ['micro', 'small', 'medium', 'large'] },
    gst: { type: String, trim: true },
    billingContact: {
      name: { type: String, trim: true },
      email: { type: String, trim: true, lowercase: true },
    },
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
    lastImportErrors: [
      {
        row: { type: Number, required: true },
        error: { type: String, required: true },
      },
    ],
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

export const Organisation = model<IOrganisation>('Organisation', organisationSchema);
