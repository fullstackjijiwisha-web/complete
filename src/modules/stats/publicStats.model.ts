import { Schema, model } from 'mongoose';

// Singleton cached document — refreshed by cron and on-demand when stale.
// Public counters are never computed live per page view (PRD F1).
export interface IPublicStats {
  key: 'current';
  employeesAssessed: number;
  orgsReady: number;
  auditsCompleted: number;
  complianceIssued: number;
  trustScore?: number; // methodology pending (PRD §16.8) — set via Super Admin moderation
  refreshedAt: Date;
}

const publicStatsSchema = new Schema<IPublicStats>({
  key: { type: String, default: 'current', unique: true },
  employeesAssessed: { type: Number, default: 0 },
  orgsReady: { type: Number, default: 0 },
  auditsCompleted: { type: Number, default: 0 },
  complianceIssued: { type: Number, default: 0 },
  trustScore: { type: Number },
  refreshedAt: { type: Date, required: true },
});

export const PublicStats = model<IPublicStats>('PublicStats', publicStatsSchema);
