import { Schema, model, Types } from 'mongoose';

export type AuditStatus =
  | 'requested'
  | 'scheduled'
  | 'in_review'
  | 'changes_requested'
  | 'passed'
  | 'failed'
  | 'certificate_issued';

export type ChecklistStatus = 'pending' | 'ok' | 'issue';

export interface IChecklistItem {
  item: string;
  status: ChecklistStatus;
  note?: string;
}

export interface IAuditDocument {
  name: string;
  url: string; // storage integration (S3/Cloudinary signed upload) is an open infra item — PRD §16
  uploadedAt: Date;
}

export interface IAudit {
  orgId: Types.ObjectId;
  status: AuditStatus;
  slotId?: Types.ObjectId;
  auditorId?: Types.ObjectId;
  documents: IAuditDocument[];
  checklist: IChecklistItem[];
  findings?: string;
  decisionAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// NCW-aligned verification checklist template (PRD §3.4), seeded on booking.
export const NCW_CHECKLIST_TEMPLATE: string[] = [
  'POSH policy document in force and communicated',
  'Annual report filings (Section 21) available',
  'Training & assessment records (platform evidence attached)',
  'Complaint-handling procedure documented and known',
  'Awareness measures and employer duties under Section 19',
  'IC constituted: Presiding Officer appointed',
  'IC member composition compliant (incl. external member)',
  'IC tenure and functioning verified',
];

const auditSchema = new Schema<IAudit>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Organisation', required: true, index: true },
    status: {
      type: String,
      enum: [
        'requested',
        'scheduled',
        'in_review',
        'changes_requested',
        'passed',
        'failed',
        'certificate_issued',
      ],
      default: 'requested',
    },
    slotId: { type: Schema.Types.ObjectId, ref: 'AuditSlot' },
    auditorId: { type: Schema.Types.ObjectId, ref: 'User' },
    documents: [
      {
        name: { type: String, required: true },
        url: { type: String, required: true },
        uploadedAt: { type: Date, required: true },
      },
    ],
    checklist: [
      {
        item: { type: String, required: true },
        status: { type: String, enum: ['pending', 'ok', 'issue'], default: 'pending' },
        note: { type: String },
      },
    ],
    findings: { type: String },
    decisionAt: { type: Date },
  },
  { timestamps: true },
);

export const Audit = model<IAudit>('Audit', auditSchema);

export interface IAuditSlot {
  startsAt: Date;
  isBooked: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const auditSlotSchema = new Schema<IAuditSlot>(
  {
    startsAt: { type: Date, required: true },
    isBooked: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const AuditSlot = model<IAuditSlot>('AuditSlot', auditSlotSchema);
