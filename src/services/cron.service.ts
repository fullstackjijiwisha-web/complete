import cron from 'node-cron';
import { AssessmentAttempt } from '../modules/assessments/attempt.model';
import { finalizeAttempt } from '../modules/assessments/assessment.service';
import { refreshPublicStats } from '../modules/stats/stats.service';
import { ComplianceCertificate } from '../modules/certificates/complianceCertificate.model';
import { Organisation } from '../modules/organisations/organisation.model';
import { User } from '../modules/users/user.model';
import { sendEmail } from './email.service';
import { logger } from '../utils/logger';

const GRACE_MINUTES = 5; // resume-on-disconnect window after the timer ends (PRD §3.5)

// Auto-submit attempts whose server-side timer (plus grace) has elapsed.
async function sweepExpiredAttempts(): Promise<void> {
  const cutoff = new Date(Date.now() - GRACE_MINUTES * 60_000);
  const expired = await AssessmentAttempt.find({
    status: 'in_progress',
    expiresAt: { $lt: cutoff },
  }).limit(100);

  for (const attempt of expired) {
    try {
      await finalizeAttempt(attempt);
    } catch (err) {
      logger.error('Stale attempt sweep failed', {
        attemptId: attempt.id,
        message: (err as Error).message,
      });
    }
  }
  if (expired.length) logger.info(`Auto-submitted ${expired.length} expired attempts`);
}

// Renewal reminders at T-60 and T-30 days before compliance expiry (PRD F6).
async function sendRenewalReminders(): Promise<void> {
  const now = Date.now();
  for (const days of [60, 30]) {
    const windowStart = new Date(now + days * 86_400_000);
    const windowEnd = new Date(now + (days + 1) * 86_400_000);
    const expiring = await ComplianceCertificate.find({
      validTill: { $gte: windowStart, $lt: windowEnd },
    });
    for (const cert of expiring) {
      const admins = await User.find({ orgId: cert.orgId, role: 'hr_admin', isDeleted: false });
      for (const admin of admins) {
        await sendEmail({
          to: admin.email,
          subject: `POSH Compliance Certificate ${cert.compId} expires in ${days} days`,
          text:
            `Your POSH Compliance Certificate ${cert.compId} is valid till ` +
            `${cert.validTill.toISOString().slice(0, 10)}. Book a renewal audit on POSH Compass.`,
        });
      }
    }
  }
}

// Step 9: End-of-tenure notification — sent once, the day the certificate expires.
// Emails HR admin(s) AND the org's billing contact (if configured) with renewal instructions.
async function sweepExpiredComplianceCerts(): Promise<void> {
  // Use a 24-hour window so the job (which runs daily) fires exactly once per certificate.
  const windowStart = new Date(Date.now() - 86_400_000); // yesterday
  const windowEnd = new Date(); // now

  const expired = await ComplianceCertificate.find({
    validTill: { $gte: windowStart, $lt: windowEnd },
  });

  for (const cert of expired) {
    try {
      const [org, admins] = await Promise.all([
        Organisation.findById(cert.orgId),
        User.find({ orgId: cert.orgId, role: 'hr_admin', isDeleted: false }).select('email name'),
      ]);

      const orgName = org?.name ?? 'your organisation';
      const expiredDate = cert.validTill.toISOString().slice(0, 10);

      const emailBody =
        `Dear HR Admin,\n\n` +
        `This is to inform you that the POSH Compliance Certificate for ${orgName} ` +
        `(Certificate ID: ${cert.compId}) expired on ${expiredDate}.\n\n` +
        `Your 13-month compliance period has ended. Under the POSH Act 2013, ` +
        `organisations must maintain continuous compliance. Please book a renewal audit ` +
        `with Jijiwisha Society at your earliest convenience.\n\n` +
        `Steps to renew:\n` +
        `1. Ensure ≥95% of employees complete the POSH assessment.\n` +
        `2. Book a renewal audit from the POSH Compass dashboard.\n` +
        `3. Jijiwisha Society will issue a new compliance certificate after the audit.\n\n` +
        `— POSH Compass by Jijiwisha Society`;

      // Collect all recipient emails: HR admins + billing contact (if configured).
      const recipientEmails = new Set<string>(admins.map((a) => a.email));
      if (org?.billingContact?.email) recipientEmails.add(org.billingContact.email);

      for (const email of recipientEmails) {
        await sendEmail({
          to: email,
          subject: `ACTION REQUIRED: POSH Compliance Certificate ${cert.compId} has expired — ${orgName}`,
          text: emailBody,
        });
      }

      logger.info('Compliance expiry notification sent', { compId: cert.compId, orgId: cert.orgId });
    } catch (err) {
      logger.error('Failed to send compliance expiry notification', {
        compId: cert.compId,
        message: (err as Error).message,
      });
    }
  }
}

export function startCronJobs(): void {
  cron.schedule('*/10 * * * *', () => void sweepExpiredAttempts());
  cron.schedule('0 2 * * *', () => void refreshPublicStats());
  cron.schedule('0 8 * * *', () => void sendRenewalReminders());
  // Step 9: Check for expired compliance certificates daily at 9am.
  cron.schedule('0 9 * * *', () => void sweepExpiredComplianceCerts());
  logger.info('Cron jobs scheduled (attempt sweep, stats refresh, renewal reminders, expiry notices)');
}
