import type { RequestHandler } from 'express';
import { Types } from 'mongoose';
import { Audit, AuditSlot, NCW_CHECKLIST_TEMPLATE } from './audit.model';
import { Organisation } from '../organisations/organisation.model';
import { User } from '../users/user.model';
import { Certificate } from '../certificates/certificate.model';
import { ComplianceCertificate } from '../certificates/complianceCertificate.model';
import { ApiError } from '../../utils/ApiError';
import { authOrgId, authUser } from '../../utils/authUser';
import { newCompId, currentCycle } from '../../utils/ids';
import { logAudit } from '../auditlog/auditLog.model';
import { refreshPublicStats } from '../stats/stats.service';
import { invalidateDashboardCache } from '../organisations/dashboard.service';

export const listSlots: RequestHandler = async (_req, res) => {
  const slots = await AuditSlot.find({ isBooked: false, startsAt: { $gt: new Date() } })
    .sort({ startsAt: 1 })
    .limit(50);
  res.json({
    success: true,
    data: slots.map((s) => ({ id: s.id, startsAt: s.startsAt })),
  });
};

// Latest audit for the caller's organisation — lets the HR audit page restore
// its state without knowing the audit id up front.
export const getCurrentForOrg: RequestHandler = async (req, res) => {
  const audit = await Audit.findOne({ orgId: new Types.ObjectId(authOrgId(req)) })
    .sort({ createdAt: -1 })
    .populate<{ slotId: { startsAt: Date } | null }>('slotId', 'startsAt');
  if (!audit) throw ApiError.notFound('No audit booked yet');
  res.json({ success: true, data: audit });
};

// Precondition: organisation is POSH Ready (PRD §3.4). Audit booking is the
// entry to Tier 2 — POSH Ready itself is never presented as compliance.
export const book: RequestHandler = async (req, res) => {
  const orgId = authOrgId(req);
  const org = await Organisation.findOne({ _id: orgId, isDeleted: false });
  if (!org) throw ApiError.notFound();

  const cycle = currentCycle();
  if (!org.readiness.isReady || org.readiness.cycle !== cycle) {
    throw ApiError.forbidden('Audit booking unlocks at 95% readiness');
  }

  const existing = await Audit.findOne({
    orgId: org._id,
    status: { $in: ['requested', 'scheduled', 'in_review', 'changes_requested'] },
  });
  if (existing) throw ApiError.conflict('An audit is already in progress for this organisation');

  const audit = await Audit.create({
    orgId: org._id,
    status: 'requested',
    checklist: NCW_CHECKLIST_TEMPLATE.map((item) => ({ item, status: 'pending' })),
  });

  org.compliance.status = 'requested';
  await org.save();
  invalidateDashboardCache(orgId);
  await logAudit('audit.booked', 'Audit', audit.id, authUser(req).id, {
    info: 'Audit requested directly without slots'
  });

  res.status(201).json({
    success: true,
    data: { auditId: audit.id, status: audit.status },
  });
};

// Document metadata upload. Actual file storage (signed S3/Cloudinary upload)
// is an open infra decision — PRD §16.
export const addDocument: RequestHandler = async (req, res) => {
  const audit = await Audit.findOne({
    _id: req.params.id,
    orgId: new Types.ObjectId(authOrgId(req)),
  });
  if (!audit) throw ApiError.notFound();

  audit.documents.push({
    name: req.body.name,
    url: req.body.url || 'local_upload',
    base64Data: req.body.base64Data,
    uploadedAt: new Date(),
  });
  await audit.save();
  res.status(201).json({ success: true, data: { documents: audit.documents.length } });
};

export const downloadAuditDocument: RequestHandler = async (req, res) => {
  const user = authUser(req);
  const filter: Record<string, unknown> = { _id: req.params.id };
  if (user.role === 'hr_admin') filter.orgId = new Types.ObjectId(authOrgId(req));
  else if (user.role === 'auditor') filter.auditorId = new Types.ObjectId(user.id);
  // super_admin: unrestricted

  const audit = await Audit.findOne(filter);
  if (!audit) throw ApiError.notFound();

  const index = parseInt(req.params.docIndex as string, 10);
  const doc = audit.documents[index];
  if (!doc || !doc.base64Data) throw ApiError.notFound('Document file not found');

  const fileBuffer = Buffer.from(doc.base64Data, 'base64');
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${doc.name}"`);
  res.send(fileBuffer);
};

// HR sees own-org audits; auditors only audits assigned to them (PRD §2.2).
export const getById: RequestHandler = async (req, res) => {
  const user = authUser(req);
  const filter: Record<string, unknown> = { _id: req.params.id };
  if (user.role === 'hr_admin') filter.orgId = new Types.ObjectId(authOrgId(req));
  else if (user.role === 'auditor') filter.auditorId = new Types.ObjectId(user.id);
  // super_admin: unrestricted

  const audit = await Audit.findOne(filter);
  if (!audit) throw ApiError.notFound();
  res.json({ success: true, data: audit });
};

