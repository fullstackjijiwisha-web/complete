import { Schema, model } from 'mongoose';

/**
 * Remembers what the AI grader decided about one (question, blank, answer key,
 * learner answer) combination.
 *
 * Two reasons this exists, and the second matters more than the cost saving:
 *   1. Money and latency — one misspelling shared by a hundred learners costs
 *      a single API call ever, not a hundred.
 *   2. Fairness — every learner who writes the same thing gets the same
 *      verdict, instead of two people being graded differently because a model
 *      was sampled twice.
 *
 * The _id IS the hash of those four inputs (see cacheKey in
 * aiGrader.service.ts), so changing a question's accepted answers changes the
 * key and retires the old verdicts rather than reusing decisions that were made
 * against a different answer key.
 */
export interface IAiVerdict {
  _id: string;
  correct: boolean;
  reason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const aiVerdictSchema = new Schema<IAiVerdict>(
  {
    _id: { type: String, required: true },
    correct: { type: Boolean, required: true },
    reason: { type: String },
  },
  { timestamps: true, _id: false },
);

export const AiVerdict = model<IAiVerdict>('AiVerdict', aiVerdictSchema);
