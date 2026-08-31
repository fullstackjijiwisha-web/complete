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

/**
 * Words and symbols that name a number, mapped to the digit they mean.
 *
 * Applied only when the WHOLE answer is one of these, so an answer that merely
 * contains "one" is untouched. Roman numerals are included because people
 * genuinely answer "(i)" or "iv"; Hindi numerals are included because people
 * genuinely answer "char" or "saat". Ambiguous English words are deliberately
 * left out - "do" is Hindi for two and also an ordinary English verb, so
 * mapping it would be a guess rather than a rule.
 */
const NUMBER_WORDS: Record<string, string> = {
  // English
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6',
  seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12',
  thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16',
  seventeen: '17', eighteen: '18', nineteen: '19', twenty: '20',
  thirty: '30', forty: '40', fifty: '50', sixty: '60', ninety: '90',
  // Roman, as typed in a list: (i), ii, IV ...
  i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8',
  ix: '9', x: '10', xi: '11', xii: '12', xv: '15', xx: '20',
  // Hindi in Roman script, common spellings
  ek: '1', teen: '3', char: '4', chaar: '4', paanch: '5', panch: '5',
  chhe: '6', chah: '6', saat: '7', aath: '8', nau: '9', das: '10',
  bees: '20', tees: '30',
  // Hindi in Devanagari
  '\u090f\u0915': '1', '\u0926\u094b': '2', '\u0924\u0940\u0928': '3',
  '\u091a\u093e\u0930': '4', '\u092a\u093e\u0901\u091a': '5',
  '\u091b\u0939': '6', '\u0938\u093e\u0924': '7', '\u0906\u0920': '8',
  '\u0928\u094c': '9', '\u0926\u0938': '10',
};

/**
 * The form both sides are reduced to before comparing.
 *
 * These are canonical rewrites, NOT similarity scoring. Every rule maps a
 * spelling onto a fixed form; none of them measures how alike two words are.
 * That is what keeps a genuinely different answer out: no rule turns
 * "nirbhaya" into "vishaka", however the letters happen to line up.
 *
 *   "SHE-BOX" / "She Box" / "SHEBOX" / "she box"  ->  shebox
 *   "four" / "Four" / "4" / "(iv)" / "char" / "4" ->  4
 *   "the Vishaka guidelines"                       ->  vishakaguidelines
 */
