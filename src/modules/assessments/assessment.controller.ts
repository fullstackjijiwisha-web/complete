import type { RequestHandler } from 'express';
import { Types } from 'mongoose';
import { AssessmentAttempt } from './attempt.model';
import { startAttempt, finalizeAttempt, sanitizedPaper, loadPaperQuestions } from './assessment.service';
import { scoreQuestion } from '../scoring/scoring.service';
import { ApiError } from '../../utils/ApiError';
import { authUser } from '../../utils/authUser';
import { assertOwnership } from '../../utils/ownershipCheck';
import { env } from '../../config/env';
import { currentCycle } from '../../utils/ids';

export const start: RequestHandler = async (req, res) => {
  const attempt = await startAttempt(authUser(req).id);
  const questions = await loadPaperQuestions(attempt);
  res.status(201).json({
    success: true,
    data: {
      attemptId: attempt.id,
      attemptNo: attempt.attemptNo,
      cycle: attempt.cycle,
      timeLimitMin: attempt.timeLimitMin,
      expiresAt: attempt.expiresAt,
      paper: sanitizedPaper(attempt, questions),
    },
  });
};

// Own scored attempts — powers the employee dashboard (history, trend, best).
export const history: RequestHandler = async (req, res) => {
  const attempts = await AssessmentAttempt.find({
    userId: new Types.ObjectId(authUser(req).id),
    status: 'scored',
  })
    .sort({ submittedAt: 1 })
    .select('attemptNo cycle score submittedAt');
  res.json({
    success: true,
    data: {
      threshold: env.CERT_PASS_THRESHOLD,
      maxAttemptsPerCycle: env.MAX_ATTEMPTS_PER_CYCLE,
      cycle: currentCycle(),
      // Refresher-training link shown to employees below the threshold (Step 4).
      // null until Jijiwisha supplies TRAINING_URL — the CTA degrades gracefully.
      trainingUrl: env.TRAINING_URL ?? null,
      attempts: attempts.map((a) => ({
        attemptId: a.id,
        attemptNo: a.attemptNo,
        cycle: a.cycle,
        score: a.score ?? 0,
        passed: (a.score ?? 0) >= env.CERT_PASS_THRESHOLD,
        submittedAt: a.submittedAt,
      })),
    },
  });
};

export const getCurrent: RequestHandler = async (req, res) => {
  const attempt = await AssessmentAttempt.findOne({
    userId: new Types.ObjectId(authUser(req).id),
    status: 'in_progress',
  });
  if (!attempt) throw ApiError.notFound('No attempt in progress');

  if (attempt.expiresAt <= new Date()) {
    // Server-authoritative timer: expired attempts are auto-submitted (PRD §3.5).
    const result = await finalizeAttempt(attempt);
    res.json({ success: true, data: { autoSubmitted: true, result } });
    return;
  }

  const questions = await loadPaperQuestions(attempt);
  res.json({
    success: true,
    data: {
      attemptId: attempt.id,
      attemptNo: attempt.attemptNo,
      expiresAt: attempt.expiresAt,
      remainingSec: Math.max(0, Math.floor((attempt.expiresAt.getTime() - Date.now()) / 1000)),
      paper: sanitizedPaper(attempt, questions),
      savedAnswers: attempt.answers.map((a) => ({
        questionId: a.questionId.toString(),
        response: a.response,
        savedAt: a.savedAt,
      })),
    },
  });
};

// Autosave every answer (PRD §3.5) — upserts by questionId.
export const saveAnswers: RequestHandler = async (req, res) => {
  const user = authUser(req);
  const attempt = await assertOwnership(AssessmentAttempt, {
    _id: req.params.id,
    userId: new Types.ObjectId(user.id),
  });

  if (attempt.status !== 'in_progress') {
    throw ApiError.badRequest('Attempt is not in progress');
  }
  if (attempt.expiresAt <= new Date()) {
    const result = await finalizeAttempt(attempt);
    res.status(400).json({
      success: false,
      error: {
        code: 'ATTEMPT_EXPIRED',
        message: 'Time is over — the attempt was auto-submitted',
        result,
      },
    });
    return;
  }

  const paperIds = new Set(attempt.paper.map((p) => p.questionId.toString()));
  const now = new Date();
  const incoming = req.body.answers as Array<{ questionId: string; response: unknown }>;

  for (const answer of incoming) {
    if (!paperIds.has(answer.questionId)) continue; // ignore answers to questions not on this paper
    const existing = attempt.answers.find((a) => a.questionId.toString() === answer.questionId);
    if (existing) {
      existing.response = answer.response;
      existing.savedAt = now;
    } else {
      attempt.answers.push({
        questionId: new Types.ObjectId(answer.questionId),
        response: answer.response,
        savedAt: now,
      });
    }
  }
  await attempt.save();
  res.json({ success: true, data: { savedCount: incoming.length, savedAt: now } });
};

