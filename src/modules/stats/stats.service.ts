import { PublicStats } from './publicStats.model';
import { AssessmentAttempt } from '../assessments/attempt.model';
import { Organisation } from '../organisations/organisation.model';
import { Audit } from '../audits/audit.model';
import { ComplianceCertificate } from '../certificates/complianceCertificate.model';
import { currentCycle } from '../../utils/ids';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

// Public impact counters (PRD F1) — cached, never computed live per page view.
export async function refreshPublicStats(): Promise<void> {
  const cycle = currentCycle();
  const [assessedUsers, orgsReady, auditsCompleted, complianceIssued] = await Promise.all([
    AssessmentAttempt.distinct('userId', { status: { $in: ['submitted', 'scored'] } }),
    Organisation.countDocuments({ 'readiness.isReady': true, 'readiness.cycle': cycle, isDeleted: false }),
    Audit.countDocuments({ status: { $in: ['passed', 'failed', 'certificate_issued'] } }),
    ComplianceCertificate.countDocuments({ validTill: { $gt: new Date() } }),
  ]);

  await PublicStats.findOneAndUpdate(
    { key: 'current' },
    {
      $set: {
        employeesAssessed: assessedUsers.length,
        orgsReady,
        auditsCompleted,
        complianceIssued,
        refreshedAt: new Date(),
      },
    },
    { upsert: true },
  );
  logger.debug('Public stats refreshed');
}

export async function getPublicStats() {
  let stats = await PublicStats.findOne({ key: 'current' });
  const stale =
    !stats || Date.now() - stats.refreshedAt.getTime() > env.PUBLIC_STATS_CACHE_TTL_SEC * 1000;
  if (stale) {
    await refreshPublicStats();
    stats = await PublicStats.findOne({ key: 'current' });
  }
  return {
    employeesAssessed: stats?.employeesAssessed ?? 0,
    orgsReady: stats?.orgsReady ?? 0,
    auditsCompleted: stats?.auditsCompleted ?? 0,
    complianceIssued: stats?.complianceIssued ?? 0,
    trustScore: stats?.trustScore ?? null,
    refreshedAt: stats?.refreshedAt ?? new Date(),
  };
}
