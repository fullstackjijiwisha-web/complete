import { Schema, model, Types } from 'mongoose';

// Post-assessment experience feedback — collected right after an attempt is
// scored, before the result screen. One entry per attempt (upsert), reviewed
// by Jijiwisha in the Super Admin panel. Employee identity is stored for
// dedupe/audit only and never surfaced in the admin listing (the form
// promises confidentiality).
export interface IFeedbackRatings {
  overall: number; // 1-5 stars
  content: number; // 1-5 stars
  caseScenarios: number; // 1-5 stars
  application: number; // 1-5 confidence faces
  recommendation: number; // 0-10 NPS
}

export interface IFeedback {
  userId: Types.ObjectId;
  orgId: Types.ObjectId;
  attemptId: Types.ObjectId;
  cycle: string;
  ratings: IFeedbackRatings;
  suggestions: string[]; // stable keys, see SUGGESTION_KEYS
  suggestionOther?: string;
  comments?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const SUGGESTION_KEYS = [
  'more_case_scenarios',
  'more_practice_questions',
  'better_explanations',
  'shorter_assessment',
  'industry_examples',
  'other',
] as const;

const feedbackSchema = new Schema<IFeedback>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    orgId: { type: Schema.Types.ObjectId, ref: 'Organisation', required: true },
    attemptId: { type: Schema.Types.ObjectId, ref: 'AssessmentAttempt', required: true, unique: true },
    cycle: { type: String, required: true },
    ratings: {
      overall: { type: Number, required: true, min: 1, max: 5 },
      content: { type: Number, required: true, min: 1, max: 5 },
      caseScenarios: { type: Number, required: true, min: 1, max: 5 },
      application: { type: Number, required: true, min: 1, max: 5 },
      recommendation: { type: Number, required: true, min: 0, max: 10 },
    },
    suggestions: { type: [String], default: [] },
    suggestionOther: { type: String, maxlength: 200 },
    comments: { type: String, maxlength: 500 },
  },
  { timestamps: true },
);

feedbackSchema.index({ createdAt: -1 });
feedbackSchema.index({ orgId: 1, cycle: 1 });

export const Feedback = model<IFeedback>('Feedback', feedbackSchema);
