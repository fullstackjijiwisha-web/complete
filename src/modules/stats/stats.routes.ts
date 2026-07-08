import { Router } from 'express';
import type { RequestHandler } from 'express';
import { getPublicStats } from './stats.service';
import { publicVerify } from '../certificates/certificate.controller';

const stats: RequestHandler = async (_req, res) => {
  res.json({ success: true, data: await getPublicStats() });
};

// Mounted under /public with the public rate-limit tier — no auth.
export const publicRoutes = Router();
publicRoutes.get('/stats', stats);
publicRoutes.get('/verify/:certId', publicVerify);
