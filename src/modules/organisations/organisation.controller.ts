import type { RequestHandler } from 'express';
import { Organisation } from './organisation.model';
import { getOrgDashboard } from './dashboard.service';
import { recomputeReadiness } from '../scoring/readiness.service';
import { ReadyCertificate } from '../certificates/readyCertificate.model';
import { ApiError } from '../../utils/ApiError';
import { authOrgId, authUser } from '../../utils/authUser';
import { env } from '../../config/env';
import { logAudit } from '../auditlog/auditLog.model';
import { invalidateDashboardCache } from './dashboard.service';

export const getMyOrg: RequestHandler = async (req, res) => {
  const org = await Organisation.findOne({ _id: authOrgId(req), isDeleted: false });
  if (!org) throw ApiError.notFound();
  res.json({
    success: true,
    data: {
      id: org.id,
      name: org.name,
      orgCode: org.orgCode,
      registrationNo: org.registrationNo,
      industry: org.industry ?? null,
      companySize: org.companySize ?? null,
      gst: org.gst ?? null,
      billingContact: org.billingContact ?? null,
      headcount: org.headcount,
      reportingPeriod: org.reportingPeriod ?? null,
      seatsActive: org.seatsActive,
      readiness: org.readiness,
      compliance: org.compliance,
    },
  });
};

export const patchMyOrg: RequestHandler = async (req, res) => {
  const update: Record<string, unknown> = {};
  if (req.body.headcount !== undefined) update.headcount = req.body.headcount;
  if (req.body.reportingPeriod !== undefined) update.reportingPeriod = req.body.reportingPeriod;
  if (req.body.industry !== undefined) update.industry = req.body.industry;
  if (req.body.companySize !== undefined) update.companySize = req.body.companySize;
  if (req.body.gst !== undefined) update.gst = req.body.gst;
  if (req.body.billingContact !== undefined) update.billingContact = req.body.billingContact;

  const org = await Organisation.findOneAndUpdate(
    { _id: authOrgId(req), isDeleted: false },
    { $set: update },
    { new: true },
  );
  if (!org) throw ApiError.notFound();
  res.json({ success: true, data: { id: org.id, headcount: org.headcount, reportingPeriod: org.reportingPeriod } });
};

export const getReadiness: RequestHandler = async (req, res) => {
  const readiness = await recomputeReadiness(authOrgId(req));
  res.json({ success: true, data: readiness });
};

export const getDashboard: RequestHandler = async (req, res) => {
  const data = await getOrgDashboard(authOrgId(req));
  res.json({ success: true, data });
};

// The org's POSH Ready certificate (Step 5) — issued automatically at 95%.
export const getReadyCertificate: RequestHandler = async (req, res) => {
  const ready = await ReadyCertificate.findOne({ orgId: authOrgId(req) }).sort({ issuedAt: -1 });
  if (!ready) throw ApiError.notFound('Not POSH Ready yet — no certificate issued');
  res.json({
    success: true,
    data: {
      readyId: ready.readyId,
      score: ready.score,
      cycle: ready.cycle,
      issuedAt: ready.issuedAt,
      verifyUrl: `${env.CERT_VERIFY_BASE_URL}/${ready.readyId}`,
    },
  });
};

