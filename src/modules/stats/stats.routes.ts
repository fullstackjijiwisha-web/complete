import { Router } from 'express';
import type { RequestHandler } from 'express';
import { getPublicStats } from './stats.service';
import { publicVerify } from '../certificates/certificate.controller';
import { SponsoredInvite } from '../organisations/sponsoredInvite.model';

const stats: RequestHandler = async (_req, res) => {
  res.json({ success: true, data: await getPublicStats() });
};

// Lets the registration form confirm a sponsored link before the organisation
// fills the whole form. Deliberately minimal: whether it is usable and the
// label it was minted under — never who else has used it.
const checkSponsoredInvite: RequestHandler = async (req, res) => {
  const code = String(req.params.code ?? '').trim().toUpperCase();
  const invite = await SponsoredInvite.findOne({ code }).select('label maxUses uses expiresAt revoked');
  const usable = Boolean(
    invite &&
      !invite.revoked &&
      invite.uses < invite.maxUses &&
      (!invite.expiresAt || invite.expiresAt.getTime() > Date.now()),
  );
  res.json({
    success: true,
    data: usable && invite ? { valid: true, label: invite.label } : { valid: false },
  });
};

// Mounted under /public with the public rate-limit tier — no auth.
export const publicRoutes = Router();
publicRoutes.get('/stats', stats);
publicRoutes.get('/verify/:certId', publicVerify);
publicRoutes.get('/org-invite/:code', checkSponsoredInvite);
