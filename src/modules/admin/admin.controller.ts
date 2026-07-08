import type { RequestHandler } from 'express';
import bcrypt from 'bcryptjs';
import { Question } from '../questions/question.model';
import { Organisation } from '../organisations/organisation.model';
import { User } from '../users/user.model';
import { Audit, AuditSlot } from '../audits/audit.model';
import { AuditLog, logAudit } from '../auditlog/auditLog.model';
import { PublicStats } from '../stats/publicStats.model';
import { ApiError } from '../../utils/ApiError';
import { authUser } from '../../utils/authUser';
import { env } from '../../config/env';
import { Types } from 'mongoose';

function pagination(req: Parameters<RequestHandler>[0]) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

// ── Question bank ─────────────────────────────────────────────────────────

export const listQuestions: RequestHandler = async (req, res) => {
  const { page, limit, skip } = pagination(req);
  const filter: Record<string, unknown> = {};
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
  if (type === 'case_study' && !(body.options as unknown[] | undefined)?.length) {
    throw ApiError.badRequest('Case study needs weighted options');
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
  Object.assign(question, req.body);
  if (touchesContent) question.version += 1;
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
  res.json({
    success: true,
    data: orgs,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
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
