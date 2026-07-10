import type { RequestHandler } from 'express';
import { Types } from 'mongoose';
import { Certificate } from './certificate.model';
import { ComplianceCertificate } from './complianceCertificate.model';
import { ReadyCertificate } from './readyCertificate.model';
import { User } from '../users/user.model';
import { Organisation } from '../organisations/organisation.model';
import { ApiError } from '../../utils/ApiError';
import { authUser } from '../../utils/authUser';
import { env } from '../../config/env';

export const getMine: RequestHandler = async (req, res) => {
  const certs = await Certificate.find({
    userId: new Types.ObjectId(authUser(req).id),
    revoked: false,
  }).sort({ issuedAt: -1 });
  res.json({
    success: true,
    data: certs.map((c) => ({
      certId: c.certId,
      score: c.score,
      scoreBand: c.scoreBand,
      cycle: c.cycle,
      issuedAt: c.issuedAt,
      verifyUrl: `${env.CERT_VERIFY_BASE_URL}/${c.certId}`,
    })),
  });
};

// Escape HTML entities to prevent XSS in server-rendered certificate pages.
// User names and org names are untrusted — they must never be injected raw.
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Server-rendered printable certificate ("PDF via print dialog" per the mock).
// TODO(P1): true PDF via Puppeteer or @react-pdf/renderer, plus HMAC-signed QR
// payload using CERT_SIGNING_SECRET (PRD §11).
export const getMinePdf: RequestHandler = async (req, res) => {
  const userId = authUser(req).id;
  const cert = await Certificate.findOne({
    userId: new Types.ObjectId(userId),
    revoked: false,
  }).sort({ issuedAt: -1 });
  if (!cert) throw ApiError.notFound('No certificate yet — score 80%+ to unlock it');

  const [user, org] = await Promise.all([User.findById(userId), Organisation.findById(cert.orgId)]);
  const verifyUrl = `${env.CERT_VERIFY_BASE_URL}/${cert.certId}`;

  const safeName = escapeHtml(user?.name ?? '');
  const safeOrg = escapeHtml(org?.name ?? '');
  const safeCertId = escapeHtml(cert.certId);
  const safeVerifyUrl = escapeHtml(verifyUrl);
  const safeDate = escapeHtml(cert.issuedAt.toISOString().slice(0, 10));

  res.type('html').send(`<!doctype html>
<html><head><meta charset="utf-8"><title>${safeCertId}</title>
<style>
  body { font-family: Georgia, serif; background: #f6f3ea; margin: 0; padding: 48px; }
  .frame { max-width: 720px; margin: 0 auto; background: #fffdf7; border: 3px double #123b2a; padding: 56px; text-align: center; }
  .brand { letter-spacing: .2em; color: #123b2a; font-size: 14px; }
  h1 { color: #123b2a; margin: 16px 0 4px; }
  .muted { color: #6b6b5f; }
  .name { font-size: 32px; color: #c2521a; margin: 24px 0 8px; }
  .meta { font-family: 'Courier New', monospace; font-size: 13px; margin-top: 28px; color: #333; }
  @media print { body { padding: 0; background: #fff; } }
</style></head><body>
  <div class="frame">
    <div class="brand">✦ POSH COMPASS</div>
    <h1>Certificate of Completion</h1>
    <p class="muted">This is to certify that</p>
    <div class="name">${safeName}</div>
    <p>has successfully completed the POSH Assessment<br>with a score of <strong>${cert.score}%</strong>.</p>
    <p class="muted">${safeOrg}</p>
    <div class="meta">${safeCertId} · ${safeDate}<br>Verify: ${safeVerifyUrl}</div>
  </div>
  <script>window.print()</script>
</body></html>`);
};

// Public verification (PRD §3.6): minimal fields only — name, org, status,
// score band (never raw score), issue date. 404 is identical for unknown and
// revoked IDs — no enumeration hints.
export const publicVerify: RequestHandler = async (req, res) => {
  const certId = String(req.params.certId ?? '');

  if (certId.startsWith('CERT-')) {
    const cert = await Certificate.findOne({ certId, revoked: false });
    if (!cert) throw ApiError.notFound('Certificate not found');
    const [user, org] = await Promise.all([
      User.findById(cert.userId),
      Organisation.findById(cert.orgId),
    ]);
    res.json({
      success: true,
      data: {
        certId: cert.certId,
        type: 'individual',
        holderName: user?.name ?? 'Unknown',
        organisation: org?.name ?? 'Unknown',
        status: 'valid',
        scoreBand: cert.scoreBand,
        issuedAt: cert.issuedAt.toISOString().slice(0, 10),
      },
    });
    return;
  }

  if (certId.startsWith('COMP-')) {
    const comp = await ComplianceCertificate.findOne({ compId: certId });
    if (!comp) throw ApiError.notFound('Certificate not found');
    const org = await Organisation.findById(comp.orgId);
    res.json({
      success: true,
      data: {
        certId: comp.compId,
        type: 'compliance',
        organisation: org?.name ?? 'Unknown',
        status: comp.validTill > new Date() ? 'valid' : 'expired',
        issuedAt: comp.issuedAt.toISOString().slice(0, 10),
        validTill: comp.validTill.toISOString().slice(0, 10),
      },
    });
    return;
  }

  if (certId.startsWith('READY-')) {
    const ready = await ReadyCertificate.findOne({ readyId: certId });
    if (!ready) throw ApiError.notFound('Certificate not found');
    const org = await Organisation.findById(ready.orgId);
    res.json({
      success: true,
      data: {
        certId: ready.readyId,
        type: 'readiness',
        organisation: org?.name ?? 'Unknown',
        status: 'valid',
        cycle: ready.cycle,
        issuedAt: ready.issuedAt.toISOString().slice(0, 10),
        // Explicit so a verifier never mistakes readiness for audited compliance.
        note: 'POSH Ready attests self-assessed readiness, not audited POSH Compliance.',
      },
    });
    return;
  }

  throw ApiError.notFound('Certificate not found');
};
