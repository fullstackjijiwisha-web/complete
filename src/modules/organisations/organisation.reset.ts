import { Types } from 'mongoose';
import { Organisation } from './organisation.model';
import { OrgWipeBackup } from './orgWipeBackup.model';
import { User } from '../users/user.model';
import { AssessmentAttempt } from '../assessments/attempt.model';
import { Certificate } from '../certificates/certificate.model';
import { Audit, AuditSlot } from '../audits/audit.model';
import { Payment } from '../payments/payment.model';
import { Invite } from '../auth/invite.model';
import { logAudit } from '../auditlog/auditLog.model';
import type { Role } from '../../types';

// Only HR admins and employees belong to an organisation — super admins and
// auditors never carry an orgId. Filtering on both is belt-and-braces so a
// future schema change can't accidentally sweep platform-operator accounts.
const ORG_SCOPED_ROLES: Role[] = ['hr_admin', 'employee'];
const ORG_SCOPED_USER_FILTER = { orgId: { $ne: null }, role: { $in: ORG_SCOPED_ROLES } };

export interface WipeCounts {
  organisations: number;
  users: number;
  attempts: number;
  certificates: number;
  audits: number;
  payments: number;
  invites: number;
  [key: string]: number;
}

export async function previewOrganisationWipe(): Promise<WipeCounts> {
  const [organisations, users, attempts, certificates, audits, payments, invites] = await Promise.all([
    Organisation.countDocuments({}),
    User.countDocuments(ORG_SCOPED_USER_FILTER),
    AssessmentAttempt.countDocuments({}),
    Certificate.countDocuments({}),
    Audit.countDocuments({}),
    Payment.countDocuments({}),
    Invite.countDocuments({}),
  ]);
  return { organisations, users, attempts, certificates, audits, payments, invites };
}

export interface WipeResult {
  backupId: string;
  counts: WipeCounts;
  backup: Record<string, unknown[]>;
}

/* Permanently deletes every organisation and everything scoped to it: HR/employee
   accounts, assessment attempts, certificates, audits, payments, and pending
   invites. Never touches super_admin/auditor accounts, the question bank,
   AuditSlot documents (platform calendar, not org data), or the AuditLog
   append-only evidence trail (PRD §11 — retained ≥ 8 years regardless).

   Takes a full snapshot into OrgWipeBackup *before* deleting anything, so the
   action is recoverable by hand even though it is not automatically undoable. */
export async function wipeAllOrganisations(
  triggeredBy: string,
  performedByUserId?: string,
): Promise<WipeResult> {
  const [organisations, users, attempts, certificates, audits, payments, invites] = await Promise.all([
    Organisation.find({}).lean(),
    User.find(ORG_SCOPED_USER_FILTER).lean(),
    AssessmentAttempt.find({}).lean(),
    Certificate.find({}).lean(),
    Audit.find({}).lean(),
    Payment.find({}).lean(),
    Invite.find({}).lean(),
  ]);

  const counts: WipeCounts = {
    organisations: organisations.length,
    users: users.length,
    attempts: attempts.length,
    certificates: certificates.length,
    audits: audits.length,
    payments: payments.length,
    invites: invites.length,
  };
  const backup: Record<string, unknown[]> = {
    organisations,
    users,
    attempts,
    certificates,
    audits,
    payments,
    invites,
  };

  const backupDoc = await OrgWipeBackup.create({
    triggeredBy,
    performedBy: performedByUserId ? new Types.ObjectId(performedByUserId) : undefined,
    performedAt: new Date(),
    counts,
    data: backup,
  });

  // Slots booked by a deleted audit would otherwise be stuck "booked" forever
  // with nothing pointing at them — release them back to the open calendar.
  const slotIds = audits
    .map((a) => a.slotId)
    .filter((id): id is Types.ObjectId => Boolean(id));
  if (slotIds.length) {
    await AuditSlot.updateMany({ _id: { $in: slotIds } }, { $set: { isBooked: false } });
  }

  await Promise.all([
    Organisation.deleteMany({}),
    User.deleteMany(ORG_SCOPED_USER_FILTER),
    AssessmentAttempt.deleteMany({}),
    Certificate.deleteMany({}),
    Audit.deleteMany({}),
    Payment.deleteMany({}),
    Invite.deleteMany({}),
  ]);

  await logAudit('admin.organisations_wiped', 'Organisation', 'ALL', performedByUserId, {
    backupId: backupDoc.id,
    triggeredBy,
    counts,
  });

  return { backupId: backupDoc.id, counts, backup };
}
