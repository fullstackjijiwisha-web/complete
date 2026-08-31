import { Types } from 'mongoose';
import { Question } from '../questions/question.model';
import { UnmatchedAnswer, type IUnmatchedAnswer } from './unmatchedAnswer.model';
import { canonicalAnswer } from './scoring.service';
import { rescoreAttemptsForQuestion } from '../assessments/assessment.service';
import { ApiError } from '../../utils/ApiError';
import { logAudit } from '../auditlog/auditLog.model';

export interface QueueRow {
  id: string;
  questionId: string;
  question: string;
  blankIndex: number;
  expected: string[];
  samples: string[];
  count: number;
  status: string;
  decidedAt?: Date;
}

/**
 * The review queue: every fill-in-the-blank answer the rules could not match,
 * grouped by wording and sorted with the most common first.
 *
 * One decision per row clears it for everyone who wrote the same thing —
 * including, on accept, the learners already marked wrong for it.
 */
export async function listUnmatched(
  status: IUnmatchedAnswer['status'] | 'all',
  limit: number,
): Promise<QueueRow[]> {
  const rows = await UnmatchedAnswer.find(status === 'all' ? {} : { status })
    .sort({ count: -1, updatedAt: -1 })
    .limit(limit)
    .lean();

  const questions = await Question.find({
    _id: { $in: rows.map((r) => r.questionId) },
  })
    .select('body blanks')
    .lean();
  const byId = new Map(questions.map((q) => [q._id.toString(), q]));

  return rows.map((row) => {
    const question = byId.get(row.questionId.toString());
    return {
      id: row._id,
      questionId: row.questionId.toString(),
      question: question?.body ?? '(question deleted)',
      blankIndex: row.blankIndex,
      expected: question?.blanks?.[row.blankIndex]?.acceptedAnswers ?? [],
      samples: row.samples,
      count: row.count,
      status: row.status,
      decidedAt: row.decidedAt,
    };
  });
}

export interface DecisionResult {
  status: 'accepted' | 'rejected';
  spelling?: string;
  attemptsRescored?: number;
  certificatesIssued?: number;
}

/**
 * Accept or reject one wording.
 *
 * Accepting appends the spelling to the question's accepted answers — appended,
 * never prepended, so the answer shown in review stays the canonical one — and
 * then re-marks the attempts that were graded wrong because of it. Rejecting
 * records the decision so the same wrong answer is not put up for judgment
 * again next cycle.
 */
export async function decideUnmatched(
  id: string,
  accept: boolean,
  adminId: string,
): Promise<DecisionResult> {
  const row = await UnmatchedAnswer.findById(id);
  if (!row) throw ApiError.notFound('Queue entry not found');
  if (row.status !== 'pending') {
    throw ApiError.badRequest(`This entry was already ${row.status}`, 'ALREADY_DECIDED');
  }

  if (!accept) {
    row.status = 'rejected';
    row.decidedBy = new Types.ObjectId(adminId);
    row.decidedAt = new Date();
    await row.save();
    await logAudit('grading.variant_rejected', 'UnmatchedAnswer', id, adminId, {
      canonical: row.canonical,
    });
    return { status: 'rejected' };
  }

  const question = await Question.findById(row.questionId);
  const blank = question?.blanks?.[row.blankIndex];
  if (!question || !blank) throw ApiError.notFound('The question or blank no longer exists');

  // Any sample in the group works — they all reduce to the same canonical form,
  // which is what the matcher compares.
  const spelling = (row.samples[0] ?? row.canonical).trim();
  if (!blank.acceptedAnswers.some((a) => canonicalAnswer(a) === row.canonical)) {
    blank.acceptedAnswers.push(spelling);
    question.markModified('blanks');
    await question.save();
  }

  row.status = 'accepted';
  row.decidedBy = new Types.ObjectId(adminId);
  row.decidedAt = new Date();
  await row.save();

  const rescored = await rescoreAttemptsForQuestion(row.questionId, row.blankIndex, row.canonical);

  await logAudit('grading.variant_accepted', 'UnmatchedAnswer', id, adminId, {
    questionId: row.questionId.toString(),
    spelling,
    ...rescored,
  });
  return { status: 'accepted', spelling, ...rescored };
}
