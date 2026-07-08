import { Types } from 'mongoose';
import { User } from '../users/user.model';
import { Organisation } from '../organisations/organisation.model';
import { Invite } from '../auth/invite.model';
import { ApiError } from '../../utils/ApiError';
import { employeeCode, newInviteToken } from '../../utils/ids';
import { sha256Hex } from '../../utils/tokenCompare';
import { sendEmail } from '../../services/email.service';
import { sendWhatsApp } from '../../services/whatsapp.service';
import { env } from '../../config/env';

const INVITE_TTL_DAYS = 7;

export async function createEmployee(
  orgId: string,
  input: { name: string; email: string; whatsapp?: string },
): Promise<{ userId: string; employeeCode: string }> {
  const existing = await User.findOne({ email: input.email.toLowerCase() });
  if (existing) throw ApiError.conflict(`An account with email ${input.email} already exists`);

  // Atomic per-org sequence for EMP-nnnn codes.
  const org = await Organisation.findOneAndUpdate(
    { _id: orgId, isDeleted: false },
    { $inc: { employeeSeq: 1 } },
    { new: true },
  );
  if (!org) throw ApiError.notFound();

  const code = employeeCode(org.employeeSeq);
  const user = await User.create({
    email: input.email,
    name: input.name,
    whatsapp: input.whatsapp,
    role: 'employee',
    orgId: new Types.ObjectId(orgId),
    employeeCode: code,
    status: 'invited',
  });

  await issueInvite(user.id, orgId, input.email, org.name, input.whatsapp);
  return { userId: user.id, employeeCode: code };
}

export async function issueInvite(
  userId: string,
  orgId: string,
  email: string,
  orgName: string,
  whatsapp?: string,
): Promise<void> {
  const rawToken = newInviteToken();
  await Invite.deleteMany({ userId: new Types.ObjectId(userId) });
  await Invite.create({
    email,
    orgId: new Types.ObjectId(orgId),
    userId: new Types.ObjectId(userId),
    tokenHash: sha256Hex(rawToken),
    expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
  });

  const link = `${env.CLIENT_URL}/invite/accept?token=${rawToken}`;
  await sendEmail({
    to: email,
    subject: `You're invited to the POSH assessment — ${orgName}`,
    text:
      `${orgName} has enrolled you on POSH Compass for the annual POSH assessment.\n\n` +
      `Set your password and get started: ${link}\n\n` +
      `This link expires in ${INVITE_TTL_DAYS} days.`,
  });

  if (whatsapp) {
    await sendWhatsApp({
      to: whatsapp,
      body:
        `${orgName} has enrolled you on POSH Compass for the annual POSH assessment. ` +
        `Set your password and begin here: ${link} (link expires in ${INVITE_TTL_DAYS} days).`,
    });
  }
}