export const updateChecklist: RequestHandler = async (req, res) => {
  const user = authUser(req);
  const filter: Record<string, unknown> = { _id: req.params.id };
  if (user.role === 'auditor') filter.auditorId = new Types.ObjectId(user.id);

  const audit = await Audit.findOne(filter);
  if (!audit) throw ApiError.notFound();

  const { index, status, note } = req.body as { index: number; status: 'pending' | 'ok' | 'issue'; note?: string };
  const item = audit.checklist[index];
  if (!item) throw ApiError.badRequest('Checklist item does not exist');
  item.status = status;
  if (note !== undefined) item.note = note;
  if (audit.status === 'scheduled') audit.status = 'in_review';
  await audit.save();
  res.json({ success: true, data: audit.checklist });
};

export const decide: RequestHandler = async (req, res) => {
  const user = authUser(req);
  const filter: Record<string, unknown> = { _id: req.params.id };
  if (user.role === 'auditor') filter.auditorId = new Types.ObjectId(user.id);

  const audit = await Audit.findOne(filter);
  if (!audit) throw ApiError.notFound();
  if (['passed', 'failed', 'certificate_issued'].includes(audit.status)) {
    throw ApiError.badRequest('Audit already decided');
  }

  const decision = req.body.decision as 'passed' | 'failed' | 'changes_requested';
  if (decision === 'passed' && audit.checklist.some((c) => c.status !== 'ok')) {
    // Certificate only with checklist complete (PRD §2.2 role matrix).
    throw ApiError.badRequest('All checklist items must be ok before passing');
  }

  audit.status = decision;
  audit.findings = req.body.findings ?? audit.findings;
  audit.decisionAt = new Date();

  const org = await Organisation.findById(audit.orgId);
  if (!org) throw ApiError.notFound();

  let compCertificate: { compId: string; validTill: Date } | null = null;
  if (decision === 'passed') {
    const issuedAt = new Date();
    const validTill = new Date(issuedAt);
    validTill.setMonth(validTill.getMonth() + 13); // 13-month validity
    const comp = await ComplianceCertificate.create({
      compId: newCompId(issuedAt.getFullYear(), org.orgCode),
      orgId: org._id,
      auditId: audit._id,
      issuedAt,
      validTill,
    });
    audit.status = 'certificate_issued';
    org.compliance = { status: 'certificate_issued', certificateId: comp.compId, validTill };
    compCertificate = { compId: comp.compId, validTill };
  } else {
    org.compliance.status = decision;
  }

  await Promise.all([audit.save(), org.save()]);
  invalidateDashboardCache(org.id);
  await logAudit('audit.decision', 'Audit', audit.id, user.id, { decision });
  await refreshPublicStats();

  res.json({
    success: true,
    data: { auditId: audit.id, status: audit.status, compCertificate },
  });
};

// One-click audit pack (PRD §1.3/F6): org readiness record + per-employee
// certification list (name + status + score band only — §3.6 guardrail:
// no departments, no per-question responses, no raw scores).
export const exportPack: RequestHandler = async (req, res) => {
  const user = authUser(req);
  const filter: Record<string, unknown> = { _id: req.params.id };
  if (user.role === 'hr_admin') filter.orgId = new Types.ObjectId(authOrgId(req));
  else if (user.role === 'auditor') filter.auditorId = new Types.ObjectId(user.id);

  const audit = await Audit.findOne(filter);
  if (!audit) throw ApiError.notFound();

  const org = await Organisation.findById(audit.orgId);
  if (!org) throw ApiError.notFound();
  const cycle = currentCycle();

  const [employees, certs] = await Promise.all([
    User.find({ orgId: org._id, role: 'employee', isDeleted: false }).select('name employeeCode'),
    Certificate.find({ orgId: org._id, cycle, revoked: false }).select('userId certId scoreBand issuedAt'),
  ]);
  const certByUser = new Map(certs.map((c) => [c.userId.toString(), c]));

  await logAudit('audit.pack_exported', 'Audit', audit.id, user.id);
  res.json({
    success: true,
    data: {
      organisation: { name: org.name, orgCode: org.orgCode },
      cycle,
      readiness: org.readiness,
      compliance: org.compliance,
      documents: audit.documents,
      checklist: audit.checklist,
      roster: employees.map((e) => {
        const cert = certByUser.get(e._id.toString());
        return {
          name: e.name,
          employeeCode: e.employeeCode,
          status: cert ? 'certified' : 'not_certified',
          scoreBand: cert?.scoreBand ?? null,
          certId: cert?.certId ?? null,
          issuedAt: cert?.issuedAt ?? null,
        };
      }),
      exportedAt: new Date(),
    },
  });
};
