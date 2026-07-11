import { Schema, model, Types } from 'mongoose';
import type { Role } from '../../types';

export type UserStatus = 'invited' | 'active';

export interface IUser {
  email: string;
  passwordHash?: string;
  role: Role;
  orgId?: Types.ObjectId;
  employeeCode?: string;
  name: string;
  mobile?: string;
  whatsapp?: string;
  refreshTokenHash?: string;
  failedLogins: number;
  lockedUntil?: Date;
  status: UserStatus;
  consent?: { acceptedAt: Date; version: string };
  // Set by HR approve-reattempt once MAX_ATTEMPTS_PER_CYCLE is exhausted;
  // consumed (cleared) when the next attempt starts.
  reattemptApprovedAt?: Date;
  retrainingFlagged: boolean;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String },
    role: {
      type: String,
      required: true,
      enum: ['employee', 'hr_admin', 'auditor', 'super_admin'],
    },
    orgId: { type: Schema.Types.ObjectId, ref: 'Organisation', index: true },
    employeeCode: { type: String },
    name: { type: String, required: true, trim: true },
    mobile: { type: String, trim: true },
    whatsapp: { type: String, trim: true },
    refreshTokenHash: { type: String },
    failedLogins: { type: Number, default: 0 },
    lockedUntil: { type: Date },
    status: { type: String, enum: ['invited', 'active'], default: 'invited' },
    consent: { acceptedAt: Date, version: String },
    reattemptApprovedAt: { type: Date },
    retrainingFlagged: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

userSchema.index({ orgId: 1, role: 1, isDeleted: 1 });

export const User = model<IUser>('User', userSchema);
