import { Types } from 'mongoose';
import type { HydratedDocument } from 'mongoose';
import crypto from 'crypto';
import { AssessmentAttempt } from './attempt.model';
import type { IAssessmentAttempt, IPaperEntry } from './attempt.model';
import { Question } from '../questions/question.model';
import type { IQuestion, QuestionType } from '../questions/question.model';
import { User } from '../users/user.model';
import { Organisation } from '../organisations/organisation.model';
import { Certificate } from '../certificates/certificate.model';
import { issueCertificate } from '../certificates/certificate.service';
import { scoreAttempt } from '../scoring/scoring.service';
import { recomputeReadiness } from '../scoring/readiness.service';
import { ApiError } from '../../utils/ApiError';
import { currentCycle } from '../../utils/ids';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { logAudit } from '../auditlog/auditLog.model';
import { performanceLevel, scoreBand } from '../../types';

type AttemptDoc = HydratedDocument<IAssessmentAttempt>;

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j] as T, arr[i] as T];
  }
  return arr;
}

// Random draw per attempt so the post-scoring answer review can't be
// memorised into a retake (PRD §3.5). Composition is platform config.
// Questions the employee already saw in an earlier attempt this cycle are
// excluded, so with a bank sized at 3× the paper (42 MCQ / 24 FIB / 24 case)
// the three attempts of a cycle are fully disjoint. If the pool runs dry
// (e.g. an HR-approved extra attempt), the draw tops up with repeats rather
// than shrinking the paper.
// Each entry carries a full content snapshot: the attempt is presented,
// scored, and reviewed against the question EXACTLY as drawn, so later edits
// to the bank can never change a past (or in-flight) attempt.
async function assemblePaper(userId: Types.ObjectId, cycle: string): Promise<IPaperEntry[]> {
  const priorAttempts = await AssessmentAttempt.find({ userId, cycle })
    .select('paper.questionId')
    .lean();
  const seenIds: Types.ObjectId[] = [];
  const seenKeys = new Set<string>();
  for (const prior of priorAttempts) {
    for (const entry of prior.paper) {
      const key = entry.questionId.toString();
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        seenIds.push(entry.questionId);
      }
    }
  }

  const composition: Array<[QuestionType, number]> = [
    ['mcq', env.PAPER_MCQ_COUNT],
    ['fib', env.PAPER_FIB_COUNT],
    ['case_study', env.PAPER_CASE_COUNT],
    ['simulation', env.PAPER_SIM_COUNT],
  ];

  const drawn: Array<IQuestion & { _id: Types.ObjectId }> = [];
  for (const [type, count] of composition) {
    if (count === 0) continue;
    let sample = await Question.aggregate<IQuestion & { _id: Types.ObjectId }>([
      { $match: { type, isActive: true, _id: { $nin: seenIds } } },
      { $sample: { size: count } },
    ]);
    if (sample.length < count) {
      // Unseen pool exhausted for this employee — top up from the questions
      // they have seen before (never duplicating within this paper).
      const topUp = await Question.aggregate<IQuestion & { _id: Types.ObjectId }>([
        { $match: { type, isActive: true, _id: { $nin: sample.map((q) => q._id) } } },
        { $sample: { size: count - sample.length } },
      ]);
      logger.warn('Unseen question pool exhausted — topping up with repeats', {
        type,
        requested: count,
        fresh: sample.length,
        repeated: topUp.length,
      });
      sample = sample.concat(topUp);
    }
    if (sample.length < count) {
      logger.warn('Question bank smaller than paper composition', {
        type,
        requested: count,
        available: sample.length,
      });
    }
    drawn.push(...sample);
  }

  if (drawn.length === 0) {
    throw ApiError.badRequest('No active questions in the bank', 'QUESTION_BANK_EMPTY');
  }

  return shuffle(drawn).map((q, i) => ({
    questionId: q._id,
    version: q.version,
    order: i + 1,
    type: q.type,
    snapshot: {
      body: q.body,
      ...(q.options ? { options: q.options } : {}),
      ...(q.blanks ? { blanks: q.blanks } : {}),
      ...(q.nodes ? { nodes: q.nodes } : {}),
    },
  }));
}