export function canonicalAnswer(value: string): string {
  let out = normalizeAnswer(value);

  // Devanagari digits to ASCII, so "\u096a" and "4" are one answer.
  out = out.replace(/[\u0966-\u096f]/g, (d) => String(d.charCodeAt(0) - 0x0966));

  // Strip list punctuation around a numeral: "(i)" / "i." / "1)" -> "i" / "1".
  const bare = out.replace(/^[([{]?\s*([a-z0-9\u0900-\u097f]+)\s*[)\].]?$/, '$1');
  if (NUMBER_WORDS[bare]) return NUMBER_WORDS[bare];
  if (NUMBER_WORDS[out]) return NUMBER_WORDS[out];

  // A leading article carries no meaning in a short answer.
  out = out.replace(/^(the|a|an)\s+/, '');

  // Hyphens, dots, slashes and spaces are formatting, not content. Removing
  // them collapses a whole family of spellings onto one key.
  return out.replace(/[^a-z0-9\u0900-\u097f]/g, '');
}

/**
 * Folds the ways one Indian name gets written in the Latin alphabet.
 *
 * Two variations account for most of it, and both are rules rather than
 * guesses:
 *   - the aspiration "h" after a consonant is optional: kh/k, sh/s, th/t,
 *     bh/b ... so Vishaka, Vishakha and Visakha all fold to "visaka".
 *   - a repeated letter is the same sound held longer: Vishaaka -> Vishaka,
 *     and as a side effect "commitee" and "committee" fold together too.
 *
 * This is what makes the romanisation family work WITHOUT loosening the typo
 * leash. Distinct names stay distinct: "nirbhaya" folds to "nirbaya", which is
 * nothing like "visaka"; "internal" and "external" contain neither an
 * aspiration nor a double letter and are untouched.
 */
function transliterationKey(value: string): string {
  return canonicalAnswer(value)
    .replace(/([bcdgjkpstz])h/g, '$1')
    .replace(/(.)+/g, '$1');
}

/**
 * Reads an answer as a list of numbers, or returns null if any word in it is
 * not a number.
 *
 * This is what lets someone write the same number twice for clarity - "1 (one)",
 * "one (1)", "4 - four" - and still be marked correct, while keeping numbers
 * otherwise exact. "three months" returns null, because "months" is not a
 * number and the answer therefore means something other than plain "3".
 */
function numberTokens(value: string): string[] | null {
  const normalized = normalizeAnswer(value).replace(/[०-९]/g, (d) =>
    String(d.charCodeAt(0) - 0x0966),
  );
  const words = normalized
    .split(/[^a-z0-9ऀ-ॿ]+/)
    .filter((w) => w && !['the', 'a', 'an', 'or', 'i.e', 'ie'].includes(w));
  if (!words.length) return null;

  const numbers: string[] = [];
  for (const word of words) {
    if (/^\d+$/.test(word)) {
      numbers.push(String(Number(word)));
      continue;
    }
    const named = NUMBER_WORDS[word];
    if (!named) return null; // a word that is not a number: not a restatement
    numbers.push(named);
  }
  return numbers;
}

/** The answer split into canonical words, for matching short keys like "IC". */
function answerWords(value: string): string[] {
  return normalizeAnswer(value)
    .split(/[^a-z0-9ऀ-ॿ]+/)
    .map(canonicalAnswer)
    .filter(Boolean);
}

/** Edit distance, capped: stops as soon as it exceeds `max`. */
function withinEdits(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  if (a === b) return true;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const val = Math.min(row[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
      row.push(val);
      if (val < best) best = val;
    }
    if (best > max) return false; // no cell in this row can lead anywhere useful
    prev = row;
  }
  return prev[b.length]! <= max;
}

/**
 * Does this learner answer match one of the accepted answers for a blank?
 *
 * Four layers, each deliberately narrow:
 *   1. canonical equality  - spelling families, numbers in any notation
 *   2. containment         - the answer wrapped in extra words
 *   3. transliteration     - the same Indian name romanised differently
 *   4. one-edit tolerance  - a genuine typo
 *   5. nothing else        - anything left over goes to the review queue for a
 *                            human to decide once, and is then matched for free
 *
 * Layer 3 is the one that can be wrong, so it is kept on a short leash: a single
 * edit, on keys of five characters or more, never on numbers, and the first
 * letter must agree. Two edits would be enough to turn "internal" into
 * "external" - a different committee, marked correct. One edit is not.
 */
export function fibBlankMatches(acceptedAnswers: string[], given: string): boolean {
  const answer = canonicalAnswer(given);
  if (!answer) return false;

  const keys = acceptedAnswers.map(canonicalAnswer).filter(Boolean);
  if (keys.includes(answer)) return true;

  const words = answerWords(given);

  for (const key of keys) {
    if (/^\d+$/.test(key)) {
      // Numbers are held exact - "4" and "5" are one edit apart, "40" contains
      // "4" - with one deliberate exception: the same number said twice,
      // "1 (one)" or "one (1)", where every word still means this number.
      const numbers = numberTokens(given);
      if (numbers && numbers.length > 1 && numbers.every((n) => n === key)) return true;
      continue;
    }

    // A short key such as "IC" is safe to match as a whole word - "IC (Internal
    // Committee)" - but not by containment or typo, where two letters are far
    // too little to go on.
    if (key.length < 5) {
      if (words.includes(key)) return true;
      continue;
    }

    // 2. Answered correctly, with words around it.
    if (answer.includes(key)) return true;

    // 3. The same name spelled another way in the Latin alphabet.
    const keyFold = transliterationKey(key);
    const answerFold = transliterationKey(answer);
    if (keyFold.length >= 4 && (keyFold === answerFold || answerFold.includes(keyFold))) return true;

    // 4. One typo, same opening letter.
    if (key[0] === answer[0] && withinEdits(key, answer, 1)) return true;
  }
  return false;
}

// Every question yields points in [0,1]; unanswered scores 0.
export function scoreQuestion(question: IQuestion, response: unknown): number {
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
        if (fibBlankMatches(blank.acceptedAnswers, given)) correct += 1;
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
): AttemptScore {
  const answersById = new Map(attempt.answers.map((a) => [a.questionId.toString(), a.response]));

  const perQuestion: QuestionResult[] = [];
  const sectionTotals = new Map<string, { sum: number; count: number }>();

  for (const entry of attempt.paper) {
    const qid = entry.questionId.toString();
    const question = questionsById.get(qid);
    const points = question ? scoreQuestion(question, answersById.get(qid)) : 0;
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
