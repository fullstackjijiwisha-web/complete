import type { IQuestion } from '../questions/question.model';
import type { IAssessmentAttempt } from '../assessments/attempt.model';

// Scoring is server-side only. Answer keys, option weights, and decision
// impacts never leave this module toward an in-progress attempt (PRD §11).

export interface SimulationStep {
  nodeId: string;
  choiceId: string;
}

export interface QuestionResult {
  questionId: string;
  type: string;
  points: number; // 0..1
}

/**
 * Blanks the AI grader accepted, as questionId -> set of blank indexes.
 *
 * Scoring stays a pure, synchronous function: the AI call happens once, before
 * scoring, and its decisions are passed in as data. That keeps submit-time
 * scoring and the later answer review reading from the SAME decisions, so the
 * score and the review can never disagree.
 */
export type AiAcceptedBlanks = ReadonlyMap<string, ReadonlySet<number>>;

export interface AttemptScore {
  total: number; // 0..100, one decimal
  sectionScores: Record<string, number>;
  correct: number;
  incorrect: number;
  totalQuestions: number;
  perQuestion: QuestionResult[];
}

export function normalizeAnswer(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Every question yields points in [0,1]; unanswered scores 0.
//
// `aiAccepted` lists blank indexes the AI grader judged correct despite not
// matching the answer key exactly. It can only ADD credit — a blank the exact
// matcher already accepted never consults it — so a failure or absence of AI
// grading can never cost a learner marks.
export function scoreQuestion(
  question: IQuestion,
  response: unknown,
  aiAccepted?: ReadonlySet<number>,
): number {
  switch (question.type) {
    case 'mcq':
    case 'case_study': {
      if (typeof response !== 'number') return 0;
      const option = question.options?.[response];
      if (!option) return 0;
      return Math.min(1, Math.max(0, option.weight));
    }
    case 'fib': {
      const blanks = question.blanks ?? [];
      if (!Array.isArray(response) || blanks.length === 0) return 0;
      let correct = 0;
      blanks.forEach((blank, i) => {
        const given = response[i];
        if (typeof given !== 'string') return;
        const accepted = blank.acceptedAnswers.map(normalizeAnswer);
        if (accepted.includes(normalizeAnswer(given))) correct += 1;
        else if (aiAccepted?.has(i)) correct += 1;
      });
      return correct / blanks.length;
    }
    case 'simulation': {
      // v1 rubric: mean decision-impact across the recorded path (PRD §3.5).
      if (!Array.isArray(response) || response.length === 0) return 0;
      const nodes = new Map((question.nodes ?? []).map((n) => [n.nodeId, n]));
      let sum = 0;
      let counted = 0;
      for (const step of response as SimulationStep[]) {
        const node = nodes.get(step?.nodeId);
        const choice = node?.choices.find((c) => c.choiceId === step?.choiceId);
        if (!choice) continue;
        sum += Math.min(1, Math.max(0, choice.impact));
        counted += 1;
      }
      return counted ? sum / counted : 0;
    }
    default:
      return 0;
  }
}

export function scoreAttempt(
  attempt: Pick<IAssessmentAttempt, 'paper' | 'answers'>,
  questionsById: Map<string, IQuestion>,
  aiAccepted?: AiAcceptedBlanks,
): AttemptScore {
  const answersById = new Map(attempt.answers.map((a) => [a.questionId.toString(), a.response]));

  const perQuestion: QuestionResult[] = [];
  const sectionTotals = new Map<string, { sum: number; count: number }>();

  for (const entry of attempt.paper) {
    const qid = entry.questionId.toString();
    const question = questionsById.get(qid);
    const points = question
      ? scoreQuestion(question, answersById.get(qid), aiAccepted?.get(qid))
      : 0;
    perQuestion.push({ questionId: qid, type: entry.type, points });
    const section = sectionTotals.get(entry.type) ?? { sum: 0, count: 0 };
    section.sum += points;
    section.count += 1;
    sectionTotals.set(entry.type, section);
  }

  const totalQuestions = attempt.paper.length;
  const earned = perQuestion.reduce((sum, q) => sum + q.points, 0);
  const total = totalQuestions ? Math.round((earned / totalQuestions) * 1000) / 10 : 0;

  const sectionScores: Record<string, number> = {};
  for (const [type, { sum, count }] of sectionTotals) {
    sectionScores[type] = count ? Math.round((sum / count) * 1000) / 10 : 0;
  }

  const correct = perQuestion.filter((q) => q.points >= 0.999).length;
  return {
    total,
    sectionScores,
    correct,
    incorrect: totalQuestions - correct,
    totalQuestions,
    perQuestion,
  };
}