// Client payload for an in-progress attempt: bodies and choice text only —
// no weights, no accepted answers, no impacts (PRD §11 score integrity).
export function sanitizedPaper(attempt: IAssessmentAttempt, questions: Map<string, IQuestion>) {
  return attempt.paper
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((entry) => {
      const q = questions.get(entry.questionId.toString());
      if (!q) return null;
      const base = {
        questionId: entry.questionId.toString(),
        order: entry.order,
        type: q.type,
        body: q.body,
      };
      switch (q.type) {
        case 'mcq':
        case 'case_study':
          // Option order shuffling is applied client-side per attempt seed in
          // v1; server returns canonical order so answers index consistently.
          return { ...base, options: (q.options ?? []).map((o) => o.text) };
        case 'fib':
          return { ...base, blanks: (q.blanks ?? []).length };
        case 'simulation':
          return {
            ...base,
            nodes: (q.nodes ?? []).map((n) => ({
              nodeId: n.nodeId,
              prompt: n.prompt,
              choices: n.choices.map((c) => ({
                choiceId: c.choiceId,
                text: c.text,
                nextNodeId: c.nextNodeId ?? null,
              })),
            })),
          };
        default:
          return base;
      }
    })
    .filter(Boolean);
}

// Resolves the paper's questions for presentation, scoring, and review.
// Prefers the per-entry content snapshot frozen at draw time; falls back to
// the live bank only for entries without one (attempts predating snapshots).
// `fromBank: true` deliberately re-reads the live bank instead — used by the
// super-admin rescore endpoint to apply corrected answer keys.
export async function loadPaperQuestions(
  attempt: IAssessmentAttempt,
  opts: { fromBank?: boolean } = {},
): Promise<Map<string, IQuestion>> {
  const result = new Map<string, IQuestion>();
  const missing: Types.ObjectId[] = [];

  for (const entry of attempt.paper) {
    if (!opts.fromBank && entry.snapshot) {
      result.set(entry.questionId.toString(), {
        type: entry.type,
        version: entry.version,
        body: entry.snapshot.body,
        options: entry.snapshot.options,
        blanks: entry.snapshot.blanks,
        nodes: entry.snapshot.nodes,
      } as IQuestion);
    } else {
      missing.push(entry.questionId);
    }
  }

  if (missing.length) {
    const questions = await Question.find({ _id: { $in: missing } }).lean<IQuestion & { _id: Types.ObjectId }[]>();
    for (const q of questions as unknown as Array<IQuestion & { _id: Types.ObjectId }>) {
      result.set(q._id.toString(), q);
    }
  }
  return result;
}

