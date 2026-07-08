/* Seeds the question bank (and a few open audit slots) so the platform is
   usable end-to-end in development. Idempotent: every item carries a unique
   `seed:<key>` tag and is only inserted if missing.

   Run:  npx tsx scripts/seed-questions.ts

   MCQ content is ported from the original frontend prototype bank
   (Frontend/extracted/server/questions.js). Production content is managed by
   the Super Admin via POST /api/v1/admin/questions. */
import { connectDb, disconnectDb } from '../src/config/db';
import { Question } from '../src/modules/questions/question.model';
import type { IQuestion } from '../src/modules/questions/question.model';
import { AuditSlot } from '../src/modules/audits/audit.model';

type SeedQuestion = Pick<IQuestion, 'type' | 'body' | 'difficulty'> &
  Partial<Pick<IQuestion, 'options' | 'blanks' | 'nodes' | 'actReference'>> & { key: string };

function mcq(
  key: string,
  body: string,
  options: string[],
  correct: number,
  difficulty: 'easy' | 'medium' | 'hard' = 'medium',
  actReference?: string,
): SeedQuestion {
  return {
    key,
    type: 'mcq',
    body,
    difficulty,
    actReference,
    options: options.map((text, i) => ({ text, weight: i === correct ? 1 : 0 })),
  };
}

