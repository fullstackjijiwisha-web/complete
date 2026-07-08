import type { Request, RequestHandler, Response } from 'express';
import * as authService from './auth.service';
import { env } from '../../config/env';
import { refreshTtlSec } from '../../utils/jwt';
import { ApiError } from '../../utils/ApiError';
import { authUser } from '../../utils/authUser';
import type { IUser } from '../users/user.model';

const REFRESH_COOKIE = 'refreshToken';

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/v1/auth', // only ever sent to auth endpoints
    maxAge: refreshTtlSec * 1000,
  });
}

function publicUser(user: IUser & { id?: string }, id: string) {
  return {
    id,
    email: user.email,
    name: user.name,
    role: user.role,
    orgId: user.orgId?.toString(),
    employeeCode: user.employeeCode,
  };
}

export const registerOrg: RequestHandler = async (req, res) => {
  const { user, orgCode, tokens } = await authService.registerOrg(req.body);
  setRefreshCookie(res, tokens.refreshToken);
  res.status(201).json({
    success: true,
    data: { user: publicUser(user, user.id), orgCode, accessToken: tokens.accessToken },
  });
};

export const login: RequestHandler = async (req, res) => {
  const { user, tokens } = await authService.login(req.body.email, req.body.password);
  setRefreshCookie(res, tokens.refreshToken);
  res.json({
    success: true,
    data: { user: publicUser(user, user.id), accessToken: tokens.accessToken },
  });
};

export const refresh: RequestHandler = async (req: Request, res) => {
  const presented = (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE];
  if (!presented) throw ApiError.unauthorized('Refresh token invalid', 'REFRESH_TOKEN_INVALID');
  const { tokens } = await authService.rotateRefreshToken(presented);
  setRefreshCookie(res, tokens.refreshToken);
  res.json({ success: true, data: { accessToken: tokens.accessToken } });
};

export const logout: RequestHandler = async (req, res) => {
  await authService.logout(authUser(req).id);
  res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
  res.json({ success: true, data: { loggedOut: true } });
};

export const acceptInvite: RequestHandler = async (req, res) => {
  const { user, tokens } = await authService.acceptInvite(req.body);
  setRefreshCookie(res, tokens.refreshToken);
  res.json({
    success: true,
    data: { user: publicUser(user, user.id), accessToken: tokens.accessToken },
  });
};
