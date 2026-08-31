import { Schema, model, Types } from 'mongoose';
import type {
  QuestionType,
  IQuestionOption,
  IQuestionBlank,
  ISimulationNode,
} from '../questions/question.model';

export type AttemptStatus = 'in_progress' | 'submitted' | 'scored';

// Frozen copy of the question exactly as presented: the attempt is scored and
// reviewed against THIS, never against the live bank, so editing a question
// after (or during) an attempt can no longer change its score or make the
// answer review disagree with the recorded result (evidence integrity,
// PRD §11). The super-admin rescore endpoint deliberately re-reads the live
// bank and refreshes this snapshot.
export interface IPaperSnapshot {
  body: string;
  options?: IQuestionOption[];
  blanks?: IQuestionBlank[];
  nodes?: ISimulationNode[];
}

export interface IPaperEntry {
  questionId: Types.ObjectId;
  version: number;
  order: number;
  type: QuestionType;
  snapshot?: IPaperSnapshot; // absent only on attempts created before this field existed
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
        snapshot: { type: Schema.Types.Mixed },
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
// Cron sweep: find in_progress attempts whose timer has expired — must be fast at scale.
attemptSchema.index({ status: 1, expiresAt: 1 });

export const AssessmentAttempt = model<IAssessmentAttempt>('AssessmentAttempt', attemptSchema);
