import type { RequestHandler } from 'express';
import { ApiError } from '../utils/ApiError';
import type { Role } from '../types';

// Role checks are enforced server-side only — never trust the client (PRD §2.2).
export function roleGuard(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) throw ApiError.unauthorized();
    if (!roles.includes(req.user.role)) throw ApiError.forbidden();
    next();
  };
}
