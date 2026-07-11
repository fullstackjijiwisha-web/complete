import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { User } from '../users/user.model';
import type { IUser } from '../users/user.model';
import { Organisation } from '../organisations/organisation.model';
import type { IOrganisation, CompanySize } from '../organisations/organisation.model';
import { Invite } from './invite.model';
import { ApiError } from '../../utils/ApiError';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../utils/jwt';
import { sha256Hex } from '../../utils/tokenCompare';
import { newOrgCode } from '../../utils/ids';
import { logAudit } from '../auditlog/auditLog.model';
import { logger } from '../../utils/logger';
import type { HydratedDocument } from 'mongoose';

const BCRYPT_COST = 12;
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;
const CONSENT_VERSION = '2026-07-v1';

type UserDoc = HydratedDocument<IUser>;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export async function issueTokens(user: UserDoc): Promise<TokenPair> {
  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    orgId: user.orgId?.toString(),
  });
  const refreshToken = signRefreshToken({ sub: user.id, jti: crypto.randomUUID() });
  // Rotation: exactly one valid refresh token per user; hash it like a password.
  user.refreshTokenHash = await bcrypt.hash(refreshToken, BCRYPT_COST);
  await user.save();
  return { accessToken, refreshToken };
}

export async function registerOrg(input: {
  orgName: string;
  registrationNo?: string;
  industry?: string;
  companySize?: CompanySize;
  gst?: string;
  billingContact?: { name?: string; email?: string };
  headcount: number;
  adminName: string;
  email: string;
  adminMobile?: string;
  adminWhatsapp?: string;
  password: string;
}): Promise<{ user: UserDoc; orgCode: string; tokens: TokenPair }> {
  const existing = await User.findOne({ email: input.email.toLowerCase() });
  if (existing) throw ApiError.conflict('An account with this email already exists');

  // Random org codes collide rarely; retry a few times before giving up.
  let org: HydratedDocument<IOrganisation> | null = null;

  for (let i = 0; i < 5 && !org; i++) {
    try {
      org = await Organisation.create({
        name: input.orgName,
        orgCode: newOrgCode(new Date().getFullYear()),
        registrationNo: input.registrationNo,
        industry: input.industry,
        companySize: input.companySize,
        gst: input.gst,
        billingContact: input.billingContact,
        headcount: input.headcount,
      });
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err;
    }
  }
  if (!org) throw new Error('Could not allocate a unique org code');

  const user = await User.create({
    email: input.email,
    passwordHash: await bcrypt.hash(input.password, BCRYPT_COST),
    role: 'hr_admin',
    orgId: org._id,
    name: input.adminName,
    mobile: input.adminMobile,
    whatsapp: input.adminWhatsapp,
    status: 'active',
  });

  await logAudit('org.registered', 'Organisation', org.id, user.id, { orgCode: org.orgCode });
  const tokens = await issueTokens(user);
  return { user, orgCode: org.orgCode, tokens };
}

export async function login(email: string, password: string): Promise<{ user: UserDoc; tokens: TokenPair }> {
  const user = await User.findOne({ email: email.toLowerCase(), isDeleted: false });
  const invalid = ApiError.unauthorized('Invalid email or password', 'UNAUTHORIZED');

  if (!user || !user.passwordHash) {
    // Burn a hash comparison anyway so response timing doesn't reveal
    // whether the email exists.
    await bcrypt.compare(password, '$2a$12$C6UzMDM.H6dfI/f/IKcEeO7dGK1Kb8uT0S2QeUQpS9nZBhVWkeH3W');
    throw invalid;
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw ApiError.unauthorized('Account temporarily locked. Try again later.', 'ACCOUNT_LOCKED');
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    user.failedLogins += 1;
    if (user.failedLogins >= MAX_FAILED_LOGINS) {
      user.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60_000);
      user.failedLogins = 0;
      logger.warn('Account locked after failed logins', { userId: user.id });
    }
    await user.save();
    throw invalid;
  }

  user.failedLogins = 0;
  user.lockedUntil = undefined;
  const tokens = await issueTokens(user);
  return { user, tokens };
}

export async function rotateRefreshToken(presentedToken: string): Promise<{ user: UserDoc; tokens: TokenPair }> {
  const invalid = ApiError.unauthorized('Refresh token invalid', 'REFRESH_TOKEN_INVALID');

  let payload;
  try {
    payload = verifyRefreshToken(presentedToken);
  } catch {
    throw invalid;
  }

  const user = await User.findById(payload.sub);
  if (!user || user.isDeleted) throw invalid;
  if (!user.refreshTokenHash) throw invalid;

  const matches = await bcrypt.compare(presentedToken, user.refreshTokenHash);
  if (!matches) {
    // A syntactically valid token for this user that doesn't match the stored
    // hash means an old (rotated) token was replayed — breach signal.
    // Revoke the whole session (blueprint §6).
    user.refreshTokenHash = undefined;
    await user.save();
    await logAudit('auth.refresh_reuse_detected', 'User', user.id, user.id);
    logger.warn('Refresh token reuse detected — sessions revoked', { userId: user.id });
    throw invalid;
  }

  const tokens = await issueTokens(user);
  return { user, tokens };
}

export async function logout(userId: string): Promise<void> {
  await User.updateOne({ _id: userId }, { $unset: { refreshTokenHash: 1 } });
}

export async function acceptInvite(input: {
  token: string;
  password: string;
}): Promise<{ user: UserDoc; tokens: TokenPair }> {
  // Generic error — never confirm whether an invite/email exists (blueprint §6).
  const invalid = ApiError.badRequest('Invite link is invalid or has expired', 'INVALID_REQUEST');

  const invite = await Invite.findOne({
    tokenHash: sha256Hex(input.token),
    expiresAt: { $gt: new Date() },
  });
  if (!invite) throw invalid;

  const user = await User.findById(invite.userId);
  if (!user || user.isDeleted) throw invalid;

  user.passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  user.status = 'active';
  user.consent = { acceptedAt: new Date(), version: CONSENT_VERSION };
  await user.save();
  await Invite.deleteOne({ _id: invite._id });
  await logAudit('user.invite_accepted', 'User', user.id, user.id, {
    consentVersion: CONSENT_VERSION,
  });

  const tokens = await issueTokens(user);
  return { user, tokens };
}
