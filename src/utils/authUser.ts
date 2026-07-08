import type { Request } from 'express';
import { ApiError } from './ApiError';
import type { AuthUser } from '../types';

// Narrow req.user after requireAuth — throws instead of non-null assertions.
export function authUser(req: Request): AuthUser {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}

export function authOrgId(req: Request): string {
  const user = authUser(req);
  if (!user.orgId) throw ApiError.forbidden('No organisation on this account');
  return user.orgId;
}
