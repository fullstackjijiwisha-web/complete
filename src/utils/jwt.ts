import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import type { Role } from '../types';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  orgId?: string;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
}

function ttlToSeconds(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) throw new Error(`Invalid token TTL: ${ttl}`);
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 } as const;
  return Number(match[1]) * multipliers[match[2] as keyof typeof multipliers];
}

export const accessTtlSec = ttlToSeconds(env.JWT_ACCESS_EXPIRES_IN);
export const refreshTtlSec = ttlToSeconds(env.JWT_REFRESH_EXPIRES_IN);

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: accessTtlSec });
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: refreshTtlSec });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
}
