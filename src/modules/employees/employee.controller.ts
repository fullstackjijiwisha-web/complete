import type { RequestHandler } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { User } from '../users/user.model';
import { Organisation } from '../organisations/organisation.model';
import { Certificate } from '../certificates/certificate.model';
import { AssessmentAttempt } from '../assessments/attempt.model';
import { createEmployee, issueInvite } from './employee.service';
import { recomputeReadiness } from '../scoring/readiness.service';
import { ApiError } from '../../utils/ApiError';
import { authOrgId, authUser } from '../../utils/authUser';
import { parseCsv } from '../../utils/csv';
import { currentCycle } from '../../utils/ids';
import { logAudit } from '../auditlog/auditLog.model';

// Roster status per employee (PRD F5): HR sees who has/hasn't completed and
// individual scores in a flat list — never any department/team grouping (§3.6).
export const listEmployees: RequestHandler = async (req, res) => {
  const orgId = new Types.ObjectId(authOrgId(req));
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const cycle = currentCycle();

  const filter = { orgId, role: 'employee' as const, isDeleted: false };
  const [total, employees] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter)
      .sort({ employeeCode: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('name email whatsapp employeeCode status retrainingFlagged createdAt'),
  ]);

  const userIds = employees.map((e) => e._id);
  const [certs, scoredBest, inProgress] = await Promise.all([
    Certificate.find({ userId: { $in: userIds }, cycle, revoked: false }).select('userId score'),
    AssessmentAttempt.aggregate<{ _id: Types.ObjectId; bestScore: number; attempts: number }>([
      { $match: { userId: { $in: userIds }, cycle, status: 'scored' } },
      { $group: { _id: '$userId', bestScore: { $max: '$score' }, attempts: { $sum: 1 } } },
    ]),
    AssessmentAttempt.find({ userId: { $in: userIds }, cycle, status: 'in_progress' }).select('userId'),
  ]);

  const certByUser = new Map(certs.map((c) => [c.userId.toString(), c.score]));
  const bestByUser = new Map(scoredBest.map((r) => [r._id.toString(), r]));
  const inProgressSet = new Set(inProgress.map((a) => a.userId.toString()));

  const data = employees.map((e) => {
    const id = e._id.toString();
    let assessmentStatus: string;
    if (certByUser.has(id)) assessmentStatus = 'certified';
    else if (bestByUser.has(id)) assessmentStatus = 'not_certified';
    else if (inProgressSet.has(id)) assessmentStatus = 'in_progress';
    else assessmentStatus = 'not_started';
    return {
      id,
      name: e.name,
      email: e.email,
      whatsapp: e.whatsapp ?? null,
      employeeCode: e.employeeCode,
      inviteStatus: e.status,
      assessmentStatus,
      bestScore: bestByUser.get(id)?.bestScore ?? null,
      attemptsUsed: bestByUser.get(id)?.attempts ?? 0,
      retrainingFlagged: e.retrainingFlagged,
    };
  });

  res.json({
    success: true,
    data,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
};

export const addEmployee: RequestHandler = async (req, res) => {
  const orgId = authOrgId(req);
  const result = await createEmployee(orgId, req.body);
  await recomputeReadiness(orgId);
  res.status(201).json({ success: true, data: result });
};

const importRowSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(254),
  whatsapp: z.string().max(20).optional(),
});

