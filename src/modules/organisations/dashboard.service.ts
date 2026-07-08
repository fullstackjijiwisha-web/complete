import { Types } from 'mongoose';
import { AssessmentAttempt } from '../assessments/attempt.model';
import { Certificate } from '../certificates/certificate.model';
import { User } from '../users/user.model';
import { Organisation } from './organisation.model';
import { env } from '../../config/env';
import { currentCycle } from '../../utils/ids';
import { scoreBand } from '../../types';
import type { ScoreBand } from '../../types';
import { ApiError } from '../../utils/ApiError';

// ⚠️ Confidentiality invariant (PRD §3.6): nothing in this payload may carry a
// department/team dimension. Org-level aggregates and per-band counts only.

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { data: unknown; at: number }>();

export function invalidateDashboardCache(orgId: string): void {
  cache.delete(orgId);
}

function endOfPreviousMonth(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

// UTC on purpose: bucket keys must match Mongo's $dateTrunc, which works in
// UTC — local-time Mondays would never line up (e.g. IST is UTC+5:30).
function mondayOf(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day);
  return d;
}

interface BestScoreRow {
  _id: Types.ObjectId;
  bestScore: number;
  firstSubmittedAt: Date;
}

export async function getOrgDashboard(orgId: string) {
  const cached = cache.get(orgId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;

  const org = await Organisation.findOne({ _id: orgId, isDeleted: false });
  if (!org) throw ApiError.notFound();

  const orgObjectId = new Types.ObjectId(orgId);
  const cycle = currentCycle();
  const prevMonthEnd = endOfPreviousMonth();

  const [enrolled, bestScores, weeklyRaw, certifiedNow, certifiedPrev] = await Promise.all([
    User.countDocuments({ orgId: orgObjectId, role: 'employee', isDeleted: false }),
    AssessmentAttempt.aggregate<BestScoreRow>([
      { $match: { orgId: orgObjectId, cycle, status: 'scored' } },
      {
        $group: {
          _id: '$userId',
          bestScore: { $max: '$score' },
          firstSubmittedAt: { $min: '$submittedAt' },
        },
      },
    ]),
    AssessmentAttempt.aggregate<{ _id: Date; count: number }>([
      {
        $match: {
          orgId: orgObjectId,
          status: { $in: ['submitted', 'scored'] },
          submittedAt: { $gte: new Date(Date.now() - 12 * 7 * 86_400_000) },
        },
      },
      {
        $group: {
          _id: {
            $dateTrunc: { date: '$submittedAt', unit: 'week', startOfWeek: 'monday' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Certificate.countDocuments({ orgId: orgObjectId, cycle, revoked: false }),
    Certificate.countDocuments({
      orgId: orgObjectId,
      cycle,
      revoked: false,
      issuedAt: { $lt: prevMonthEnd },
    }),
  ]);

  const assessed = bestScores.length;
  const assessedPrev = bestScores.filter((r) => r.firstSubmittedAt < prevMonthEnd).length;
  const avgScore = assessed
    ? Math.round((bestScores.reduce((sum, r) => sum + r.bestScore, 0) / assessed) * 10) / 10
    : 0;

  const distribution: Record<ScoreBand, number> = {
    below_60: 0,
    '60_69': 0,
    '70_79': 0,
    '80_89': 0,
    '90_100': 0,
  };
  for (const row of bestScores) distribution[scoreBand(row.bestScore)] += 1;

  // Fill empty weeks so the 12-week trend chart has a continuous x-axis.
  const weeklyMap = new Map(weeklyRaw.map((w) => [new Date(w._id).getTime(), w.count]));
  const weeklyAssessments: Array<{ weekStart: string; count: number }> = [];
  const thisMonday = mondayOf(new Date());
  for (let i = 11; i >= 0; i--) {
    const week = new Date(thisMonday.getTime() - i * 7 * 86_400_000);
    weeklyAssessments.push({
      weekStart: week.toISOString().slice(0, 10),
      count: weeklyMap.get(week.getTime()) ?? 0,
    });
  }

  const readinessScore = enrolled ? Math.round((certifiedNow / enrolled) * 1000) / 10 : 0;
  const certificationsNeeded = Math.max(
    0,
    Math.ceil((env.ORG_READY_THRESHOLD / 100) * enrolled) - certifiedNow,
  );

  const data = {
    org: {
      name: org.name,
      orgCode: org.orgCode,
      headcount: org.headcount,
      // Mongoose materialises unset nested paths as {} — check the leaves.
      period: org.reportingPeriod?.start && org.reportingPeriod?.end
        ? {
            start: org.reportingPeriod.start.toISOString().slice(0, 10),
            end: org.reportingPeriod.end.toISOString().slice(0, 10),
          }
        : null,
    },
    cycle,
    kpis: {
      assessed: { value: assessed, deltaVsPrevMonth: assessed - assessedPrev },
      completionRate: {
        value: enrolled ? Math.round((assessed / enrolled) * 1000) / 10 : 0,
        assessed,
        enrolled,
      },
      certified: { value: certifiedNow, deltaVsPrevMonth: certifiedNow - certifiedPrev },
      avgScore: { value: avgScore },
    },
    readiness: {
      // Live meter reflects the current roster; recorded status stays for the
      // cycle once achieved (PRD §16.4 recommendation) — both are exposed.
      score: readinessScore,
      threshold: env.ORG_READY_THRESHOLD,
      isReady: org.readiness.isReady && org.readiness.cycle === cycle,
      achievedAt: org.readiness.achievedAt?.toISOString().slice(0, 10) ?? null,
      auditUnlocked: org.readiness.isReady && org.readiness.cycle === cycle,
      certificationsNeeded,
      // Org-level POSH Ready certificate (Step 5) — distinct from POSH Compliant.
      certificateId: org.readiness.certificateId ?? null,
      certificateVerifyUrl: org.readiness.certificateId
        ? `${env.CERT_VERIFY_BASE_URL}/${org.readiness.certificateId}`
        : null,
      certificateIssuedAt: org.readiness.certificateIssuedAt?.toISOString().slice(0, 10) ?? null,
    },
    weeklyAssessments,
    scoreDistribution: (Object.entries(distribution) as Array<[ScoreBand, number]>).map(
      ([band, count]) => ({ band, count }),
    ),
    compliance: {
      status: org.compliance.status,
      certificateId: org.compliance.certificateId ?? null,
      validTill: org.compliance.validTill?.toISOString().slice(0, 10) ?? null,
    },
  };

  cache.set(orgId, { data, at: Date.now() });
  return data;
}
