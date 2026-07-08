import type { RequestHandler } from 'express';
import { User } from './user.model';
import { Certificate } from '../certificates/certificate.model';
import { AssessmentAttempt } from '../assessments/attempt.model';
import { Organisation } from '../organisations/organisation.model';
import { ApiError } from '../../utils/ApiError';
import { authUser } from '../../utils/authUser';
import { logAudit } from '../auditlog/auditLog.model';
import { Types } from 'mongoose';

export const getMe: RequestHandler = async (req, res) => {
  const { id } = authUser(req);
  const user = await User.findOne({ _id: id, isDeleted: false });
  if (!user) throw ApiError.notFound();
  const org = user.orgId ? await Organisation.findById(user.orgId) : null;
  res.json({
    success: true,
    data: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      employeeCode: user.employeeCode,
      org: org ? { id: org.id, name: org.name, orgCode: org.orgCode, seatsActive: org.seatsActive } : null,
    },
  });
};

export const patchMe: RequestHandler = async (req, res) => {
  const { id } = authUser(req);
  const user = await User.findOneAndUpdate(
    { _id: id, isDeleted: false },
    { $set: { name: req.body.name } },
    { new: true },
  );
  if (!user) throw ApiError.notFound();
  res.json({ success: true, data: { id: user.id, name: user.name, email: user.email } });
};

// DPDP data portability: everything the platform holds about this person.
export const exportMe: RequestHandler = async (req, res) => {
  const { id } = authUser(req);
  const userId = new Types.ObjectId(id);
  const [user, attempts, certificates] = await Promise.all([
    User.findOne({ _id: userId, isDeleted: false }).lean(),
    AssessmentAttempt.find({ userId }).lean(),
    Certificate.find({ userId }).lean(),
  ]);
  if (!user) throw ApiError.notFound();
  const { passwordHash: _p, refreshTokenHash: _r, ...profile } = user;
  await logAudit('user.data_export', 'User', id, id);
  res.json({ success: true, data: { profile, attempts, certificates } });
};

// DPDP erasure: anonymise the person; org-level aggregates and certificate
// validity records are retained under the legal-obligation basis (PRD §11).
export const deleteMe: RequestHandler = async (req, res) => {
  const { id } = authUser(req);
  const user = await User.findOne({ _id: id, isDeleted: false });
  if (!user) throw ApiError.notFound();

  user.name = 'Erased User';
  user.email = `erased-${user.id}@erased.invalid`;
  user.passwordHash = undefined;
  user.refreshTokenHash = undefined;
  user.isDeleted = true;
  user.deletedAt = new Date();
  await user.save();
  await logAudit('user.erasure', 'User', id, id);
  res.json({ success: true, data: { erased: true } });
};
