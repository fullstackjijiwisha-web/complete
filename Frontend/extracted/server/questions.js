/* POSH Compass backend — question bank & scoring.
   Correct answers NEVER leave the server: the /api/questions payload strips
   them, and all scoring happens in scoreAttempt(). MCQs are live; the other
   formats are gated as coming soon. */
"use strict";

const crypto = require("crypto");
const { load, save, id, now } = require("./db");
const { httpError } = require("./auth");

const FORMATS = [
  { id: "mcq", label: "MCQs", layer: "Knowledge", status: "live" },
  { id: "fib", label: "Fill in the Blanks", layer: "Recall", status: "coming_soon" },
  { id: "case", label: "Case Studies", layer: "Judgment", status: "coming_soon" },
  { id: "sim", label: "Live Simulations", layer: "Decisions", status: "coming_soon" },
];

const PASS_PCT = 80;

/* impact: 1 low, 2 moderate, 3 high — high-impact wrongs drive the risk index */
const MCQ_BANK = [
  {
    id: "SC-MCQ-101", impact: 1, points: 10,
    text: "Within what period must a complaint of sexual harassment be filed with the Internal Committee?",
    options: [
      "Within 30 days of the incident",
      "Within 3 months of the incident (extendable by a further 3 months)",
      "Within 1 year of the incident",
      "There is no time limit",
    ],
    correct: 1,
  },
  {
    id: "SC-MCQ-102", impact: 1, points: 10,
    text: "Every workplace with how many or more employees must constitute an Internal Committee?",
    options: ["5", "10", "20", "50"],
    correct: 1,
  },
  {
    id: "SC-MCQ-103", impact: 2, points: 10,
    text: "Which of these is mandatory for an Internal Committee to be validly constituted?",
    options: [
      "All members must be from the HR department",
      "The CEO must chair the committee",
      "A senior woman Presiding Officer, at least half women members, and one external member",
      "Only external legal experts may be members",
    ],
    correct: 2,
  },
  {
    id: "SC-MCQ-104", impact: 2, points: 10,
    text: "The Internal Committee must complete its inquiry within how many days of receiving a complaint?",
    options: ["30 days", "60 days", "90 days", "180 days"],
    correct: 2,
  },
  {
    id: "SC-MCQ-105", impact: 2, points: 10,
    text: "Under the POSH Act, 'workplace' includes:",
    options: [
      "Only the office premises",
      "Office premises and the cafeteria only",
      "Any place visited by the employee arising out of employment, including transport provided by the employer",
      "Only locations owned by the employer",
    ],
    correct: 2,
  },
  {
    id: "SC-MCQ-106", impact: 3, points: 10,
    text: "A manager hints that a promotion depends on 'cooperation' outside working hours. This is best described as:",
    options: [
      "A private matter between colleagues",
      "Quid pro quo sexual harassment",
      "A performance discussion",
      "Acceptable if said as a joke",
    ],
    correct: 1,
  },
  {
    id: "SC-MCQ-107", impact: 3, points: 10,
    text: "During an inquiry, the respondent's team starts excluding the complainant from meetings. The employer should treat this as:",
    options: [
      "Normal team friction to be ignored until the inquiry ends",
      "Retaliation — interim protection must be considered and the conduct recorded",
      "Proof that the complaint was false",
      "A reason to transfer the complainant without asking her",
    ],
    correct: 1,
  },
  {
    id: "SC-MCQ-108", impact: 2, points: 10,
    text: "Conciliation between the complainant and respondent is permitted:",
    options: [
      "Whenever the employer prefers a quiet settlement",
      "Only at the request of the aggrieved woman, before the inquiry begins, and never on a monetary basis",
      "Only after the inquiry has concluded",
      "Never, under any circumstances",
    ],
    correct: 1,
  },
  {
    id: "SC-MCQ-109", impact: 1, points: 10,
    text: "Under Section 21, the annual report of the Internal Committee is submitted to:",
    options: [
      "The company's board only",
      "The employer and the District Officer",
      "The National Commission for Women directly",
      "The police station with jurisdiction",
    ],
    correct: 1,
  },
  {
    id: "SC-MCQ-110", impact: 3, points: 10,
    text: "The CEO asks the Internal Committee to handle a complaint against a top performer 'informally' to protect the quarter. The committee should:",
    options: [
      "Comply — business priorities come first",
      "Pause the case until the quarter ends",
      "Proceed under the Act and record the request in the case file",
      "Ask the complainant to withdraw",
    ],
    correct: 2,
  },
];