// Bulk enrolment from raw CSV (Content-Type: text/csv). Columns: name,email,whatsapp
// (whatsapp optional). Every row is re-validated server-side; a per-row error
// report is returned and saved for download.
export const importEmployees: RequestHandler = async (req, res) => {
  const orgId = authOrgId(req);
  const raw = typeof req.body === 'string' ? req.body : '';
  if (!raw.trim()) throw ApiError.badRequest('Empty CSV body');

  const rows = parseCsv(raw);
  // Skip a header row if the first line doesn't contain an email address.
  const startIdx = rows[0] && !rows[0].some((c) => c.includes('@')) ? 1 : 0;

  const created: Array<{ row: number; email: string; employeeCode: string }> = [];
  const errors: Array<{ row: number; error: string }> = [];

  for (let i = startIdx; i < rows.length; i++) {
    const cols = rows[i] ?? [];
    const whatsapp = (cols[2] ?? '').trim();
    const candidate = {
      name: (cols[0] ?? '').trim(),
      email: (cols[1] ?? '').trim(),
      ...(whatsapp ? { whatsapp } : {}),
    };
    const parsedRow = importRowSchema.safeParse(candidate);
    if (!parsedRow.success) {
      errors.push({ row: i + 1, error: parsedRow.error.issues.map((iss) => iss.message).join('; ') });
      continue;
    }
    try {
      const result = await createEmployee(orgId, parsedRow.data);
      created.push({ row: i + 1, email: parsedRow.data.email, employeeCode: result.employeeCode });
    } catch (err) {
      errors.push({ row: i + 1, error: err instanceof ApiError ? err.message : 'Failed to create' });
    }
  }

  // Save the latest errors to the organisation document so they are downloadable.
  await Organisation.updateOne({ _id: orgId }, { $set: { lastImportErrors: errors } });

  if (created.length > 0) {
    await recomputeReadiness(orgId);
  }

  res.status(errors.length && !created.length ? 400 : 201).json({
    success: true,
    data: { createdCount: created.length, created, errorCount: errors.length, errors },
  });
};

export const resendInvite: RequestHandler = async (req, res) => {
  const orgId = authOrgId(req);
  const employee = await User.findOne({
    _id: req.params.id,
    orgId: new Types.ObjectId(orgId),
    role: 'employee',
    isDeleted: false,
  });
  if (!employee) throw ApiError.notFound();
  if (employee.status !== 'invited') throw ApiError.badRequest('Employee has already activated their account');

  const org = await Organisation.findById(orgId);
  await issueInvite(employee.id, orgId, employee.email, org?.name ?? 'Your organisation', employee.whatsapp);
  res.json({ success: true, data: { resent: true } });
};

// After MAX_ATTEMPTS_PER_CYCLE, further re-attempts need HR approval (PRD §3.5).
export const approveReattempt: RequestHandler = async (req, res) => {
  const employee = await User.findOneAndUpdate(
    {
      _id: req.params.id,
      orgId: new Types.ObjectId(authOrgId(req)),
      role: 'employee',
      isDeleted: false,
    },
    { $set: { reattemptApprovedAt: new Date() } },
    { new: true },
  );
  if (!employee) throw ApiError.notFound();
  await logAudit('employee.reattempt_approved', 'User', employee.id, authUser(req).id);
  res.json({ success: true, data: { approved: true } });
};

export const removeEmployee: RequestHandler = async (req, res) => {
  const orgId = authOrgId(req);
  const employee = await User.findOneAndUpdate(
    {
      _id: req.params.id,
      orgId: new Types.ObjectId(orgId),
      role: 'employee',
      isDeleted: false,
    },
    { $set: { isDeleted: true, deletedAt: new Date() } },
    { new: true },
  );
  if (!employee) throw ApiError.notFound();
  await logAudit('employee.removed', 'User', employee.id, authUser(req).id);
  // Roster change moves the readiness denominator (PRD §16.4).
  await recomputeReadiness(orgId);
  res.json({ success: true, data: { removed: true } });
};

// Returns a blank CSV template so HR admins know the required column headers
// and format before attempting an import. No auth data in the template.
export const downloadImportTemplate: RequestHandler = (_req, res) => {
  const header = 'name,email,whatsapp\n';
  const example = '"Priya Sharma",priya.sharma@example.com,+919876543210\n';
  res
    .type('text/csv')
    .setHeader('Content-Disposition', 'attachment; filename="employee-import-template.csv"')
    .send(header + example);
};

// Exposes a downloadable CSV error report of the last CSV bulk upload.
export const downloadImportErrors: RequestHandler = async (req, res) => {
  const orgId = authOrgId(req);
  const org = await Organisation.findById(orgId).select('lastImportErrors');
  if (!org) throw ApiError.notFound();

  const errors = org.lastImportErrors ?? [];
  let csv = 'Row,Error\n';
  for (const err of errors) {
    const cleanErr = err.error.replace(/"/g, '""');
    csv += `${err.row},"${cleanErr}"\n`;
  }

  res
    .type('text/csv')
    .setHeader('Content-Disposition', 'attachment; filename="employee-import-errors.csv"')
    .send(csv);
};


