import cron from 'node-cron';
import { AssessmentAttempt } from '../modules/assessments/attempt.model';
import { finalizeAttempt } from '../modules/assessments/assessment.service';
import { refreshPublicStats } from '../modules/stats/stats.service';
import { ComplianceCertificate } from '../modules/certificates/complianceCertificate.model';
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

export function startCronJobs(): void {
  cron.schedule('*/10 * * * *', () => void sweepExpiredAttempts());
  cron.schedule('0 2 * * *', () => void refreshPublicStats());
  cron.schedule('0 8 * * *', () => void sendRenewalReminders());
  logger.info('Cron jobs scheduled (attempt sweep, stats refresh, renewal reminders)');
}
