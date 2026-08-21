import type { RequestHandler } from 'express';
import bcrypt from 'bcryptjs';
import { Question } from '../questions/question.model';
import { Organisation } from '../organisations/organisation.model';
import { OrgWipeBackup } from '../organisations/orgWipeBackup.model';
import {
  previewOrganisationWipe,
  wipeAllOrganisations,
  previewOrganisationDelete,
  deleteOrganisation,
} from '../organisations/organisation.reset';
import { User } from '../users/user.model';
import { Invite } from '../auth/invite.model';
import { issueInvite } from '../employees/employee.service';
import { checkEmailHealth } from '../../services/email.service';
import { Audit, AuditSlot } from '../audits/audit.model';
import { AuditLog, logAudit } from '../auditlog/auditLog.model';
import { PublicStats } from '../stats/publicStats.model';
import { Certificate } from '../certificates/certificate.model';
import { AssessmentAttempt } from '../assessments/attempt.model';
import { loadPaperQuestions } from '../assessments/assessment.service';
import { scoreAttempt } from '../scoring/scoring.service';
import { recomputeReadiness } from '../scoring/readiness.service';
import { ApiError } from '../../utils/ApiError';
import { authUser } from '../../utils/authUser';
import { currentCycle } from '../../utils/ids';
import { env } from '../../config/env';
import { scoreBand } from '../../types';
import { Types } from 'mongoose';

function pagination(req: Parameters<RequestHandler>[0]) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

// ── Question bank ─────────────────────────────────────────────────────────