const QUESTIONS: SeedQuestion[] = [
  // ── MCQ (ported from the prototype bank) ────────────────────────────────
  mcq(
    'mcq-101',
    'Within what period must a complaint of sexual harassment be filed with the Internal Committee?',
    [
      'Within 30 days of the incident',
      'Within 3 months of the incident (extendable by a further 3 months)',
      'Within 1 year of the incident',
      'There is no time limit',
    ],
    1,
    'easy',
    'Section 9',
  ),
  mcq(
    'mcq-102',
    'Every workplace with how many or more employees must constitute an Internal Committee?',
    ['5', '10', '20', '50'],
    1,
    'easy',
    'Section 4',
  ),
  mcq(
    'mcq-103',
    'Which of these is mandatory for an Internal Committee to be validly constituted?',
    [
      'All members must be from the HR department',
      'The CEO must chair the committee',
      'A senior woman Presiding Officer, at least half women members, and one external member',
      'Only external legal experts may be members',
    ],
    2,
    'medium',
    'Section 4',
  ),
  mcq(
    'mcq-104',
    'The Internal Committee must complete its inquiry within how many days of receiving a complaint?',
    ['30 days', '60 days', '90 days', '180 days'],
    2,
    'medium',
    'Section 11',
  ),
  mcq(
    'mcq-105',
    "Under the POSH Act, 'workplace' includes:",
    [
      'Only the office premises',
      'Office premises and the cafeteria only',
      'Any place visited by the employee arising out of employment, including transport provided by the employer',
      'Only locations owned by the employer',
    ],
    2,
    'medium',
    'Section 2(o)',
  ),
  mcq(
    'mcq-106',
    "A manager hints that a promotion depends on 'cooperation' outside working hours. This is best described as:",
    [
      'A private matter between colleagues',
      'Quid pro quo sexual harassment',
      'A performance discussion',
      'Acceptable if said as a joke',
    ],
    1,
    'hard',
    'Section 3',
  ),
  mcq(
    'mcq-107',
    "During an inquiry, the respondent's team starts excluding the complainant from meetings. The employer should treat this as:",
    [
      'Normal team friction to be ignored until the inquiry ends',
      'Retaliation — interim protection must be considered and the conduct recorded',
      'Proof that the complaint was false',
      'A reason to transfer the complainant without asking her',
    ],
    1,
    'hard',
    'Section 12',
  ),
  mcq(
    'mcq-108',
    'Conciliation between the complainant and respondent is permitted:',
    [
      'Whenever the employer prefers a quiet settlement',
      'Only at the request of the aggrieved woman, before the inquiry begins, and never on a monetary basis',
      'Only after the inquiry has concluded',
      'Never, under any circumstances',
    ],
    1,
    'medium',
    'Section 10',
  ),
  mcq(
    'mcq-109',
    'Under Section 21, the annual report of the Internal Committee is submitted to:',
    [
      "The company's board only",
      'The employer and the District Officer',
      'The National Commission for Women directly',
      'The police station with jurisdiction',
    ],
    1,
    'easy',
    'Section 21',
  ),
  mcq(
    'mcq-110',
    "The CEO asks the Internal Committee to handle a complaint against a top performer 'informally' to protect the quarter. The committee should:",
    [
      'Comply — business priorities come first',
      'Pause the case until the quarter ends',
      'Proceed under the Act and record the request in the case file',
      'Ask the complainant to withdraw',
    ],
    2,
    'hard',
    'Section 16',
  ),
  mcq(
    'mcq-111',
    'The external member of the Internal Committee must be:',
    [
      'A practising advocate on the company payroll',
      'From an NGO or association committed to the cause of women, or a person familiar with issues of sexual harassment',
      'A government labour inspector',
      'Any retired employee of the organisation',
    ],
    1,
    'medium',
    'Section 4(2)(c)',
  ),
  mcq(
    'mcq-112',
    'The maximum tenure of an Internal Committee member is:',
    ['1 year', '2 years', '3 years', '5 years'],
    2,
    'easy',
    'Section 4(3)',
  ),

  // ── Fill in the blanks ──────────────────────────────────────────────────
  {
    key: 'fib-201',
    type: 'fib',
    difficulty: 'medium',
    actReference: 'Section 11',
    body: 'The Internal Committee must complete its inquiry within ____ days, and the employer must act on its recommendations within ____ days of receiving the report.',
    blanks: [
      { acceptedAnswers: ['90', 'ninety', '90 days'] },
      { acceptedAnswers: ['60', 'sixty', '60 days'] },
    ],
  },
  {
    key: 'fib-202',
    type: 'fib',
    difficulty: 'easy',
    actReference: 'Section 4',
    body: 'An Internal Committee is mandatory at every workplace with ____ or more employees.',
    blanks: [{ acceptedAnswers: ['10', 'ten'] }],
  },
  {
    key: 'fib-203',
    type: 'fib',
    difficulty: 'medium',
    actReference: 'Section 9',
    body: 'A complaint should be filed within ____ months of the incident; the Committee may extend this by a further ____ months for recorded reasons.',
    blanks: [
      { acceptedAnswers: ['3', 'three', '3 months'] },
      { acceptedAnswers: ['3', 'three', '3 months'] },
    ],
  },
  {
    key: 'fib-204',
    type: 'fib',
    difficulty: 'hard',
    actReference: 'Section 21',
    body: 'The Internal Committee submits its annual report to the employer and the ____ Officer.',
    blanks: [{ acceptedAnswers: ['district', 'district officer'] }],
  },

  // ── Case studies (weighted judgment) ────────────────────────────────────
  {
    key: 'case-301',
    type: 'case_study',
    difficulty: 'hard',
    actReference: 'Sections 9, 12',
    body:
      'A junior analyst tells her HR partner, verbally and in confidence, that a senior director repeatedly comments on her appearance and has started messaging her late at night. She is visibly anxious and says she "does not want to make it formal — I just want it to stop." What is the most defensible immediate course of action?',
    options: [
      {
        text: 'Explain her options under the Act, including informal resolution and interim protections; record the conversation; let her decide whether to file a written complaint — while assessing any immediate safety need.',
        weight: 1,
      },
      {
        text: 'Immediately forward everything to the director\'s manager so the behaviour stops quickly.',
        weight: 0,
      },
      {
        text: 'Tell her nothing can be done until she submits a written complaint, and close the conversation.',
        weight: 0,
      },
      {
        text: 'Quietly move her to another team so she no longer reports near the director.',
        weight: 0.5,
      },
    ],
  },
  {
    key: 'case-302',
    type: 'case_study',
    difficulty: 'hard',
    actReference: 'Section 11',
    body:
      'Mid-inquiry, the respondent — a rainmaker sales head — offers to resign if the matter is "closed with no findings." The complainant wants the inquiry completed. The IC should:',
    options: [
      {
        text: 'Complete the inquiry and record findings regardless of the resignation; the employer may still act on the report.',
        weight: 1,
      },
      {
        text: 'Accept the resignation and close the case — the workplace risk is gone.',
        weight: 0,
      },
      {
        text: 'Pause the inquiry while leadership negotiates the exit terms.',
        weight: 0,
      },
      {
        text: 'Complete the inquiry but soften the findings since he is leaving anyway.',
        weight: 0.5,
      },
    ],
  },
  {
    key: 'case-303',
    type: 'case_study',
    difficulty: 'medium',
    actReference: 'Section 16',
    body:
      'A team member posts a redacted screenshot of an ongoing IC case in a company Slack channel "to warn others." The IC learns of it the same day. The most appropriate response is:',
    options: [
      {
        text: 'Remove the post, remind all parties in writing of the confidentiality duty under Section 16, and record the breach in the case file.',
        weight: 1,
      },
      { text: 'Ignore it — the names were redacted, so no harm was done.', weight: 0 },
      { text: 'Terminate the poster immediately for misconduct.', weight: 0.5 },
      { text: 'Close the case since confidentiality is already broken.', weight: 0 },
    ],
  },

  // ── Simulations (decision path, impact-rated) ───────────────────────────
  {
    key: 'sim-401',
    type: 'simulation',
    difficulty: 'hard',
    actReference: 'Sections 9, 12, 16',
    body:
      'You are the Presiding Officer. A written complaint has just been received against a well-liked team lead. Walk through your first week.',
    nodes: [
      {
        nodeId: 'n1',
        prompt: 'Day 1 — the complaint lands. Your first step:',
        choices: [
          {
            choiceId: 'a',
            text: 'Acknowledge receipt in writing, share the complaint with IC members under confidentiality, and calendar the statutory timelines.',
            impact: 1,
            nextNodeId: 'n2',
          },
          {
            choiceId: 'b',
            text: 'Call the respondent first to "hear his side" informally before anything is on record.',
            impact: 0,
            nextNodeId: 'n2',
          },
          {
            choiceId: 'c',
            text: 'Wait a few days to see if the complainant cools off.',
            impact: 0,
            nextNodeId: 'n2',
          },
        ],
      },
      {
        nodeId: 'n2',
        prompt: 'Day 3 — the complainant says she is afraid of sitting in the same bay as the respondent during the inquiry:',
        choices: [
          {
            choiceId: 'a',
            text: 'Consider interim measures under Section 12 — offer her (not the respondent by default) options like transfer or leave, recorded in writing.',
            impact: 1,
            nextNodeId: 'n3',
          },
          {
            choiceId: 'b',
            text: 'Tell her the inquiry must finish first; nothing can change until then.',
            impact: 0,
            nextNodeId: 'n3',
          },
          {
            choiceId: 'c',
            text: 'Move the respondent to another floor without telling him why.',
            impact: 0.5,
            nextNodeId: 'n3',
          },
        ],
      },
      {
        nodeId: 'n3',
        prompt: 'Day 5 — a director messages you: "Board wants this wrapped quietly. Can you settle it this week?"',
        choices: [
          {
            choiceId: 'a',
            text: 'Decline, note the approach in the case file, and continue the inquiry per the Act.',
            impact: 1,
          },
          {
            choiceId: 'b',
            text: 'Agree to fast-track and skip the respondent\'s written reply to save time.',
            impact: 0,
          },
          {
            choiceId: 'c',
            text: 'Ask the complainant if she would accept a settlement, since leadership prefers it.',
            impact: 0,
          },
        ],
      },
    ],
  },
  {
    key: 'sim-402',
    type: 'simulation',
    difficulty: 'medium',
    actReference: 'Sections 10, 11',
    body:
      'You are an IC member. The aggrieved woman asks about resolving the matter without a full inquiry.',
    nodes: [
      {
        nodeId: 'n1',
        prompt: 'She asks: "Can this be settled without an inquiry?" You explain:',
        choices: [
          {
            choiceId: 'a',
            text: 'Conciliation is possible only at her request, before the inquiry begins, and no monetary settlement can be its basis.',
            impact: 1,
            nextNodeId: 'n2',
          },
          {
            choiceId: 'b',
            text: 'The company can offer her compensation to withdraw the complaint.',
            impact: 0,
            nextNodeId: 'n2',
          },
          {
            choiceId: 'c',
            text: 'Settlement is not allowed under any circumstances.',
            impact: 0.5,
            nextNodeId: 'n2',
          },
        ],
      },
      {
        nodeId: 'n2',
        prompt: 'Conciliation succeeds. What must the IC still do?',
        choices: [
          {
            choiceId: 'a',
            text: 'Record the settlement, provide copies to both parties, and take no further inquiry — while noting that breach of terms reopens the case.',
            impact: 1,
          },
          {
            choiceId: 'b',
            text: 'Delete the complaint from the records since it is resolved.',
            impact: 0,
          },
          {
            choiceId: 'c',
            text: 'Keep monitoring the respondent informally for a year.',
            impact: 0.5,
          },
        ],
      },
    ],
  },
];