// Escape HTML entities to prevent XSS in server-rendered certificate pages.
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Printable POSH Ready certificate — mirrors the individual cert print view,
// but branded 'READY' and worded so it is never mistaken for POSH Compliant.
export const getReadyCertificatePdf: RequestHandler = async (req, res) => {
  const org = await Organisation.findOne({ _id: authOrgId(req), isDeleted: false });
  if (!org) throw ApiError.notFound();
  const ready = await ReadyCertificate.findOne({ orgId: org._id }).sort({ issuedAt: -1 });
  if (!ready) throw ApiError.notFound('Not POSH Ready yet — no certificate issued');
  const verifyUrl = `${env.CERT_VERIFY_BASE_URL}/${ready.readyId}`;

  const safeOrgName = escapeHtml(org.name);
  const safeReadyId = escapeHtml(ready.readyId);
  const safeVerifyUrl = escapeHtml(verifyUrl);
  const safeDate = escapeHtml(ready.issuedAt.toISOString().slice(0, 10));
  const safeCycle = escapeHtml(ready.cycle);
  const safeScore = String(ready.score);

  res.type('html').send(`<!doctype html>
<html><head><meta charset="utf-8"><title>${safeReadyId}</title>
<style>
  body { font-family: Georgia, serif; background: #f6f3ea; margin: 0; padding: 48px; }
  .frame { max-width: 720px; margin: 0 auto; background: #fffdf7; border: 3px double #123b2a; padding: 56px; text-align: center; }
  .brand { letter-spacing: .2em; color: #123b2a; font-size: 14px; }
  h1 { color: #123b2a; margin: 16px 0 4px; }
  .muted { color: #6b6b5f; }
  .name { font-size: 30px; color: #c2521a; margin: 24px 0 8px; }
  .badge { display:inline-block; margin-top:8px; padding:6px 14px; border:1px solid #1e7a4e; border-radius:999px; color:#1e7a4e; font-family:Arial,sans-serif; font-size:13px; }
  .disclaimer { margin-top:20px; font-family:Arial,sans-serif; font-size:12px; color:#6b6b5f; }
  .meta { font-family: 'Courier New', monospace; font-size: 13px; margin-top: 24px; color: #333; }
  @media print { body { padding: 0; background: #fff; } }
</style></head><body>
  <div class="frame">
    <div class="brand">✦ POSH COMPASS</div>
    <h1>Certificate of POSH Readiness</h1>
    <p class="muted">This is to certify that</p>
    <div class="name">${safeOrgName}</div>
    <p>has achieved <strong>POSH Ready</strong> status with ${safeScore}% of enrolled<br>employees certified for ${safeCycle}.</p>
    <div class="badge">✓ POSH Ready — self-assessed</div>
    <p class="disclaimer">POSH Ready attests self-assessed readiness. It is <strong>not</strong> the audited POSH Compliant certificate, which is issued by Jijiwisha Society after an audit.</p>
    <div class="meta">${safeReadyId} · ${safeDate}<br>Verify: ${safeVerifyUrl}</div>
  </div>
  <script>window.print()</script>
</body></html>`);
};

// Step 6: HR may decline the audit and stop at the POSH Ready certificate.
// Non-destructive — the audit can still be booked later (status is not terminal).
export const declineAudit: RequestHandler = async (req, res) => {
  const orgId = authOrgId(req);
  const org = await Organisation.findOne({ _id: orgId, isDeleted: false });
  if (!org) throw ApiError.notFound();
  if (!org.readiness.isReady) throw ApiError.forbidden('Audit options unlock at 95% readiness');
  if (['scheduled', 'in_review', 'changes_requested', 'passed', 'certificate_issued'].includes(org.compliance.status)) {
    throw ApiError.badRequest('An audit is already in progress or completed');
  }
  org.compliance.status = 'declined';
  await org.save();
  invalidateDashboardCache(orgId);
  await logAudit('audit.declined', 'Organisation', org.id, authUser(req).id);
  res.json({ success: true, data: { status: org.compliance.status } });
};

export const getCustomCertificate: RequestHandler = async (req, res) => {
  const orgId = authOrgId(req);
  const org = await Organisation.findOne({ _id: orgId, isDeleted: false });
  if (!org) throw ApiError.notFound();

  if (!org.compliance.customCertificateData || !org.compliance.customCertificateFilename) {
    throw ApiError.notFound('No custom certificate uploaded for this organisation');
  }

  const pdfBuffer = Buffer.from(org.compliance.customCertificateData, 'base64');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${org.compliance.customCertificateFilename}"`
  );
  res.send(pdfBuffer);
};