export const listQuestions: RequestHandler = async (req, res) => {
  const { page, limit, skip } = pagination(req);
  const filter: Record<string, unknown> = { isActive: true };
  if (req.query.type) filter.type = req.query.type;
  if (req.query.tag) filter.tags = req.query.tag;

  const [total, questions] = await Promise.all([
    Question.countDocuments(filter),
    Question.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
  ]);
  res.json({
    success: true,
    data: questions,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
};

function assertQuestionShape(body: Record<string, unknown>): void {
  const type = body.type as string;
  if (type === 'mcq') {
    const options = body.options as Array<{ weight: number }> | undefined;
    if (!options?.some((o) => o.weight === 1)) {
      throw ApiError.badRequest('MCQ needs options with exactly one weight-1 answer');
    }
  }
  if (type === 'case_study') {
    const options = body.options as Array<{ weight: number }> | undefined;
    if (!options?.length) {
      throw ApiError.badRequest('Case study needs weighted options');
    }
    // Without a full-credit option, a perfect paper score is impossible —
    // every employee would be capped below 100% by authoring, not knowledge.
    if (!options.some((o) => o.weight === 1)) {
      throw ApiError.badRequest('Case study needs at least one weight-1 (best) option');
    }
  }
  if (type === 'fib' && !(body.blanks as unknown[] | undefined)?.length) {
    throw ApiError.badRequest('Fill-in-the-blanks needs at least one blank');
  }
  if (type === 'simulation' && !(body.nodes as unknown[] | undefined)?.length) {
    throw ApiError.badRequest('Simulation needs at least one decision node');
  }
}

export const createQuestion: RequestHandler = async (req, res) => {
  assertQuestionShape(req.body);
  const question = await Question.create({ ...req.body, version: 1 });
  res.status(201).json({ success: true, data: question });
};

// Content edits bump the version so past attempts keep pointing at the
// version they were answered against (PRD F3).
export const updateQuestion: RequestHandler = async (req, res) => {
  const question = await Question.findById(req.params.id);
  if (!question) throw ApiError.notFound();

  const contentKeys = ['body', 'options', 'blanks', 'nodes'];
  const touchesContent = contentKeys.some((k) => req.body[k] !== undefined);
  
  if (req.body.type) {
    if (req.body.type === 'fib') { question.options = undefined; question.nodes = undefined; }
    else if (req.body.type === 'simulation') { question.options = undefined; question.blanks = undefined; }
    else { question.blanks = undefined; question.nodes = undefined; }
  }
  
  Object.assign(question, req.body);
  assertQuestionShape(question.toObject() as unknown as Record<string, unknown>);
  
  if (touchesContent) question.version += 1;
  await question.save();
  res.json({ success: true, data: question });
};

export const deleteQuestion: RequestHandler = async (req, res) => {
  const question = await Question.findById(req.params.id);
  if (!question) throw ApiError.notFound();

  question.isActive = false;
  await question.save();
  res.json({ success: true, data: question });
};

// ── Organisations ─────────────────────────────────────────────────────────

export const listOrgs: RequestHandler = async (req, res) => {
  const { page, limit, skip } = pagination(req);
  const [total, orgs] = await Promise.all([
    Organisation.countDocuments({}),
    Organisation.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit),
  ]);

  // Enrolled = employee accounts that actually exist, as opposed to the
  // self-declared headcount an org typed in at registration.
  const enrolledAgg = await User.aggregate<{ _id: Types.ObjectId; n: number }>([
    { $match: { orgId: { $in: orgs.map((o) => o._id) }, role: 'employee', isDeleted: false } },
    { $group: { _id: '$orgId', n: { $sum: 1 } } },
  ]);
  const enrolledByOrg = new Map(enrolledAgg.map((r) => [r._id.toString(), r.n]));

  const orgsWithAudits = await Promise.all(
    orgs.map(async (org) => {
      const audit = await Audit.findOne({ orgId: org._id }).sort({ createdAt: -1 });
      return {
        ...org.toObject(),
        enrolledCount: enrolledByOrg.get(org.id) ?? 0,
        currentAudit: audit
          ? {
            id: audit._id,
            status: audit.status,
            documents: audit.documents.map((d, index) => ({
              name: d.name,
              uploadedAt: d.uploadedAt,
              downloadUrl: `/api/v1/audits/${audit._id}/documents/${index}`,
            })),
            checklist: audit.checklist.map((c) => ({ item: c.item, status: c.status })),
          }
          : null,
      };
    }),
  );

  res.json({
    success: true,
    data: orgsWithAudits,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
};

// Super admin: platform-wide assessment activity. "Tests taken" counts
// EMPLOYEES who have attempted the quiz — one person is one test, however many
// retakes they used; the raw attempt count is reported alongside it. An
// attempt counts once it is scored (submitted, or auto-submitted at timeout),
// so quizzes still open never inflate the figures.
export const assessmentStats: RequestHandler = async (_req, res) => {
  const cycle = currentCycle();
  const now = Date.now();
  const since = (days: number) => new Date(now - days * 86_400_000);
  const scored = { status: 'scored' as const };

  const [
    employeesTested,
    employeesThisCycle,
    employeesLast7Days,
    employeesLast30Days,
    employeesInProgress,
    totalAttempts,
    attemptsInProgress,
    certificatesIssued,
    scoreAgg,
    byOrgAgg,
  ] = await Promise.all([
    AssessmentAttempt.distinct('userId', scored),
    AssessmentAttempt.distinct('userId', { ...scored, cycle }),
    AssessmentAttempt.distinct('userId', { ...scored, submittedAt: { $gte: since(7) } }),
    AssessmentAttempt.distinct('userId', { ...scored, submittedAt: { $gte: since(30) } }),
    AssessmentAttempt.distinct('userId', { status: 'in_progress' }),
    AssessmentAttempt.countDocuments(scored),
    AssessmentAttempt.countDocuments({ status: 'in_progress' }),
    Certificate.countDocuments({ revoked: false }),
    AssessmentAttempt.aggregate<{ _id: null; avg: number; passed: number }>([
      { $match: scored },
      {
        $group: {
          _id: null,
          avg: { $avg: '$score' },
          passed: { $sum: { $cond: [{ $gte: ['$score', env.CERT_PASS_THRESHOLD] }, 1, 0] } },
        },
      },
    ]),
    AssessmentAttempt.aggregate<{ _id: Types.ObjectId; attempts: number; avg: number; takers: string[] }>([
      { $match: scored },
      { $group: { _id: '$orgId', attempts: { $sum: 1 }, avg: { $avg: '$score' }, takers: { $addToSet: '$userId' } } },
      // Ranked by people who took the test, matching the headline metric.
      { $sort: { attempts: -1 } },
      { $limit: 100 },
    ]),
  ]);

  const orgs = await Organisation.find({ _id: { $in: byOrgAgg.map((r) => r._id) } }).select('name orgCode');
  const orgById = new Map(orgs.map((o) => [o.id as string, o]));
  const round1 = (n: number | undefined | null) => (n == null ? null : Math.round(n * 10) / 10);

  res.json({
    success: true,
    data: {
      // Headline: distinct employees who have attempted the quiz.
      employeesTested: employeesTested.length,
      employeesThisCycle: employeesThisCycle.length,
      employeesLast7Days: employeesLast7Days.length,
      employeesLast30Days: employeesLast30Days.length,
      employeesInProgress: employeesInProgress.length,
      // Supporting detail: raw attempts, retakes included.
      totalAttempts,
      attemptsInProgress,
      cycle,
      certificatesIssued,
      averageScore: round1(scoreAgg[0]?.avg),
      passRate: totalAttempts ? round1(((scoreAgg[0]?.passed ?? 0) / totalAttempts) * 100) : null,
      passThreshold: env.CERT_PASS_THRESHOLD,
      byOrganisation: byOrgAgg
        .map((r) => ({
          orgName: orgById.get(r._id.toString())?.name ?? '(deleted organisation)',
          orgCode: orgById.get(r._id.toString())?.orgCode ?? '',
          employeesTested: r.takers.length,
          attempts: r.attempts,
          averageScore: round1(r.avg),
        }))
        .sort((a, b) => b.employeesTested - a.employeesTested),
    },
  });
};

// Super admin: "why is no email going out?" — live status of every configured
// mail account (plan, remaining allowance, sender verification, blocks).
export const emailHealth: RequestHandler = async (_req, res) => {
  const health = await checkEmailHealth();
  const undelivered = await User.countDocuments({
    role: 'employee',
    isDeleted: false,
    status: 'invited',
    inviteDelivery: { $ne: 'sent' },
  });
  res.json({ success: true, data: { ...health, undeliveredInvites: undelivered } });
};

// Super admin: invite delivery & assessment progress for one organisation.
// "Pending – expired link" are employees still in 'invited' status with no
// live invite token (expired ones are TTL-swept) — whatever link is in their
// inbox shows "Invite link is invalid or has expired" and needs a resend.
export const orgInviteStatus: RequestHandler = async (req, res) => {
  const org = await Organisation.findById(req.params.id);
  if (!org) throw ApiError.notFound();
  const cycle = currentCycle();

  const employees = await User.find({ orgId: org._id, role: 'employee', isDeleted: false }).select(
    'status email employeeCode',
  );
  const pending = employees.filter((e) => e.status === 'invited');
  const invites = await Invite.find({ userId: { $in: pending.map((p) => p._id) } }).select(
    'userId expiresAt',
  );
  const now = Date.now();
  const liveSet = new Set(
    invites.filter((i) => i.expiresAt.getTime() > now).map((i) => i.userId.toString()),
  );
  const pendingExpired = pending.filter((p) => !liveSet.has(p._id.toString()));

  const [completedUserIds, certified] = await Promise.all([
    AssessmentAttempt.distinct('userId', { orgId: org._id, cycle, status: 'scored' }),
    Certificate.countDocuments({ orgId: org._id, cycle, revoked: false }),
  ]);

  // Did the email actually leave the building? Recorded per employee since the
  // delivery-trail change; employees invited before it are 'unknown'.
  const delivery = await User.find({
    _id: { $in: pending.map((p) => p._id) },
  }).select('email inviteDelivery inviteError inviteSentAt');
  const emailFailedDocs = delivery.filter((d) => d.inviteDelivery === 'failed');
  const emailSent = delivery.filter((d) => d.inviteDelivery === 'sent').length;
  const emailUnknown = delivery.filter((d) => !d.inviteDelivery).length;
  const failureReasons: Record<string, number> = {};
  for (const d of emailFailedDocs) {
    const key = (d.inviteError ?? 'unknown error').slice(0, 120);
    failureReasons[key] = (failureReasons[key] ?? 0) + 1;
  }

  res.json({
    success: true,
    data: {
      orgName: org.name,
      enrolled: employees.length,
      activated: employees.length - pending.length,
      completedTest: completedUserIds.length,
      certified,
      pendingTotal: pending.length,
      pendingLive: pending.length - pendingExpired.length,
      pendingExpired: pendingExpired.length,
      pendingExpiredEmails: pendingExpired.slice(0, 500).map((p) => p.email),
      emailSent,
      emailFailed: emailFailedDocs.length,
      emailUnknown,
      failureReasons,
      emailFailedAddresses: emailFailedDocs.slice(0, 500).map((d) => d.email),
    },
  });
};

// Super admin: resend invites for ONE organisation, in small batches so a
// single request always finishes well inside the serverless time limit (a
// 25-email batch could exceed it when the mail provider was slow, which
// aborted the whole run and looked like "the button doesn't work").
//   scope 'expired' — employees with no live link; the set shrinks as we
//     resend, so each call takes the first N still-expired (no cursor).
//   scope 'failed'  — employees whose last invite email was rejected by the
//     provider (quota, bad address). Also shrinks as sends succeed.
//   scope 'all_pending' — everyone not yet activated, walked with a `skip`
//     cursor over the stable employeeCode order.
const ADMIN_RESEND_BATCH = 10;
const ADMIN_RESEND_CONCURRENCY = 5;

export const adminResendOrgInvites: RequestHandler = async (req, res) => {
  const org = await Organisation.findById(req.params.id);
  if (!org) throw ApiError.notFound();
  const scope = req.body.scope as 'expired' | 'failed' | 'all_pending';
  const skip = Math.max(0, Number(req.body?.skip) || 0);

  const pendingFilter = {
    orgId: org._id,
    role: 'employee' as const,
    isDeleted: false,
    status: 'invited' as const,
  };

  let totalTargets: number;
  let batch: Array<{ id: string; email: string; whatsapp?: string }>;
  let remaining: number;

  if (scope === 'all_pending') {
    totalTargets = await User.countDocuments(pendingFilter);
    const docs = await User.find(pendingFilter)
      .sort({ employeeCode: 1 })
      .skip(skip)
      .limit(ADMIN_RESEND_BATCH)
      .select('email whatsapp');
    batch = docs.map((d) => ({ id: d.id, email: d.email, whatsapp: d.whatsapp }));
    remaining = Math.max(0, totalTargets - skip - batch.length);
  } else if (scope === 'failed') {
    // Everyone whose invite email no provider has confirmed accepting —
    // rejected sends AND employees invited before delivery tracking existed
    // ($ne also matches a missing field). These are exactly the people who
    // report "I never received anything".
    const failedFilter = { ...pendingFilter, inviteDelivery: { $ne: 'sent' as const } };
    totalTargets = await User.countDocuments(failedFilter);
    const docs = await User.find(failedFilter)
      .sort({ employeeCode: 1 })
      .limit(ADMIN_RESEND_BATCH)
      .select('email whatsapp');
    batch = docs.map((d) => ({ id: d.id, email: d.email, whatsapp: d.whatsapp }));
    remaining = Math.max(0, totalTargets - batch.length);
  } else {
    const pending = await User.find(pendingFilter).sort({ employeeCode: 1 }).select('email whatsapp');
    const invites = await Invite.find({ userId: { $in: pending.map((p) => p._id) } }).select(
      'userId expiresAt',
    );
    const nowMs = Date.now();
    const liveSet = new Set(
      invites.filter((i) => i.expiresAt.getTime() > nowMs).map((i) => i.userId.toString()),
    );
    const expired = pending.filter((p) => !liveSet.has(p._id.toString()));
    totalTargets = expired.length;
    batch = expired
      .slice(0, ADMIN_RESEND_BATCH)
      .map((d) => ({ id: d.id, email: d.email, whatsapp: d.whatsapp }));
    remaining = Math.max(0, totalTargets - batch.length);
  }

  const originUrl = req.protocol + '://' + req.get('host');
  // Counts what the mail provider ACCEPTED, not merely what we attempted —
  // the number an operator needs when a daily quota starts rejecting sends.
  let delivered = 0;
  let failed = 0;
  const failureSamples: string[] = [];
  for (let i = 0; i < batch.length; i += ADMIN_RESEND_CONCURRENCY) {
    const results = await Promise.allSettled(
      batch
        .slice(i, i + ADMIN_RESEND_CONCURRENCY)
        .map((e) => issueInvite(e.id, org.id, e.email, org.name, e.whatsapp, originUrl)),
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.delivered) {
        delivered += 1;
      } else {
        failed += 1;
        const reason =
          r.status === 'fulfilled'
            ? r.value.error ?? (r.value.mode === 'logged' ? 'email provider not configured' : 'unknown')
            : (r.reason as Error).message;
        if (failureSamples.length < 3 && reason) failureSamples.push(reason.slice(0, 160));
      }
    }
  }

  if (batch.length > 0) {
    await logAudit('admin.org_invites_resent', 'Organisation', org.id, authUser(req).id, {
      scope,
      delivered,
      failed,
      totalTargets,
    });
  }
  res.json({
    success: true,
    data: {
      totalTargets,
      batchCount: batch.length,
      // resentCount stays delivery-based so the UI never claims success for
      // emails the provider rejected.
      resentCount: delivered,
      failedCount: failed,
      failureSamples,
      remaining,
    },
  });
};

// Super admin: every certificate issued to one organisation's employees, in
// the shape the branded certificate template renders — so the panel can print
// them all into a single consolidated PDF. Access is audit-logged (PII).
export const orgCertificates: RequestHandler = async (req, res) => {
  const org = await Organisation.findById(req.params.id);
  if (!org) throw ApiError.notFound();

  const certs = await Certificate.find({ orgId: org._id, revoked: false })
    .sort({ issuedAt: 1 })
    .select('certId userId score scoreBand cycle issuedAt');
  const users = await User.find({ _id: { $in: certs.map((c) => c.userId) } }).select(
    'name employeeCode email',
  );
  const userById = new Map(users.map((u) => [u.id as string, u]));

  await logAudit('admin.org_certificates_exported', 'Organisation', org.id, authUser(req).id, {
    certificates: certs.length,
  });

  res.json({
    success: true,
    data: {
      orgName: org.name,
      orgCode: org.orgCode,
      passThreshold: env.CERT_PASS_THRESHOLD,
      certificates: certs.map((c) => {
        const u = userById.get(c.userId.toString());
        return {
          certId: c.certId,
          employeeName: u?.name ?? '(employee removed)',
          employeeCode: u?.employeeCode ?? '',
          score: c.score,
          scoreBand: c.scoreBand,
          cycle: c.cycle,
          issuedAt: c.issuedAt,
          verifyUrl: `${env.CERT_VERIFY_BASE_URL}/${c.certId}`,
        };
      }),
    },
  });
};

// Super admin: download an organisation's enrolled employees as CSV —
// roster columns plus this cycle's assessment standing (attempts, best
// score, certificate). Access is audit-logged.
export const exportOrgEmployees: RequestHandler = async (req, res) => {
  const org = await Organisation.findById(req.params.id);
  if (!org) throw ApiError.notFound();

  const cycle = currentCycle();
  const employees = await User.find({ orgId: org._id, role: 'employee', isDeleted: false })
    .sort({ employeeCode: 1 })
    .select('name email whatsapp employeeCode status inviteSentAt inviteDelivery inviteError inviteSendCount');
  const userIds = employees.map((e) => e._id);
  const liveInvites = await Invite.find({
    userId: { $in: userIds },
    expiresAt: { $gt: new Date() },
  }).select('userId');
  const hasLiveLink = new Set(liveInvites.map((i) => i.userId.toString()));
  const [certs, scoredBest] = await Promise.all([
    Certificate.find({ userId: { $in: userIds }, cycle, revoked: false }).select('userId certId score'),
    AssessmentAttempt.aggregate<{ _id: Types.ObjectId; bestScore: number; attempts: number }>([
      { $match: { userId: { $in: userIds }, cycle, status: 'scored' } },
      { $group: { _id: '$userId', bestScore: { $max: '$score' }, attempts: { $sum: 1 } } },
    ]),
  ]);
  const certByUser = new Map(certs.map((c) => [c.userId.toString(), c]));
  const bestByUser = new Map(scoredBest.map((r) => [r._id.toString(), r]));

  const quote = (v: string) => `"${v.replace(/"/g, '""')}"`;
  let csv =
    'employeeCode,name,email,whatsapp,inviteStatus,emailDelivery,emailSentAt,emailError,' +
    'inviteLinkLive,timesInvited,attemptsThisCycle,bestScore,certified,certificateId\n';
  for (const e of employees) {
    const id = e._id.toString();
    const cert = certByUser.get(id);
    const best = bestByUser.get(id);
    csv +=
      [
        e.employeeCode ?? '',
        quote(e.name),
        e.email,
        e.whatsapp ?? '',
        e.status ?? '',
        e.inviteDelivery ?? 'unknown',
        e.inviteSentAt ? e.inviteSentAt.toISOString() : '',
        quote(e.inviteError ?? ''),
        e.status === 'active' ? 'n/a' : hasLiveLink.has(id) ? 'yes' : 'no',
        String(e.inviteSendCount ?? 0),
        String(best?.attempts ?? 0),
        best?.bestScore != null ? String(best.bestScore) : '',
        cert ? 'yes' : 'no',
        cert?.certId ?? '',
      ].join(',') + '\n';
  }

  await logAudit('admin.org_employees_exported', 'Organisation', org.id, authUser(req).id, {
    employees: employees.length,
  });
  const safeName =
    org.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'organisation';
  res
    .type('text/csv')
    .setHeader('Content-Disposition', `attachment; filename="${safeName}-employees.csv"`)
    .send(csv);
};

// Super admin: remove ONE organisation permanently. Used when a client wants
// to start over — a soft delete would leave the org code and the HR admin's
// email taken, so re-registration would keep failing. The preview reports
// exactly what will go, including which logins are freed.
export const previewDeleteOrg: RequestHandler = async (req, res) => {
  const preview = await previewOrganisationDelete(req.params.id as string);
  if (!preview) throw ApiError.notFound();
  res.json({ success: true, data: preview });
};

export const deleteOrg: RequestHandler = async (req, res) => {
  const org = await Organisation.findById(req.params.id).select('orgCode name');
  if (!org) throw ApiError.notFound();
  // Typing the organisation's own code is the confirmation — it cannot be
  // triggered by a replayed or accidental request against the wrong org.
  if (req.body.confirm !== org.orgCode) {
    throw ApiError.badRequest(
      `Type the organisation code (${org.orgCode}) to confirm deletion`,
      'CONFIRMATION_MISMATCH',
    );
  }
  const result = await deleteOrganisation(req.params.id as string, authUser(req).id);
  if (!result) throw ApiError.notFound();
  res.json({
    success: true,
    data: { deleted: true, name: org.name, orgCode: org.orgCode, ...result },
  });
};

export const patchOrg: RequestHandler = async (req, res) => {
  const update: Record<string, unknown> = {};
  if (req.body.seatsActive !== undefined) update.seatsActive = req.body.seatsActive;
  if (req.body.isDeleted !== undefined) {
    update.isDeleted = req.body.isDeleted;
    update.deletedAt = req.body.isDeleted ? new Date() : undefined;
  }
  const org = await Organisation.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
  if (!org) throw ApiError.notFound();
  await logAudit('admin.org_updated', 'Organisation', org.id, authUser(req).id, update);
  res.json({ success: true, data: org });
};

// ── Danger zone: wipe all organisations ──────────────────────────────────
// Deletes every organisation and everything scoped to it (HR/employee
// accounts, attempts, certificates, audits, payments, invites). A full
// snapshot is written to OrgWipeBackup before anything is deleted — see
// organisation.reset.ts for exactly what is and is not touched.

export const previewWipeOrganisations: RequestHandler = async (_req, res) => {
  const counts = await previewOrganisationWipe();
  res.json({ success: true, data: counts });
};

export const wipeOrganisations: RequestHandler = async (req, res) => {
  const admin = authUser(req);
  const adminUser = await User.findById(admin.id).select('email');
  const result = await wipeAllOrganisations(adminUser?.email ?? admin.id, admin.id);
  res.json({
    success: true,
    data: { backupId: result.backupId, counts: result.counts, backup: result.backup },
  });
};

export const listWipeBackups: RequestHandler = async (req, res) => {
  const { page, limit, skip } = pagination(req);
  const [total, backups] = await Promise.all([
    OrgWipeBackup.countDocuments({}),
    OrgWipeBackup.find({}, { data: 0 }).sort({ performedAt: -1 }).skip(skip).limit(limit),
  ]);
  res.json({
    success: true,
    data: backups,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
};

export const getWipeBackup: RequestHandler = async (req, res) => {
  const backup = await OrgWipeBackup.findById(req.params.id);
  if (!backup) throw ApiError.notFound();
  res.json({ success: true, data: backup });
};

// ── Maintenance: rescore a certified attempt ─────────────────────────────
// A recorded score is frozen at submit time against the answer keys as they
// were THEN. When a key is later corrected (e.g. a fill-in-the-blank that
// rejected a valid synonym), the answer review — which recomputes against
// current content — will disagree with the stored score. This endpoint
// recomputes the attempt with the corrected keys and updates the attempt,
// the certificate (score + band), and org readiness. Refuses to apply a
// rescore that would drop the score below the certification threshold —
// revoking a certificate is a deliberate manual decision, not a side effect.
export const rescoreCertificate: RequestHandler = async (req, res) => {
  const cert = await Certificate.findOne({ certId: req.body.certId, revoked: false });
  if (!cert) throw ApiError.notFound('Certificate not found');
  const attempt = await AssessmentAttempt.findById(cert.evidenceRef);
  if (!attempt || attempt.status !== 'scored') throw ApiError.notFound('Scored attempt not found');

  // fromBank: rescoring exists precisely to apply corrected answer keys, so
  // read the live bank rather than the attempt's frozen snapshots.
  const questions = await loadPaperQuestions(attempt, { fromBank: true });
  const result = scoreAttempt(attempt, questions);
  const oldScore = attempt.score ?? 0;

  if (result.total < env.CERT_PASS_THRESHOLD) {
    throw ApiError.conflict(
      `Rescore would give ${result.total}%, below the ${env.CERT_PASS_THRESHOLD}% certification threshold — not applied. ` +
      'Review the question content or handle the certificate manually.',
    );
  }

  attempt.score = result.total;
  attempt.sectionScores = result.sectionScores;
  // Refresh the frozen snapshots to the content just scored against, so the
  // answer review always agrees with the (new) recorded score.
  for (const entry of attempt.paper) {
    const q = questions.get(entry.questionId.toString());
    if (!q) continue;
    entry.snapshot = {
      body: q.body,
      ...(q.options ? { options: q.options } : {}),
      ...(q.blanks ? { blanks: q.blanks } : {}),
      ...(q.nodes ? { nodes: q.nodes } : {}),
    };
  }
  attempt.markModified('paper');
  cert.score = result.total;
  cert.scoreBand = scoreBand(result.total);
  await Promise.all([attempt.save(), cert.save()]);
  await recomputeReadiness(cert.orgId.toString());
  await logAudit('admin.attempt_rescored', 'Certificate', cert.certId, authUser(req).id, {
    attemptId: attempt.id,
    oldScore,
    newScore: result.total,
  });

  res.json({
    success: true,
    data: { certId: cert.certId, oldScore, newScore: result.total, scoreBand: cert.scoreBand },
  });
};

// ── Audit trail & platform config ────────────────────────────────────────

export const listAuditLog: RequestHandler = async (req, res) => {
  const { page, limit, skip } = pagination(req);
  const filter: Record<string, unknown> = {};
  if (req.query.entity) filter.entity = req.query.entity;
  const [total, entries] = await Promise.all([
    AuditLog.countDocuments(filter),
    AuditLog.find(filter).sort({ at: -1 }).skip(skip).limit(limit),
  ]);
  res.json({
    success: true,
    data: entries,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
};

// Thresholds are env-driven platform constants (PRD §3) — exposed read-only.
export const getConfig: RequestHandler = async (_req, res) => {
  res.json({
    success: true,
    data: {
      certPassThreshold: env.CERT_PASS_THRESHOLD,
      orgReadyThreshold: env.ORG_READY_THRESHOLD,
      attemptTimeLimitMin: env.ATTEMPT_TIME_LIMIT_MIN,
      maxAttemptsPerCycle: env.MAX_ATTEMPTS_PER_CYCLE,
      paperComposition: {
        mcq: env.PAPER_MCQ_COUNT,
        fib: env.PAPER_FIB_COUNT,
        caseStudy: env.PAPER_CASE_COUNT,
        simulation: env.PAPER_SIM_COUNT,
      },
    },
  });
};

// ── Audits & auditors ─────────────────────────────────────────────────────

export const createAuditSlot: RequestHandler = async (req, res) => {
  const slot = await AuditSlot.create({ startsAt: req.body.startsAt });
  res.status(201).json({ success: true, data: { id: slot.id, startsAt: slot.startsAt } });
};

export const assignAuditor: RequestHandler = async (req, res) => {
  const auditor = await User.findOne({
    _id: req.body.auditorId,
    role: 'auditor',
    isDeleted: false,
  });
  if (!auditor) throw ApiError.badRequest('Auditor not found');

  const audit = await Audit.findByIdAndUpdate(
    req.params.id,
    { $set: { auditorId: new Types.ObjectId(req.body.auditorId as string) } },
    { new: true },
  );
  if (!audit) throw ApiError.notFound();
  await logAudit('admin.auditor_assigned', 'Audit', audit.id, authUser(req).id, {
    auditorId: req.body.auditorId,
  });
  res.json({ success: true, data: { auditId: audit.id, auditorId: req.body.auditorId } });
};

export const createAuditor: RequestHandler = async (req, res) => {
  const existing = await User.findOne({ email: (req.body.email as string).toLowerCase() });
  if (existing) throw ApiError.conflict('An account with this email already exists');
  const auditor = await User.create({
    email: req.body.email,
    name: req.body.name,
    role: 'auditor',
    passwordHash: await bcrypt.hash(req.body.password as string, 12),
    status: 'active',
  });
  res.status(201).json({ success: true, data: { id: auditor.id, email: auditor.email } });
};

export const setTrustScore: RequestHandler = async (req, res) => {
  await PublicStats.findOneAndUpdate(
    { key: 'current' },
    { $set: { trustScore: req.body.trustScore }, $setOnInsert: { refreshedAt: new Date() } },
    { upsert: true },
  );
  await logAudit('admin.trust_score_set', 'PublicStats', 'current', authUser(req).id, {
    trustScore: req.body.trustScore,
  });
  res.json({ success: true, data: { trustScore: req.body.trustScore } });
};


export const uploadCertificate: RequestHandler = async (req, res) => {
  const { id } = req.params;
  const { filename, base64Data } = req.body as { filename: string; base64Data: string };

  if (!filename || !base64Data) {
    throw ApiError.badRequest('Missing filename or base64Data');
  }

  const org = await Organisation.findById(id);
  if (!org) throw ApiError.notFound();

  // Save the custom certificate data and set status to certificate_issued
  org.compliance.status = 'certificate_issued';
  org.compliance.certificateId = `COMP-${org.orgCode}-${Date.now().toString(36).toUpperCase()}`;
  org.compliance.validTill = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year validity
  org.compliance.customCertificateFilename = filename;
  org.compliance.customCertificateData = base64Data;

  await org.save();
  await logAudit('admin.certificate_uploaded', 'Organisation', org.id, authUser(req).id, { filename });

  res.json({
    success: true,
    data: {
      certificateId: org.compliance.certificateId,
      filename: org.compliance.customCertificateFilename,
    },
  });
};

// Super admin: download the compliance certificate attached to an organisation
export const downloadOrgCertificate: RequestHandler = async (req, res) => {
  const org = await Organisation.findById(req.params.id);
  if (!org) throw ApiError.notFound();

  if (!org.compliance.customCertificateData || !org.compliance.customCertificateFilename) {
    throw ApiError.notFound('No certificate uploaded for this organisation');
  }

  const fileBuffer = Buffer.from(org.compliance.customCertificateData, 'base64');

  let contentType = 'application/octet-stream';
  let ext = '';
  const b64 = org.compliance.customCertificateData;
  if (b64.startsWith('JVBERi0')) { contentType = 'application/pdf'; ext = '.pdf'; }
  else if (b64.startsWith('iVBORw0KGgo')) { contentType = 'image/png'; ext = '.png'; }
  else if (b64.startsWith('/9j/')) { contentType = 'image/jpeg'; ext = '.jpg'; }

  let filename = org.compliance.customCertificateFilename;
  if (ext && !filename.toLowerCase().includes('.')) filename += ext;

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.send(fileBuffer);
};

// Super admin: download a specific evidence document by org id + document index
export const downloadOrgAuditDocument: RequestHandler = async (req, res) => {
  const audit = await Audit.findOne({ orgId: req.params.id }).sort({ createdAt: -1 });
  if (!audit) throw ApiError.notFound('No audit found for this organisation');

  const index = parseInt(req.params.docIndex as string, 10);
  const doc = audit.documents[index];
  if (!doc || !doc.base64Data) throw ApiError.notFound('Document not found');

  const fileBuffer = Buffer.from(doc.base64Data, 'base64');

  let contentType = 'application/octet-stream';
  let ext = '';
  if (doc.base64Data.startsWith('JVBERi0')) { contentType = 'application/pdf'; ext = '.pdf'; }
  else if (doc.base64Data.startsWith('iVBORw0KGgo')) { contentType = 'image/png'; ext = '.png'; }
  else if (doc.base64Data.startsWith('/9j/')) { contentType = 'image/jpeg'; ext = '.jpg'; }

  let filename = doc.name;
  if (ext && !filename.toLowerCase().includes('.')) filename += ext;

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.send(fileBuffer);
};
