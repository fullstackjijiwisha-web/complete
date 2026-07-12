/* Curated POSH question bank + idempotent seeding.

   This is the single source of truth for the assessment bank. It is used by
   both the standalone `scripts/seed-questions.ts` and the app bootstrap
   (`prepareRuntime`), so every deploy syncs the live bank automatically.

   Composition: 25 MCQ · 10 fill-in-the-blanks · 20 weighted case studies
   (+ 2 simulations). `seedCuratedBank()` upserts each item by its unique
   `seed:<key>` tag and retires the legacy prototype bank (tag `posh-act-2013`)
   so papers draw only this curated set. All content is grounded in the
   POSH Act, 2013. */
import { Question } from './question.model';
import type { IQuestion } from './question.model';

// Shared marker on every curated question — lets us cheaply detect whether the
// bank is already seeded without N per-question queries on each cold start.
export const BANK_TAG = 'bank:curated-v1';
// The original frontend-prototype seed tagged its questions with this. We
// deactivate those so only the curated set is ever drawn into a paper.
const LEGACY_TAG = 'posh-act-2013';

export type SeedQuestion = Pick<IQuestion, 'type' | 'body' | 'difficulty'> &
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

export const CURATED_BANK: SeedQuestion[] = [
  // ── MCQ (25) ────────────────────────────────────────────────────────────
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
  mcq(
    'mcq-113',
    'Which of the following, by itself, is NOT one of the acts listed as sexual harassment under the Act?',
    [
      'Unwelcome physical contact and advances',
      'A demand or request for sexual favours',
      'Constructive, work-related feedback given in a performance review',
      "Showing pornography against a person's wishes",
    ],
    2,
    'medium',
    'Section 2(n)',
  ),
  mcq(
    'mcq-114',
    'Under the POSH Act, a complaint of workplace sexual harassment may be filed by:',
    [
      'Any employee, regardless of gender',
      'Any aggrieved woman, whether or not she is employed at that workplace',
      'Only permanent women employees',
      'Only women who are members of a registered union',
    ],
    1,
    'medium',
    'Section 2(a)',
  ),
  mcq(
    'mcq-115',
    'Where a workplace has fewer than 10 employees, or the complaint is against the employer, the complaint is dealt with by:',
    [
      'The Internal Committee',
      'The Local Committee constituted by the District Officer',
      'The nearest police station',
      'The Labour Court',
    ],
    1,
    'easy',
    'Section 6',
  ),
  mcq(
    'mcq-116',
    'After the Internal Committee submits its report, the employer must act on its recommendations within:',
    ['15 days', '30 days', '60 days', '90 days'],
    2,
    'medium',
    'Section 13',
  ),
  mcq(
    'mcq-117',
    'As interim relief during the pendency of an inquiry, the aggrieved woman may be granted leave of up to:',
    ['1 month', '3 months', '6 months', '1 year'],
    1,
    'medium',
    'Section 12',
  ),
  mcq(
    'mcq-118',
    'An employer who fails to constitute an Internal Committee, or otherwise contravenes the Act, is liable to a fine which may extend to:',
    ['₹10,000', '₹25,000', '₹50,000', '₹1,00,000'],
    2,
    'medium',
    'Section 26',
  ),
  mcq(
    'mcq-119',
    'If an employer repeats a contravention under the Act, the consequences may include:',
    [
      'Only a written warning',
      'Twice the punishment, and cancellation of the licence or registration to conduct business',
      'Imprisonment of the Presiding Officer',
      'Automatic closure of the workplace with no penalty',
    ],
    1,
    'hard',
    'Section 26',
  ),
  mcq(
    'mcq-120',
    'A person aggrieved by the recommendations of the Internal Committee (or by their non-implementation) may appeal within:',
    ['30 days', '60 days', '90 days', '6 months'],
    2,
    'medium',
    'Section 18',
  ),
  mcq(
    'mcq-121',
    "The Act's provision on a false or malicious complaint means that:",
    [
      'Any complaint that cannot be proved is automatically treated as false',
      'A complainant who merely fails to substantiate her complaint can be penalised',
      'Action requires a specific finding of malice or falsity — inability to prove the complaint is not, by itself, enough',
      'Only the respondent can ever be penalised',
    ],
    2,
    'hard',
    'Section 14',
  ),
  mcq(
    'mcq-122',
    'Which of the following is a duty of the employer under the Act?',
    [
      'Organising awareness workshops and orientation programmes, and training the Internal Committee',
      'Personally deciding the outcome of every complaint',
      'Keeping complaints secret from the Internal Committee',
      "Recovering any compensation from the complainant's salary",
    ],
    0,
    'easy',
    'Section 19',
  ),
  mcq(
    'mcq-123',
    'The Internal Committee must provide its inquiry report to the employer and the parties within how many days of completing the inquiry?',
    ['5 days', '10 days', '30 days', '45 days'],
    1,
    'medium',
    'Section 13',
  ),
  mcq(
    'mcq-124',
    'In determining the compensation payable to the aggrieved woman, the Internal Committee considers, among other things:',
    [
      "Only the respondent's monthly salary",
      "The mental trauma and suffering, loss of career opportunity, and the respondent's financial position, among other factors",
      'A fixed statutory amount identical for every case',
      'Nothing — compensation is not available under the Act',
    ],
    1,
    'hard',
    'Section 15',
  ),
  mcq(
    'mcq-125',
    'A manager sustains a pattern of sexually coloured jokes in team meetings that makes the workplace intimidating for a woman on the team, though no favour is ever demanded. This is best classified as:',
    [
      'Quid pro quo harassment',
      'A hostile-work-environment form of sexual harassment',
      'Outside the Act, because no sexual favour was demanded',
      'A general disciplinary matter unrelated to POSH',
    ],
    1,
    'hard',
    'Section 3',
  ),

  // ── Fill in the blanks (10) ─────────────────────────────────────────────
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
  {
    key: 'fib-205',
    type: 'fib',
    difficulty: 'medium',
    actReference: 'Section 12',
    body: 'As an interim measure during the inquiry, the aggrieved woman may be granted leave of up to ____ months.',
    blanks: [{ acceptedAnswers: ['3', 'three', '3 months'] }],
  },
  {
    key: 'fib-206',
    type: 'fib',
    difficulty: 'medium',
    actReference: 'Section 26',
    body: 'An employer who contravenes the provisions of the Act is punishable with a fine which may extend to ₹ ____.',
    blanks: [{ acceptedAnswers: ['50000', '50,000', 'fifty thousand', '50000 rupees'] }],
  },
  {
    key: 'fib-207',
    type: 'fib',
    difficulty: 'medium',
    actReference: 'Section 18',
    body: "An appeal against the Internal Committee's recommendations may be preferred within ____ days.",
    blanks: [{ acceptedAnswers: ['90', 'ninety', '90 days'] }],
  },
  {
    key: 'fib-208',
    type: 'fib',
    difficulty: 'easy',
    actReference: 'Section 6',
    body: 'For workplaces with fewer than 10 employees, complaints are handled by the ____ Committee.',
    blanks: [{ acceptedAnswers: ['local', 'local committee', 'lc'] }],
  },
  {
    key: 'fib-209',
    type: 'fib',
    difficulty: 'medium',
    actReference: 'Section 4',
    body: 'The Presiding Officer of the Internal Committee must be a senior ____ employed at the workplace.',
    blanks: [{ acceptedAnswers: ['woman', 'woman employee', 'female'] }],
  },
  {
    key: 'fib-210',
    type: 'fib',
    difficulty: 'medium',
    actReference: 'Section 13',
    body: 'The Internal Committee must submit its inquiry report within ____ days of completion of the inquiry.',
    blanks: [{ acceptedAnswers: ['10', 'ten', '10 days'] }],
  },

  // ── Case studies — weighted judgment (20) ───────────────────────────────
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
        text: "Immediately forward everything to the director's manager so the behaviour stops quickly.",
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
  {
    key: 'case-304',
    type: 'case_study',
    difficulty: 'medium',
    actReference: 'Sections 4, 6',
    body:
      'A 40-employee startup has never formed an Internal Committee; the founder says "we\'re like a family, we don\'t need one." A woman employee now raises a harassment concern. The most compliant response is:',
    options: [
      {
        text: 'Constitute a properly composed Internal Committee without delay, and in the interim direct her to the Local Committee so her complaint is not stalled.',
        weight: 1,
      },
      { text: 'Tell her to raise it directly with the founder, since there is no committee.', weight: 0 },
      { text: 'Settle it through an informal HR chat and skip forming a committee.', weight: 0 },
      { text: "Form a committee made up entirely of the founder's leadership team to move quickly.", weight: 0.5 },
    ],
  },
  {
    key: 'case-305',
    type: 'case_study',
    difficulty: 'hard',
    actReference: 'Section 4',
    body:
      "An organisation constitutes its Internal Committee with a male Presiding Officer, three men, one woman, and no external member. A complaint is then filed. The committee's constitution is:",
    options: [
      {
        text: 'Invalid — it lacks a senior woman Presiding Officer, at least half women members, and an external member; reconstitute it before proceeding.',
        weight: 1,
      },
      { text: 'Valid — the Act only requires four members.', weight: 0 },
      { text: 'Valid for now; the external member can simply be added after the inquiry.', weight: 0.5 },
      { text: 'Invalid only because it has no practising lawyer on it.', weight: 0 },
    ],
  },
  {
    key: 'case-306',
    type: 'case_study',
    difficulty: 'medium',
    actReference: 'Sections 2(a), 9',
    body:
      'A woman who left the company two months ago wants to complain about harassment that occurred four months ago. The Internal Committee should:',
    options: [
      {
        text: 'Accept the complaint — an aggrieved woman need not be a current employee, and the committee may extend the limitation period for reasons recorded in writing.',
        weight: 1,
      },
      { text: 'Refuse it — she no longer works here and it is beyond three months.', weight: 0 },
      { text: 'Tell her the police are her only option now.', weight: 0.5 },
      { text: 'Accept the complaint but automatically deny any interim relief.', weight: 0.5 },
    ],
  },
  {
    key: 'case-307',
    type: 'case_study',
    difficulty: 'medium',
    actReference: 'Sections 16, 17',
    body:
      'During an inquiry, a senior manager who is not on the Internal Committee asks the Presiding Officer for the complainant\'s name "so leadership can keep an eye on things." The correct response is:',
    options: [
      {
        text: 'Decline — the identities and contents of the proceedings are confidential under the Act, and disclosure attracts a penalty.',
        weight: 1,
      },
      { text: 'Share the name, since leadership has a right to know.', weight: 0 },
      { text: 'Share it verbally but never in writing.', weight: 0 },
      { text: "Ask the complainant's permission and then brief leadership.", weight: 0.5 },
    ],
  },
  {
    key: 'case-308',
    type: 'case_study',
    difficulty: 'hard',
    actReference: 'Section 12',
    body:
      'The complainant and respondent are on the same small team. After the complaint, the respondent — who supervises her — starts assigning her the worst shifts. The Internal Committee should:',
    options: [
      {
        text: 'Treat the pattern as possible retaliation, consider interim measures such as restraining him from supervising her work, and record it.',
        weight: 1,
      },
      { text: 'Do nothing — shift allocation is a managerial prerogative.', weight: 0 },
      { text: 'Ask the complainant to tolerate it until the inquiry concludes.', weight: 0 },
      { text: 'Quietly move the respondent off the team without documenting the reason or any interim order.', weight: 0.5 },
    ],
  },
  {
    key: 'case-309',
    type: 'case_study',
    difficulty: 'medium',
    actReference: 'Section 10',
    body:
      'Before the inquiry begins, the aggrieved woman says she would accept a written apology and a commitment to stop, instead of a full inquiry. The Internal Committee may:',
    options: [
      {
        text: 'Facilitate conciliation at her request, record the settlement, and give copies to both parties — provided it is not based on any monetary payment.',
        weight: 1,
      },
      { text: 'Refuse — every complaint must proceed to a full inquiry.', weight: 0 },
      { text: 'Arrange a cash settlement so the matter closes quickly.', weight: 0 },
      { text: 'Facilitate the apology informally but keep no written record of the terms.', weight: 0.5 },
    ],
  },
  {
    key: 'case-310',
    type: 'case_study',
    difficulty: 'hard',
    actReference: 'Section 14',
    body:
      'After a full inquiry, the complaint is not proved. The respondent demands that the complainant be punished for a "false complaint." The Internal Committee should:',
    options: [
      {
        text: 'Explain that inability to substantiate a complaint is not the same as a false or malicious one; any penalty requires a separate, specific finding of malice or falsity.',
        weight: 1,
      },
      { text: 'Automatically penalise the complainant because the complaint was not proved.', weight: 0 },
      { text: "Recommend the complainant's dismissal to deter future complaints.", weight: 0 },
      { text: 'Informally warn the complainant to "be careful" before closing the file.', weight: 0.5 },
    ],
  },
  {
    key: 'case-311',
    type: 'case_study',
    difficulty: 'medium',
    actReference: 'Section 2(o)',
    body:
      'An incident occurs at an offsite team dinner arranged and paid for by the company. The respondent argues it was "after hours and off premises, so POSH does not apply." The Internal Committee should:',
    options: [
      {
        text: 'Recognise that "workplace" extends to places visited in the course of employment, including employer-arranged events, and proceed under the Act.',
        weight: 1,
      },
      { text: 'Agree — the Act only covers office premises during working hours.', weight: 0 },
      { text: 'Refer it to the police as a purely private matter.', weight: 0 },
      { text: 'Take it up only if the complainant insists, treating it as a personal dispute.', weight: 0.5 },
    ],
  },
  {
    key: 'case-312',
    type: 'case_study',
    difficulty: 'medium',
    actReference: 'Section 11',
    body:
      'The respondent repeatedly refuses to attend inquiry hearings, hoping to stall past the 90-day limit. The Internal Committee should:',
    options: [
      {
        text: 'Proceed ex-parte after giving adequate notice, as the rules allow, and complete the inquiry within the timeline.',
        weight: 1,
      },
      { text: 'Abandon the inquiry, since both parties must cooperate.', weight: 0 },
      { text: "Close the case in the respondent's favour for lack of participation.", weight: 0 },
      { text: 'Grant an open-ended series of adjournments each time he fails to appear, even past the timeline.', weight: 0.5 },
    ],
  },
  {
    key: 'case-313',
    type: 'case_study',
    difficulty: 'easy',
    actReference: 'Section 19',
    body:
      'A new HR head finds the company has an Internal Committee but has never run awareness sessions, and most staff do not know how to file a complaint. The best step is:',
    options: [
      {
        text: 'Launch regular awareness workshops, publicise the policy and complaint process, and train the committee — these are statutory employer duties.',
        weight: 1,
      },
      { text: "Assume the committee's mere existence is enough for compliance.", weight: 0 },
      { text: 'Wait until a complaint arises before spending on training.', weight: 0 },
      { text: 'Train only senior managers, since juniors rarely complain.', weight: 0.5 },
    ],
  },
  {
    key: 'case-314',
    type: 'case_study',
    difficulty: 'medium',
    actReference: 'Section 4',
    body:
      'An Internal Committee member has served continuously for four years, and the employer wants to keep her on indefinitely because "she is experienced." This is:',
    options: [
      {
        text: "Not permissible — a member's term cannot exceed three years; the position must be reconstituted, though she may be re-appointed subject to the Act.",
        weight: 1,
      },
      { text: 'Fine — practical experience matters more than the rule.', weight: 0 },
      { text: 'Acceptable, so long as the other members agree.', weight: 0 },
      { text: 'Allowed for one transition year without any formal reconstitution.', weight: 0.5 },
    ],
  },
  {
    key: 'case-315',
    type: 'case_study',
    difficulty: 'hard',
    actReference: 'Section 12',
    body:
      'The aggrieved woman asks for a transfer as interim relief; the respondent, who is her manager, asks to transfer himself instead "to avoid awkwardness." The Internal Committee should:',
    options: [
      {
        text: "Consider interim relief on the aggrieved woman's request — e.g., her transfer or reassigning the respondent — rather than moving her against her wishes, and record the order.",
        weight: 1,
      },
      { text: "Grant the respondent's transfer request and keep the complainant where she is.", weight: 0 },
      { text: 'Refuse all transfers until the inquiry has ended.', weight: 0 },
      { text: 'Transfer both of them to entirely different cities.', weight: 0.5 },
    ],
  },
  {
    key: 'case-316',
    type: 'case_study',
    difficulty: 'medium',
    actReference: 'Sections 21, 22',
    body:
      'Year-end approaches and the Internal Committee has handled three cases. On reporting, the organisation must:',
    options: [
      {
        text: "Have the committee file an annual report with the District Officer, and include the number of cases and their disposal in the employer's annual report.",
        weight: 1,
      },
      { text: 'Keep the numbers internal to avoid reputational risk.', weight: 0 },
      { text: 'Send raw case files, including complainant names, to the District Officer.', weight: 0 },
      { text: "Report the case count to the District Officer but omit it from the employer's annual report.", weight: 0.5 },
    ],
  },
  {
    key: 'case-317',
    type: 'case_study',
    difficulty: 'hard',
    actReference: 'Section 6',
    body:
      'The alleged harasser is the employer himself. An employee wants to complain. The correct route is:',
    options: [
      {
        text: 'File with the Local Committee constituted by the District Officer, since a complaint against the employer falls outside the Internal Committee.',
        weight: 1,
      },
      { text: 'File with the Internal Committee that the employer effectively controls.', weight: 0 },
      { text: 'Drop it, as nothing can be done against the employer.', weight: 0 },
      { text: 'Raise it only at the next board meeting.', weight: 0.5 },
    ],
  },
  {
    key: 'case-318',
    type: 'case_study',
    difficulty: 'medium',
    actReference: 'Section 16',
    body:
      'A journalist asks the company spokesperson to "confirm or deny" an Internal Committee case involving a named executive. The spokesperson should:',
    options: [
      {
        text: 'Decline to disclose any identities, contents, or outcome; at most, a limited factual statement about process, with no identifying details, may be shared.',
        weight: 1,
      },
      { text: 'Confirm the outcome to appear transparent.', weight: 0 },
      { text: 'Leak selective details to control the narrative.', weight: 0 },
      { text: 'Deny that the committee exists at all.', weight: 0 },
    ],
  },
  {
    key: 'case-319',
    type: 'case_study',
    difficulty: 'medium',
    actReference: 'Section 9',
    body:
      'A woman files a complaint three months and one week after the last incident, explaining she was on medical leave for anxiety it caused. The Internal Committee should:',
    options: [
      {
        text: 'Consider extending the limitation period for reasons recorded in writing, given the circumstances, and admit the complaint.',
        weight: 1,
      },
      { text: 'Reject it outright as time-barred.', weight: 0 },
      { text: 'Tell her to first get the delay condoned by a court.', weight: 0 },
      { text: 'Admit it, but note that the delay automatically weakens her credibility.', weight: 0.5 },
    ],
  },
  {
    key: 'case-320',
    type: 'case_study',
    difficulty: 'hard',
    actReference: 'Section 13',
    body:
      "The Internal Committee finds the complaint proved and recommends the respondent's demotion and a written apology. Leadership wants to ignore it because he is a top biller. The employer must:",
    options: [
      {
        text: "Act on the committee's recommendations within 60 days; non-implementation is itself a contravention and is appealable.",
        weight: 1,
      },
      { text: 'Treat the recommendation as advisory and decide on business value.', weight: 0 },
      { text: 'Refer the recommendation back to the committee until it softens.', weight: 0 },
      { text: 'Implement only the apology and quietly drop the demotion.', weight: 0.5 },
    ],
  },

  // ── Simulations — decision path, impact-rated (2) ───────────────────────
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
            text: "Agree to fast-track and skip the respondent's written reply to save time.",
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

/* Idempotent sync of the curated bank into MongoDB. Safe to call on every
   startup: it retires the legacy prototype bank once, and only runs the
   per-question upserts until the curated set is fully present. Reversible —
   retiring sets `isActive: false`, it never deletes. */
export async function seedCuratedBank(): Promise<{ inserted: number; retired: number; total: number }> {
  // Retire the old prototype questions so papers draw only the curated set.
  const retire = await Question.updateMany(
    { tags: LEGACY_TAG, isActive: true },
    { $set: { isActive: false } },
  );
  const retired = retire.modifiedCount ?? 0;

  // Cheap guard: once every curated item carries BANK_TAG, skip the upserts.
  let inserted = 0;
  const present = await Question.countDocuments({ tags: BANK_TAG });
  if (present < CURATED_BANK.length) {
    for (const q of CURATED_BANK) {
      const { key, ...doc } = q;
      const tag = `seed:${key}`;
      const result = await Question.updateOne(
        { tags: tag },
        { $setOnInsert: { ...doc, tags: [tag, BANK_TAG], version: 1, isActive: true } },
        { upsert: true },
      );
      if (result.upsertedCount) inserted += 1;
    }
  }

  const total = await Question.countDocuments({ isActive: true });
  return { inserted, retired, total };
}
