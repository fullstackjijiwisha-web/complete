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
  
  if (req.body.type) {
    if (req.body.type === 'fib') { question.options = undefined; question.nodes = undefined; }
    else if (req.body.type === 'simulation') { question.options = undefined; question.blanks = undefined; }
    else { question.blanks = undefined; question.nodes = undefined; }
  }
  
  Object.assign(question, req.body);
  assertQuestionShape(question.toObject());
  
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

  const orgsWithAudits = await Promise.all(
    orgs.map(async (org) => {
      const audit = await Audit.findOne({ orgId: org._id }).sort({ createdAt: -1 });
      return {
        ...org.toObject(),
        currentAudit: audit
          ? {
            id: audit._id,
            status: audit.status,
            documents: audit.documents.map((d, index) => ({
              name: d.name,
              uploadedAt: d.uploadedAt,
              downloadUrl: `/api/v1/audits/${audit._id}/documents/${index}`,
            })),
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
