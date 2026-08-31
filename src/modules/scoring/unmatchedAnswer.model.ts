import { Schema, model, Types } from 'mongoose';

/**
 * A fill-in-the-blank answer the answer key rejected, grouped by what the
 * learner actually wrote.
 *
 * This is the manual alternative to guessing spellings in advance: instead of
 * trying to imagine every way a word can be written, the system records what
 * people really type and asks an administrator once. Accepting an entry writes
 * it into the question's accepted answers, so it is matched for free from then
 * on and never appears in this queue again.
 *
 * The _id is a hash of (question, blank, canonical form), so the same wording
 * from a hundred learners is ONE row with a count of 100 — the queue stays
 * short and the most common misspellings sort to the top.
 */
export interface IUnmatchedAnswer {
  _id: string;
  questionId: Types.ObjectId;
  blankIndex: number;
  // Canonical form (what the matcher compared) — the grouping key.
  canonical: string;
  // Raw spellings seen, capped: what an admin reads before deciding.
  samples: string[];
  count: number;
  status: 'pending' | 'accepted' | 'rejected';
  decidedBy?: Types.ObjectId;
  decidedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const unmatchedAnswerSchema = new Schema<IUnmatchedAnswer>(
  {
    _id: { type: String, required: true },
    questionId: { type: Schema.Types.ObjectId, ref: 'Question', required: true },
    blankIndex: { type: Number, required: true },
    canonical: { type: String, required: true },
    samples: { type: [String], default: [] },
    count: { type: Number, default: 0 },
    // Rejected entries stay recorded so the same wrong answer does not come
    // back to be judged again every cycle.
    status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
    decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    decidedAt: { type: Date },
  },
  { timestamps: true, _id: false },
);

// The queue is read as "pending, most common first".
unmatchedAnswerSchema.index({ status: 1, count: -1 });

export const UnmatchedAnswer = model<IUnmatchedAnswer>('UnmatchedAnswer', unmatchedAnswerSchema);