async function main(): Promise<void> {
  await connectDb();

  let inserted = 0;
  for (const q of QUESTIONS) {
    const { key, ...doc } = q;
    const tag = `seed:${key}`;
    const result = await Question.updateOne(
      { tags: tag },
      { $setOnInsert: { ...doc, tags: [tag], version: 1, isActive: true } },
      { upsert: true },
    );
    if (result.upsertedCount) inserted += 1;
  }
  const total = await Question.countDocuments({ isActive: true });
  console.log(`Questions: ${inserted} inserted, ${total} active in bank`);

  // A few open audit slots (weekday mornings over the next three weeks) so
  // POSH-Ready organisations can book without a Super Admin round-trip.
  const openSlots = await AuditSlot.countDocuments({ isBooked: false, startsAt: { $gt: new Date() } });
  if (openSlots === 0) {
    const slots: Array<{ startsAt: Date }> = [];
    for (let day = 7; day <= 21 && slots.length < 6; day++) {
      const d = new Date();
      d.setDate(d.getDate() + day);
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      d.setHours(10, 0, 0, 0);
      slots.push({ startsAt: d });
    }
    await AuditSlot.insertMany(slots);
    console.log(`Audit slots: ${slots.length} inserted`);
  } else {
    console.log(`Audit slots: ${openSlots} already open — skipped`);
  }

  await disconnectDb();
}

main().catch((err) => {
  console.error('Seed failed:', (err as Error).message);
  process.exit(1);
});
