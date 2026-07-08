import { Schema, model, Types } from 'mongoose';
import { logger } from '../../utils/logger';

// Append-only evidence trail: every certification, readiness change, audit
// decision, and admin data access (PRD §11). Retained ≥ 8 years — no TTL here.
export interface IAuditLog {
  actorId?: Types.ObjectId;
  action: string;
  entity: string;
  entityId?: string;
  meta?: Record<string, unknown>;
  at: Date;
}

const auditLogSchema = new Schema<IAuditLog>({
  actorId: { type: Schema.Types.ObjectId, ref: 'User' },
  action: { type: String, required: true },
  entity: { type: String, required: true },
  entityId: { type: String },
  meta: { type: Schema.Types.Mixed },
  at: { type: Date, required: true },
});

auditLogSchema.index({ entity: 1, entityId: 1, at: -1 });

export const AuditLog = model<IAuditLog>('AuditLog', auditLogSchema);

export async function logAudit(
  action: string,
  entity: string,
  entityId?: string,
  actorId?: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  try {
    await AuditLog.create({
      action,
      entity,
      entityId,
      actorId: actorId ? new Types.ObjectId(actorId) : undefined,
      meta,
      at: new Date(),
    });
  } catch (err) {
    // The audit trail must never take down the request path — log and continue.
    logger.error('AuditLog write failed', { action, entity, message: (err as Error).message });
  }
}
