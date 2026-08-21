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

// ── Single organisation ──────────────────────────────────────────────────
// Deleting ONE organisation, as opposed to the platform-wide wipe above.
// This is a HARD delete on purpose: the HR admin's email address and the
// organisation code are unique, so a soft delete would leave both taken and
// the organisation could never re-register. Everything is snapshotted into
// OrgWipeBackup first, and certificates issued to its employees go with it —
// their public verification links stop resolving, which is the intended
// meaning of "this organisation was removed".

export interface OrgDeletePreview {
  orgId: string;
  name: string;
  orgCode: string;
  // HR admin logins that are freed for re-registration by this delete.
  hrEmails: string[];
  counts: WipeCounts;
}

function orgScope(orgId: string) {
  return { orgId: new Types.ObjectId(orgId) };
}

export async function previewOrganisationDelete(orgId: string): Promise<OrgDeletePreview | null> {
  const org = await Organisation.findById(orgId).lean();
  if (!org) return null;
  const scope = orgScope(orgId);
  const hrAdmins = await User.find({ ...scope, role: 'hr_admin' }).select('email').lean();
  const [users, attempts, certificates, audits, payments, invites] = await Promise.all([
    User.countDocuments({ ...scope, role: { $in: ORG_SCOPED_ROLES } }),
    AssessmentAttempt.countDocuments(scope),
    Certificate.countDocuments(scope),
    Audit.countDocuments(scope),
    Payment.countDocuments(scope),
    Invite.countDocuments(scope),
  ]);
  return {
    orgId: String(org._id),
    name: org.name,
    orgCode: org.orgCode,
    hrEmails: hrAdmins.map((u) => u.email),
    counts: { organisations: 1, users, attempts, certificates, audits, payments, invites },
  };
}

export async function deleteOrganisation(
  orgId: string,
  performedByUserId?: string,
): Promise<WipeResult | null> {
  const org = await Organisation.findById(orgId).lean();
  if (!org) return null;
  const scope = orgScope(orgId);
  const userFilter = { ...scope, role: { $in: ORG_SCOPED_ROLES } };

  const [users, attempts, certificates, audits, payments, invites] = await Promise.all([
    User.find(userFilter).lean(),
    AssessmentAttempt.find(scope).lean(),
    Certificate.find(scope).lean(),
    Audit.find(scope).lean(),
    Payment.find(scope).lean(),
    Invite.find(scope).lean(),
  ]);

  const counts: WipeCounts = {
    organisations: 1,
    users: users.length,
    attempts: attempts.length,
    certificates: certificates.length,
    audits: audits.length,
    payments: payments.length,
    invites: invites.length,
  };
  const backup: Record<string, unknown[]> = {
    organisations: [org],
    users,
    attempts,
    certificates,
    audits,
    payments,
    invites,
  };

  const backupDoc = await OrgWipeBackup.create({
    triggeredBy: `delete-org:${org.orgCode}`,
    performedBy: performedByUserId ? new Types.ObjectId(performedByUserId) : undefined,
    performedAt: new Date(),
    counts,
    data: backup,
  });

  // Release any audit slots this organisation had booked (see wipeAll above).
  const slotIds = audits.map((a) => a.slotId).filter((id): id is Types.ObjectId => Boolean(id));
  if (slotIds.length) {
    await AuditSlot.updateMany({ _id: { $in: slotIds } }, { $set: { isBooked: false } });
  }

  await Promise.all([
    Organisation.deleteOne({ _id: org._id }),
    User.deleteMany(userFilter),
    AssessmentAttempt.deleteMany(scope),
    Certificate.deleteMany(scope),
    Audit.deleteMany(scope),
    Payment.deleteMany(scope),
    Invite.deleteMany(scope),
  ]);

  await logAudit('admin.organisation_deleted', 'Organisation', String(org._id), performedByUserId, {
    backupId: backupDoc.id,
    name: org.name,
    orgCode: org.orgCode,
    counts,
  });

  return { backupId: backupDoc.id, counts, backup };
}
