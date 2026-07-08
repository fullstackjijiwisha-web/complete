import { Schema, model, Types } from 'mongoose';
import type { QuestionType } from '../questions/question.model';

export type AttemptStatus = 'in_progress' | 'submitted' | 'scored';

export interface IPaperEntry {
  questionId: Types.ObjectId;
  version: number;
  order: number;
  type: QuestionType;
}

export interface IAnswer {
  questionId: Types.ObjectId;
  // mcq/case_study: option index (number) · fib: string[] per blank ·
  // simulation: [{ nodeId, choiceId }] decision path
  response: unknown;
  savedAt: Date;
}

export interface IAssessmentAttempt {
  userId: Types.ObjectId;
  orgId: Types.ObjectId;
  cycle: string;
  paper: IPaperEntry[];
  answers: IAnswer[];
  status: AttemptStatus;
  startedAt: Date;
  expiresAt: Date; // server-authoritative timer (PRD §12)
  submittedAt?: Date;
  timeLimitMin: number;
  score?: number;
  sectionScores?: Record<string, number>;
  attemptNo: number;
  createdAt: Date;
  updatedAt: Date;
}

const attemptSchema = new Schema<IAssessmentAttempt>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    orgId: { type: Schema.Types.ObjectId, ref: 'Organisation', required: true },
    cycle: { type: String, required: true },
    paper: [
      {
        questionId: { type: Schema.Types.ObjectId, ref: 'Question', required: true },
        version: { type: Number, required: true },
        order: { type: Number, required: true },
        type: { type: String, required: true },
      },
    ],
    answers: [
      {
        questionId: { type: Schema.Types.ObjectId, required: true },
        response: { type: Schema.Types.Mixed },
        savedAt: { type: Date, required: true },
      },
    ],
    status: { type: String, enum: ['in_progress', 'submitted', 'scored'], default: 'in_progress' },
    startedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    submittedAt: { type: Date },
    timeLimitMin: { type: Number, required: true },
    score: { type: Number },
    sectionScores: { type: Schema.Types.Mixed },
    attemptNo: { type: Number, required: true },
  },
  { timestamps: true },
);

attemptSchema.index({ userId: 1, cycle: 1, status: 1 });
attemptSchema.index({ orgId: 1, cycle: 1, submittedAt: 1 });

export const AssessmentAttempt = model<IAssessmentAttempt>('AssessmentAttempt', attemptSchema);
