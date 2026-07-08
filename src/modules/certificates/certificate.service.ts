import type { HydratedDocument } from 'mongoose';
import { Certificate } from './certificate.model';
import { User } from '../users/user.model';
import { Organisation } from '../organisations/organisation.model';
import type { IAssessmentAttempt } from '../assessments/attempt.model';
import { newCertId } from '../../utils/ids';
import { scoreBand } from '../../types';
import { logAudit } from '../auditlog/auditLog.model';
import { sendEmail } from '../../services/email.service';
import { sendWhatsApp } from '../../services/whatsapp.service';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

// State 2: certificate with full evidence trail — score, cycle, attempt
// reference, audit-log entry (PRD §3.1/§3.3).
export async function issueCertificate(
  attempt: HydratedDocument<IAssessmentAttempt>,
  score: number,
): Promise<{ certId: string; issuedAt: Date }> {
  const user = await User.findById(attempt.userId);
  const empCode = user?.employeeCode ?? 'EMP0000';
  const issuedAt = new Date();

  const cert = await Certificate.create({
    certId: newCertId(issuedAt.getFullYear(), empCode),
    userId: attempt.userId,
    orgId: attempt.orgId,
    score,
    scoreBand: scoreBand(score),
    cycle: attempt.cycle,
    issuedAt,
    evidenceRef: attempt._id,
  });

  await logAudit('certificate.issued', 'Certificate', cert.certId, attempt.userId.toString(), {
    score,
    cycle: attempt.cycle,
    attemptId: attempt.id,
  });

  // Notify the employee with their certificate, CC'd to the org's HR admin(s)
  // and the Jijiwisha ops inbox (Step 4). Best-effort — a delivery failure must
  // never roll back a validly earned certificate.
  void notifyCertificateIssued(cert.certId, score, user, attempt.orgId.toString()).catch((err) =>
    logger.error('Certificate notification failed', {
      certId: cert.certId,
      message: (err as Error).message,
    }),
  );

  return { certId: cert.certId, issuedAt };
}

async function notifyCertificateIssued(
  certId: string,
  score: number,
  user: HydratedDocument<import('../users/user.model').IUser> | null,
  orgId: string,
): Promise<void> {
  if (!user) return;
  const [org, hrAdmins] = await Promise.all([
    Organisation.findById(orgId),
    User.find({ orgId, role: 'hr_admin', isDeleted: false }).select('email'),
  ]);
  const verifyUrl = `${env.CERT_VERIFY_BASE_URL}/${certId}`;
  const cc = [...hrAdmins.map((a) => a.email), env.JIJIWISHA_NOTIFY_EMAIL].filter(Boolean);

  await sendEmail({
    to: user.email,
    cc,
    subject: `Your POSH Compass certificate — ${certId}`,
    text:
      `Congratulations ${user.name}, you scored ${score}% and are now POSH Certified for ` +
      `${org?.name ?? 'your organisation'}.\n\n` +
      `Certificate ID: ${certId}\n` +
      `Verify or download anytime: ${verifyUrl}\n\n` +
      `This certificate is your proof of completing the POSH Assessment.`,
  });

  if (user.whatsapp) {
    await sendWhatsApp({
      to: user.whatsapp,
      body:
        `POSH Compass: Congratulations ${user.name}! You scored ${score}% and are now ` +
        `POSH Certified. Certificate ${certId}. Verify: ${verifyUrl}`,
    });
  }
}
