import { Types } from 'mongoose';
import { Question } from '../questions/question.model';
import { UnmatchedAnswer, type IUnmatchedAnswer } from './unmatchedAnswer.model';
import { canonicalAnswer } from './scoring.service';
import {
  rescoreAttemptsForQuestion,
  countAttemptsMatchedBy,
} from '../assessments/assessment.service';
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

export interface AnswerKeyBlank {
  blankIndex: number;
  // Every spelling that counts as correct, with where it came from.
  accepted: Array<{ text: string; fromLearner: boolean }>;
  pending: number;
}

export interface AnswerKeyRow {
  questionId: string;
  question: string;
  actReference?: string;
  isActive: boolean;
  blanks: AnswerKeyBlank[];
}

/**
 * The answer key for every fill-in-the-blank question: what counts as correct,
 * blank by blank.
 *
 * The list is only the spellings written down. It is not the whole story of
 * what gets marked correct — capitals, spacing, hyphens, extra words, numbers
 * in any notation, Indian romanisation and single-letter typos are all matched
 * by rule against these, and never need to be listed here.
 */
export async function listAnswerKeys(includeInactive: boolean): Promise<AnswerKeyRow[]> {
  const questions = await Question.find({
    type: 'fib',
    ...(includeInactive ? {} : { isActive: true }),
  })
    .select('body blanks isActive actReference')
    .sort({ createdAt: 1 })
    .lean();

  // Which spellings arrived through the review queue, and what is still waiting.
  const decisions = await UnmatchedAnswer.find({
    questionId: { $in: questions.map((q) => q._id) },
  })
    .select('questionId blankIndex canonical status')
    .lean();

  const fromLearner = new Set<string>();
  const pendingCount = new Map<string, number>();
  for (const d of decisions) {
    const slot = `${d.questionId.toString()}:${d.blankIndex}`;
    if (d.status === 'accepted') fromLearner.add(`${slot}:${d.canonical}`);
    if (d.status === 'pending') pendingCount.set(slot, (pendingCount.get(slot) ?? 0) + 1);
  }

  return questions.map((q) => ({
    questionId: q._id.toString(),
    question: q.body,
    actReference: q.actReference,
    isActive: q.isActive,
    blanks: (q.blanks ?? []).map((blank, blankIndex) => {
      const slot = `${q._id.toString()}:${blankIndex}`;
      return {
        blankIndex,
        accepted: blank.acceptedAnswers.map((text) => ({
          text,
          fromLearner: fromLearner.has(`${slot}:${canonicalAnswer(text)}`),
        })),
        pending: pendingCount.get(slot) ?? 0,
      };
    }),
  }));
}

/**
 * Adds a spelling to a blank by hand, without waiting for someone to type it.
 *
 * Like accepting from the queue, this re-marks the attempts it had already cost
 * marks in, so the answer key and the scores never disagree.
 */
export async function addAcceptedAnswer(
  questionId: string,
  blankIndex: number,
  spelling: string,
  adminId: string,
): Promise<{ added: boolean; attemptsRescored: number; certificatesIssued: number }> {
  const question = await Question.findById(questionId);
  const blank = question?.blanks?.[blankIndex];
  if (!question || question.type !== 'fib' || !blank) {
    throw ApiError.notFound('No such blank on that question');
  }

  const text = spelling.trim();
  const canonical = canonicalAnswer(text);
  if (!canonical) throw ApiError.badRequest('That is empty once punctuation is ignored');

  if (blank.acceptedAnswers.some((a) => canonicalAnswer(a) === canonical)) {
    // Already matched — by an existing spelling, or by the rules around it.
    return { added: false, attemptsRescored: 0, certificatesIssued: 0 };
  }

  blank.acceptedAnswers.push(text);
  question.markModified('blanks');
  await question.save();

  // Any queue entries for this wording are now settled.
  await UnmatchedAnswer.updateMany(
    { questionId: question._id, blankIndex, canonical, status: 'pending' },
    { $set: { status: 'accepted', decidedBy: new Types.ObjectId(adminId), decidedAt: new Date() } },
  );

  const rescored = await rescoreAttemptsForQuestion(question._id, blankIndex, canonical);
  await logAudit('grading.answer_added', 'Question', question.id, adminId, {
    blankIndex,
    spelling: text,
    ...rescored,
  });
  return { added: true, ...rescored };
}

/**
 * Removes a spelling from a blank — for a mistaken entry, not for tightening
 * marking after the fact.
 *
 * Refused whenever a scored attempt was actually marked correct by it. Removing
 * it would leave that attempt's stored score disagreeing with what its review
 * screen shows, and taking a mark back from someone already told they passed is
 * not something to do quietly.
 */
export async function removeAcceptedAnswer(
  questionId: string,
  blankIndex: number,
  spelling: string,
  adminId: string,
): Promise<{ removed: true }> {
  const question = await Question.findById(questionId);
  const blank = question?.blanks?.[blankIndex];
  if (!question || !blank) throw ApiError.notFound('No such blank on that question');
  if (blank.acceptedAnswers.length <= 1) {
    throw ApiError.badRequest('A blank must keep at least one accepted answer', 'LAST_ANSWER');
  }

  const canonical = canonicalAnswer(spelling);
  const index = blank.acceptedAnswers.findIndex((a) => canonicalAnswer(a) === canonical);
  if (index < 0) throw ApiError.notFound('That spelling is not in the answer key');

  const relying = await countAttemptsMatchedBy(question._id, blankIndex, canonical);
  if (relying > 0) {
    throw ApiError.badRequest(
      `${relying} scored attempt(s) were marked correct by this spelling. Removing it would ` +
        'contradict scores already issued, so it has been left in place.',
      'IN_USE',
    );
  }

  blank.acceptedAnswers.splice(index, 1);
  question.markModified('blanks');
  await question.save();
  await logAudit('grading.answer_removed', 'Question', question.id, adminId, {
    blankIndex,
    spelling,
  });
  return { removed: true };
}