export const submit: RequestHandler = async (req, res) => {
  const user = authUser(req);
  const attempt = await assertOwnership(AssessmentAttempt, {
    _id: req.params.id,
    userId: new Types.ObjectId(user.id),
  });
  if (attempt.status !== 'in_progress') {
    throw ApiError.badRequest('Attempt already submitted or timed out');
  }
  const result = await finalizeAttempt(attempt);
  res.json({ success: true, data: result });
};

// Post-scoring answer review — visible only to the employee themself (PRD §3.6).
// Correct answers are revealed here, which is why re-attempts draw rotated sets.
export const review: RequestHandler = async (req, res) => {
  const user = authUser(req);
  const attempt = await assertOwnership(AssessmentAttempt, {
    _id: req.params.id,
    userId: new Types.ObjectId(user.id),
  });
  if (attempt.status !== 'scored') {
    throw ApiError.badRequest('Review is available only after scoring');
  }

  const questions = await loadPaperQuestions(attempt);
  const answersById = new Map(attempt.answers.map((a) => [a.questionId.toString(), a.response]));

  const rows = attempt.paper
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((entry) => {
      const q = questions.get(entry.questionId.toString());
      if (!q) return null;
      const response = answersById.get(entry.questionId.toString());

      if (q.type === 'mcq' || q.type === 'case_study') {
        const options = q.options ?? [];
        const yourIdx = typeof response === 'number' ? response : null;
        const best = options.reduce(
          (top, o, i) => (o.weight > (options[top]?.weight ?? -1) ? i : top),
          0,
        );
        const yourWeight = yourIdx !== null ? options[yourIdx]?.weight ?? 0 : 0;
        return {
          order: entry.order,
          type: q.type,
          question: q.body,
          yourAnswer: yourIdx !== null ? options[yourIdx]?.text ?? null : null,
          correctAnswer: options[best]?.text ?? null,
          // Case studies are weighted judgments, not binary right/wrong (PRD §5.2).
          result: yourWeight >= 0.999 ? 'correct' : yourWeight > 0 ? 'partial' : 'incorrect',
          ...(q.type === 'case_study' ? { yourWeight } : {}),
        };
      }
      if (q.type === 'fib') {
        const given = Array.isArray(response) ? (response as string[]) : [];
        const accepted = (q.blanks ?? []).map((b) => b.acceptedAnswers[0] ?? '');
        // Graded with the same matcher the scorer uses (case/whitespace-
        // insensitive per blank), so the review verdict always agrees with
        // the recorded score. Multi-blank questions can earn partial credit.
        const points = scoreQuestion(q, response);
        return {
          order: entry.order,
          type: q.type,
          question: q.body,
          yourAnswer: given.join(' · ') || null,
          correctAnswer: accepted.join(' · '),
          result: points >= 0.999 ? 'correct' : points > 0 ? 'partial' : 'incorrect',
        };
      }
      // Simulation: decision path vs recommended path (PRD §5.2).
      const path = Array.isArray(response)
        ? (response as Array<{ nodeId: string; choiceId: string }>)
        : [];
      const nodes = q.nodes ?? [];
      return {
        order: entry.order,
        type: q.type,
        question: q.body,
        yourPath: path.map((step) => {
          const node = nodes.find((n) => n.nodeId === step.nodeId);
          const choice = node?.choices.find((c) => c.choiceId === step.choiceId);
          return { prompt: node?.prompt ?? '', choice: choice?.text ?? '', impact: choice?.impact ?? 0 };
        }),
        recommendedPath: nodes.map((n) => {
          const best = n.choices.reduce((top, c) => (c.impact > top.impact ? c : top), n.choices[0]!);
          return { prompt: n.prompt, choice: best?.text ?? '' };
        }),
      };
    })
    .filter(Boolean);

  res.json({
    success: true,
    data: { attemptId: attempt.id, score: attempt.score, questions: rows },
  });
};