export async function startAttempt(userId: string): Promise<AttemptDoc> {
  const user = await User.findOne({ _id: userId, role: 'employee', isDeleted: false });
  if (!user || !user.orgId) throw ApiError.forbidden('Only enrolled employees can take assessments');

  const org = await Organisation.findOne({ _id: user.orgId, isDeleted: false });
  if (!org) throw ApiError.notFound();
  // Seats unlock on payment (PRD F2). Enforced unconditionally to ensure assessments cannot be opened without payment.
  if (!org.seatsActive) {
    throw ApiError.forbidden('Organisation seats are not active yet. Please complete payment first.');
  }

  const cycle = currentCycle();

  // One active session per employee (PRD §3.5) — sweep an expired one first.
  const active = await AssessmentAttempt.findOne({ userId: user._id, status: 'in_progress' });
  if (active) {
    if (active.expiresAt > new Date()) {
      throw ApiError.conflict('An attempt is already in progress');
    }
    await finalizeAttempt(active); // auto-submit on timeout
  }

  const used = await AssessmentAttempt.countDocuments({
    userId: user._id,
    cycle,
    status: { $in: ['submitted', 'scored'] },
  });
  if (used >= env.MAX_ATTEMPTS_PER_CYCLE) {
    if (!user.reattemptApprovedAt) {
      throw ApiError.forbidden('Attempt limit reached — ask your HR admin to approve a re-attempt');
    }
    user.reattemptApprovedAt = undefined; // consume the approval
    await user.save();
  }

  const paper = await assemblePaper(user._id, cycle);
  const now = new Date();
  return AssessmentAttempt.create({
    userId: user._id,
    orgId: user.orgId,
    cycle,
    paper,
    answers: [],
    status: 'in_progress',
    startedAt: now,
    expiresAt: new Date(now.getTime() + env.ATTEMPT_TIME_LIMIT_MIN * 60_000),
    timeLimitMin: env.ATTEMPT_TIME_LIMIT_MIN,
    attemptNo: used + 1,
  });
}

export interface SubmitResult {
  attemptId: string;
  score: number;
  state: 'certified' | 'not_certified';
  certificate: { certId: string; issuedAt: Date } | null;
  breakdown: { correct: number; incorrect: number; total: number; threshold: number };
  performanceLevel: string;
}

// Scores from stored answers + question versions only — client-sent scores
// are never trusted (PRD §10.2). Safe to call for manual submit, timeout
// auto-submit, and the stale-attempt cron sweep.
export async function finalizeAttempt(attempt: AttemptDoc): Promise<SubmitResult> {
  const questions = await loadPaperQuestions(attempt);
  const result = scoreAttempt(attempt, questions);

  attempt.status = 'scored';
  attempt.submittedAt = attempt.submittedAt ?? new Date();
  attempt.score = result.total;
  attempt.sectionScores = result.sectionScores;
  await attempt.save();

  const userId = attempt.userId.toString();
  const orgId = attempt.orgId.toString();
  const passed = result.total >= env.CERT_PASS_THRESHOLD;

  let certificate: { certId: string; issuedAt: Date } | null = null;
  if (passed) {
    const existing = await Certificate.findOne({
      userId: attempt.userId,
      cycle: attempt.cycle,
      revoked: false,
    });
    if (existing) {
      // The certificate always shows the employee's BEST passing score of the
      // cycle — a stronger re-attempt upgrades it (and its evidence trail).
      if (result.total > existing.score) {
        existing.score = result.total;
        existing.scoreBand = scoreBand(result.total);
        existing.evidenceRef = attempt._id;
        await existing.save();
        await logAudit('certificate.score_improved', 'Certificate', existing.certId, userId, {
          score: result.total,
          attemptId: attempt.id,
        });
      }
      certificate = { certId: existing.certId, issuedAt: existing.issuedAt };
    } else {
      certificate = await issueCertificate(attempt, result.total);
    }
    await User.updateOne({ _id: attempt.userId }, { $set: { retrainingFlagged: false } });
  } else {
    // State 1: re-training flag raised; re-attempt window is HR-governed.
    await User.updateOne({ _id: attempt.userId }, { $set: { retrainingFlagged: true } });
  }

  await logAudit('attempt.scored', 'AssessmentAttempt', attempt.id, userId, {
    score: result.total,
    passed,
    attemptNo: attempt.attemptNo,
  });

  // Event-driven org readiness recompute on every submission (PRD §3.2).
  await recomputeReadiness(orgId);

  return {
    attemptId: attempt.id,
    score: result.total,
    state: passed ? 'certified' : 'not_certified',
    certificate,
    breakdown: {
      correct: result.correct,
      incorrect: result.incorrect,
      total: result.totalQuestions,
      threshold: env.CERT_PASS_THRESHOLD,
    },
    performanceLevel: performanceLevel(result.total),
  };
}