/* ---------- public views ---------- */
function listFormats() {
  return FORMATS.map((f) => ({ ...f }));
}

function publicQuestions(format) {
  const fmt = FORMATS.find((f) => f.id === format);
  if (!fmt) throw httpError(400, "Unknown format.");
  if (fmt.status !== "live") {
    return { format: fmt.id, status: "coming_soon", label: fmt.label, questions: [] };
  }
  return {
    format: fmt.id,
    status: "live",
    label: fmt.label,
    passPct: PASS_PCT,
    timeLimitSeconds: 12 * 60,
    questions: MCQ_BANK.map((q) => ({
      id: q.id, impact: q.impact, points: q.points, text: q.text, options: q.options,
    })),
  };
}

/* ---------- scoring (server-side only) ---------- */
function scoreAttempt(user, body) {
  const { format, answers, durationSeconds, trace } = body || {};
  const fmt = FORMATS.find((f) => f.id === format);
  if (!fmt) throw httpError(400, "Unknown format.");
  if (fmt.status !== "live") throw httpError(400, fmt.label + " assessments are coming soon.");
  if (!Array.isArray(answers) || answers.length !== MCQ_BANK.length)
    throw httpError(400, "An answer entry is required for every question (null for unanswered).");

  let earned = 0, max = 0, answered = 0;
  let highImpactTotal = 0, highImpactWrong = 0;
  const perQuestion = MCQ_BANK.map((q, i) => {
    max += q.points;
    if (q.impact === 3) highImpactTotal++;
    const a = answers[i];
    const isAnswered = a !== null && a !== undefined;
    if (isAnswered) answered++;
    const correct = isAnswered && Number(a) === q.correct;
    if (correct) earned += q.points;
    else if (q.impact === 3) highImpactWrong++;
    return {
      scenarioId: q.id,
      answeredIndex: isAnswered ? Number(a) : null,
      response: isAnswered ? String(q.options[Number(a)] || "") : null,
      correct,
      points: correct ? q.points : 0,
      maxPoints: q.points,
      impact: q.impact,
    };
  });

  const pct = Math.round((earned / max) * 1000) / 10;
  const passed = pct >= PASS_PCT;
  const submittedAt = now();
  const auditRef =
    "AUD-LOG-" + submittedAt.slice(0, 4) + "-" +
    crypto.createHash("sha256").update(user.id + submittedAt + earned).digest("hex").slice(0, 8).toUpperCase();

  const attempt = {
    id: id("att"),
    userId: user.id,
    orgId: user.orgId,
    format: fmt.id,
    answers: perQuestion.map((p) => p.answeredIndex),
    earned, max, pct, passed, answered,
    highImpactTotal, highImpactWrong,
    durationSeconds: Math.max(0, parseInt(durationSeconds, 10) || 0),
    evidence: {
      timestamp: submittedAt,
      candidate: user.name,
      scenarioIds: MCQ_BANK.map((q) => q.id),
      responseTrace: Array.isArray(trace) ? trace.slice(0, 200) : [],
      scoreBreakdown: perQuestion,
      auditLogRef: auditRef,
    },
    createdAt: submittedAt,
  };

  const db = load();
  db.attempts.push(attempt);
  save();

  return {
    attemptId: attempt.id,
    format: fmt.id,
    earned, max, pct, passed, answered,
    passPct: PASS_PCT,
    result: passed ? "CERTIFIED_INDIVIDUAL" : "NOT_CERTIFIED",
    perQuestion: perQuestion.map((p) => ({
      scenarioId: p.scenarioId, correct: p.correct, points: p.points,
      maxPoints: p.maxPoints, impact: p.impact,
    })),
    evidence: {
      timestamp: submittedAt,
      candidate: user.name,
      scenarioIds: attempt.evidence.scenarioIds,
      auditLogRef: auditRef,
      responseCount: answered,
    },
  };
}

function attemptsOf(userId) {
  return load().attempts.filter((a) => a.userId === userId);
}

module.exports = { listFormats, publicQuestions, scoreAttempt, attemptsOf, PASS_PCT, MCQ_BANK };
