import type { HydratedDocument } from 'mongoose';
import { Types } from 'mongoose';
import { Organisation } from '../organisations/organisation.model';
import type { IOrganisation } from '../organisations/organisation.model';
import { User } from '../users/user.model';
import { Certificate } from '../certificates/certificate.model';
import { ReadyCertificate } from '../certificates/readyCertificate.model';
import { env } from '../../config/env';
import { currentCycle, newReadyId } from '../../utils/ids';
import { logAudit } from '../auditlog/auditLog.model';
import { emitToOrg } from '../../sockets';
import { invalidateDashboardCache } from '../organisations/dashboard.service';
import { sendEmail } from '../../services/email.service';
import { sendWhatsApp } from '../../services/whatsapp.service';
import { logger } from '../../utils/logger';
import { ApiError } from '../../utils/ApiError';

export interface ReadinessSnapshot {
  score: number;
  threshold: number;
  isReady: boolean;
  achievedAt: Date | null;
  certified: number;
  enrolled: number;
  cycle: string;
  certificateId: string | null;
  verifyUrl: string | null;
}

// Event-driven recompute, called after every scored submission and on roster
// changes (PRD §3.2). Idempotent: POSH Ready is recorded exactly once per
// cycle; once recorded it stays for the cycle even if the live meter dips
// below threshold afterwards (PRD §16.4 recommendation).
export async function recomputeReadiness(orgId: string): Promise<ReadinessSnapshot> {
  const org = await Organisation.findOne({ _id: orgId, isDeleted: false });
  if (!org) throw ApiError.notFound();

  const cycle = currentCycle();
  const orgObjectId = new Types.ObjectId(orgId);

  const [enrolled, certifiedUsers] = await Promise.all([
    User.countDocuments({ orgId: orgObjectId, role: 'employee', isDeleted: false }),
    Certificate.distinct('userId', { orgId: orgObjectId, cycle, revoked: false }),
  ]);
  const certified = certifiedUsers.length;
  const score = enrolled ? Math.round((certified / enrolled) * 1000) / 10 : 0;

  // New compliance year: reset the per-cycle readiness record (PRD §3.5).
  if (org.readiness.cycle !== cycle) {
    org.readiness.isReady = false;
    org.readiness.achievedAt = undefined;
    org.readiness.certificateId = undefined;
    org.readiness.certificateIssuedAt = undefined;
  }

  org.readiness.score = score;
  org.readiness.cycle = cycle;

  const crossedThreshold = score >= env.ORG_READY_THRESHOLD && !org.readiness.isReady;
  if (crossedThreshold) {
    org.readiness.isReady = true;
    org.readiness.achievedAt = new Date();
    await logAudit('org.posh_ready', 'Organisation', org.id, undefined, { score, cycle });
    // Issue the org-level POSH Ready certificate exactly once per cycle (Step 5).
    await issueReadyCertificate(org, cycle, score);
  }
  await org.save();

  invalidateDashboardCache(orgId);
  emitToOrg(orgId, 'readiness:update', {
    score,
    threshold: env.ORG_READY_THRESHOLD,
    isReady: org.readiness.isReady,
    certified,
    enrolled,
    certificateId: org.readiness.certificateId ?? null,
  });

  return {
    score,
    threshold: env.ORG_READY_THRESHOLD,
    isReady: org.readiness.isReady,
    achievedAt: org.readiness.achievedAt ?? null,
    certified,
    enrolled,
    cycle,
    certificateId: org.readiness.certificateId ?? null,
    verifyUrl: org.readiness.certificateId
      ? `${env.CERT_VERIFY_BASE_URL}/${org.readiness.certificateId}`
      : null,
  };
}

// Creates the POSH Ready certificate and notifies the org's HR admin(s) and
// Jijiwisha. Mutates `org.readiness` (caller persists). Idempotent: the unique
// (orgId, cycle) index means a race can't produce two certificates.
async function issueReadyCertificate(
  org: HydratedDocument<IOrganisation>,
  cycle: string,
  score: number,
): Promise<void> {
  if (org.readiness.certificateId) return;
  const issuedAt = new Date();
  const readyId = newReadyId(issuedAt.getFullYear(), org.orgCode);

  try {
    await ReadyCertificate.create({ readyId, orgId: org._id, cycle, score, issuedAt });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      // Already issued this cycle (concurrent recompute) — adopt the existing one.
      const existing = await ReadyCertificate.findOne({ orgId: org._id, cycle });
      if (existing) {
        org.readiness.certificateId = existing.readyId;
        org.readiness.certificateIssuedAt = existing.issuedAt;
      }
      return;
    }
    throw err;
  }

  org.readiness.certificateId = readyId;
  org.readiness.certificateIssuedAt = issuedAt;
  await logAudit('org.ready_certificate_issued', 'Organisation', org.id, undefined, { readyId, cycle, score });

  const verifyUrl = `${env.CERT_VERIFY_BASE_URL}/${readyId}`;
  const hrAdmins = await User.find({ orgId: org._id, role: 'hr_admin', isDeleted: false }).select('email whatsapp name');
  const cc = [...hrAdmins.map((a) => a.email), env.JIJIWISHA_NOTIFY_EMAIL].filter(Boolean);
  const primary = hrAdmins[0];

  void sendEmail({
    to: primary?.email ?? env.JIJIWISHA_NOTIFY_EMAIL,
    cc,
    subject: `${org.name} is POSH Ready — certificate ${readyId}`,
    text:
      `${org.name} has crossed the ${env.ORG_READY_THRESHOLD}% readiness threshold and is now POSH Ready ` +
      `for ${cycle}.\n\n` +
      `POSH Ready Certificate ID: ${readyId}\n` +
      `Verify: ${verifyUrl}\n\n` +
      `Note: POSH Ready attests self-assessed readiness. To obtain the audited POSH Compliant ` +
      `certificate, book an audit with Jijiwisha Society from your dashboard.`,
  }).catch((e) => logger.error('Ready-certificate email failed', { message: (e as Error).message }));

  if (primary?.whatsapp) {
    void sendWhatsApp({
      to: primary.whatsapp,
      body:
        `POSH Compass: ${org.name} is now POSH Ready (${score}%). ` +
        `Certificate ${readyId}. Verify: ${verifyUrl}. ` +
        `Book a Jijiwisha audit from your dashboard to become POSH Compliant.`,
    }).catch(() => undefined);
  }
}
