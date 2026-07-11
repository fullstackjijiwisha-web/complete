/**
 * POSH Compass — Question Bank Seed Script
 * ==========================================
 * Populates the question bank with:
 *   - 30 MCQs (Multiple Choice Questions)
 *   - 25 FIBs (Fill in the Blanks)
 *   - 10 Case Studies (Weighted scoring)
 *
 * All questions are based on the POSH Act 2013, NCW guidelines, and IC procedures.
 *
 * Usage:
 *   node scripts/seed-questions.mjs
 *   # or with ts-node:
 *   npx tsx scripts/seed-questions.mjs
 *
 * Idempotent: if questions already exist it reports how many were skipped.
 */

import 'dotenv/config';
import mongoose from 'mongoose';

// ── Minimal inline schema (mirrors question.model.ts) ──────────────────────
const questionSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    tags: [String],
    actReference: String,
    difficulty: { type: String, default: 'medium' },
    body: { type: String, required: true },
    options: [{ text: String, weight: Number }],
    blanks: [{ acceptedAnswers: [String] }],
    nodes: mongoose.Schema.Types.Mixed,
    isActive: { type: Boolean, default: true },
    version: { type: Number, default: 1 },
  },
  { timestamps: true },
);
const Question = mongoose.models.Question || mongoose.model('Question', questionSchema);

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  role: { type: String, required: true },
  passwordHash: { type: String, required: true }
});
const User = mongoose.models.User || mongoose.model('User', userSchema);

// ── MCQ Questions (30) ─────────────────────────────────────────────────────
const MCQ_QUESTIONS = [
  {
    body: 'The POSH Act, 2013 stands for the Prevention, Prohibition and Redressal of Sexual Harassment at ___ of Women.',
    options: [
      { text: 'Home', weight: 0 },
      { text: 'Workplace', weight: 1 },
      { text: 'Public spaces', weight: 0 },
      { text: 'Educational institutions', weight: 0 },
    ],
    actReference: 'POSH Act 2013, Short Title',
    difficulty: 'easy',
  },
  {
    body: 'The POSH Act, 2013 was notified on which date?',
    options: [
      { text: '9 December 2013', weight: 1 },
      { text: '9 March 2013', weight: 0 },
      { text: '1 April 2014', weight: 0 },
      { text: '26 January 2013', weight: 0 },
    ],
    actReference: 'POSH Act 2013, Commencement',
    difficulty: 'medium',
  },
  {
    body: 'Which Supreme Court judgment led to the enactment of the POSH Act?',
    options: [
      { text: 'Maneka Gandhi vs Union of India', weight: 0 },
      { text: 'Vishaka vs State of Rajasthan', weight: 1 },
      { text: 'Mary Roy vs State of Kerala', weight: 0 },
      { text: 'Indra Sawhney vs Union of India', weight: 0 },
    ],
    actReference: 'POSH Act 2013, Preamble',
    difficulty: 'medium',
  },
  {
    body: 'Under the POSH Act, an Internal Committee (IC) must be constituted by every organization with:',
    options: [
      { text: 'At least 50 employees', weight: 0 },
      { text: 'At least 10 employees', weight: 1 },
      { text: 'At least 100 employees', weight: 0 },
      { text: 'At least 25 employees', weight: 0 },
    ],
    actReference: 'POSH Act 2013, Section 4',
    difficulty: 'easy',
  },
  {
    body: 'Who must chair the Internal Committee (IC)?',
    options: [
      { text: 'The CEO or MD of the organization', weight: 0 },
      { text: 'A senior woman employee', weight: 1 },
      { text: 'An external expert nominated by the government', weight: 0 },
      { text: 'The HR Manager', weight: 0 },
    ],
    actReference: 'POSH Act 2013, Section 4(2)(a)',
    difficulty: 'easy',
  },
  {
    body: 'The IC must include at least one member from:',
    options: [
      { text: 'A government department', weight: 0 },
      { text: 'An NGO or association committed to the cause of women', weight: 1 },
      { text: 'A law firm', weight: 0 },
      { text: 'A women\'s college', weight: 0 },
    ],
    actReference: 'POSH Act 2013, Section 4(2)(c)',
    difficulty: 'medium',
  },
  {
    body: 'Within how many days of receiving a complaint must the IC complete its inquiry?',
    options: [
      { text: '30 days', weight: 0 },
      { text: '45 days', weight: 0 },
      { text: '60 days', weight: 1 },
      { text: '90 days', weight: 0 },
    ],
    actReference: 'POSH Act 2013, Section 11(4)',
    difficulty: 'medium',
  },
  {
    body: 'Within how many days must an aggrieved woman file a written complaint with the IC?',
    options: [
      { text: '30 days', weight: 0 },
      { text: '60 days', weight: 0 },
      { text: '3 months', weight: 1 },
      { text: '6 months', weight: 0 },
    ],
    actReference: 'POSH Act 2013, Section 9(1)',
    difficulty: 'medium',
  },
  {
    body: 'Which of the following is NOT listed as sexual harassment under the POSH Act?',
    options: [
      { text: 'Unwelcome physical contact', weight: 0 },
      { text: 'A request for sexual favours', weight: 0 },
      { text: 'A performance appraisal for poor work results', weight: 1 },
      { text: 'Sexually coloured remarks', weight: 0 },
    ],
    actReference: 'POSH Act 2013, Section 2(n)',
    difficulty: 'medium',
  },
  {
    body: 'The IC is empowered to recommend which of the following interim measures?',
    options: [
      { text: 'Transfer or grant leave to the aggrieved woman', weight: 1 },
      { text: 'Immediate dismissal of the respondent', weight: 0 },
      { text: 'Freezing the respondent\'s salary', weight: 0 },
      { text: 'Filing an FIR with the police', weight: 0 },
    ],
    actReference: 'POSH Act 2013, Section 12',
    difficulty: 'hard',
  },
  {
    body: 'The term "workplace" under the POSH Act includes:',
    options: [
      { text: 'Only the registered office of the employer', weight: 0 },
      { text: 'Any office, branch, or unit of the organization, including client sites', weight: 1 },
      { text: 'Only premises owned by the employer', weight: 0 },
      { text: 'Only locations within city limits', weight: 0 },
    ],
    actReference: 'POSH Act 2013, Section 2(o)',
    difficulty: 'medium',
  },
  {
    body: 'Which of the following is a valid act of sexual harassment under the POSH Act?',
    options: [
      { text: 'Denying a leave application for legitimate reasons', weight: 0 },
      { text: 'Making sexist jokes or innuendos', weight: 1 },
      { text: 'Assigning a new project to an employee', weight: 0 },
      { text: 'Issuing a disciplinary notice for absenteeism', weight: 0 },
    ],
    actReference: 'POSH Act 2013, Section 2(n)',
    difficulty: 'easy',
  },
  {
    body: 'An employer who fails to constitute an IC is liable to a fine of up to:',
    options: [
      { text: '₹10,000', weight: 0 },
      { text: '₹25,000', weight: 0 },
      { text: '₹50,000', weight: 1 },
      { text: '₹1,00,000', weight: 0 },
    ],
    actReference: 'POSH Act 2013, Section 26',
    difficulty: 'hard',
  },
  {
    body: 'What should an employee do first upon experiencing sexual harassment?',
    options: [
      { text: 'Immediately resign from the company', weight: 0 },
      { text: 'File a police complaint directly', weight: 0 },
      { text: 'Report to the Internal Committee (IC) or their manager', weight: 1 },
      { text: 'Post about it on social media', weight: 0 },
    ],
    actReference: 'POSH Act 2013, Section 9',
    difficulty: 'easy',
  },
  {
    body: 'Which of the following best defines "quid pro quo" harassment?',
    options: [
      { text: 'Creating a hostile work environment through repeated comments', weight: 0 },
      { text: 'Exchanging sexual favours for employment benefits or threats of adverse action', weight: 1 },
      { text: 'Physical touching without consent', weight: 0 },
      { text: 'Sending unsolicited images electronically', weight: 0 },
    ],
    actReference: 'POSH Act 2013, Section 2(n)',
    difficulty: 'medium',
  },
  {
    body: 'The POSH Act applies to which of the following?',
    options: [
      { text: 'Only women employees in private companies', weight: 0 },
      { text: 'All women — employees, trainees, interns, daily wagers — in all sectors', weight: 1 },
      { text: 'Only permanent employees of government organizations', weight: 0 },
      { text: 'Only employees earning above a salary threshold', weight: 0 },
    ],
    actReference: 'POSH Act 2013, Section 2(a), 2(f)',
    difficulty: 'medium',
  },
  {
    body: 'What is the primary purpose of an annual POSH awareness program?',
    options: [
      { text: 'To fulfill a legal requirement without real effect', weight: 0 },
      { text: 'To build knowledge, sensitize employees, and prevent harassment', weight: 1 },
      { text: 'To identify complainants in the organization', weight: 0 },
      { text: 'To train the IC on legal procedures only', weight: 0 },
    ],
    actReference: 'POSH Act 2013, Section 19(b)',
    difficulty: 'easy',
  },
  {
    body: 'An employee who makes a false or malicious complaint may face:',
    options: [
      { text: 'Criminal prosecution under IPC', weight: 0 },
      { text: 'Action as per the organization\'s service rules', weight: 1 },
      { text: 'Immediate arrest', weight: 0 },
      { text: 'No consequences under the POSH Act', weight: 0 },
    ],
    actReference: 'POSH Act 2013, Section 14',
    difficulty: 'hard',
  },
  {
    body: 'What is "hostile work environment" harassment?',
    options: [
      { text: 'Physical assault in the workplace', weight: 0 },
      { text: 'Conduct that unreasonably interferes with an employee\'s work performance through intimidation, ridicule, or insult', weight: 1 },
      { text: 'A conflict between two employees over work tasks', weight: 0 },
      { text: 'Strict disciplinary action by a manager', weight: 0 },
    ],
    actReference: 'POSH Act 2013, Section 3(2)',
    difficulty: 'medium',
  },
  {
    body: 'The IC must submit an annual report to the employer by:',
    options: [
      { text: '31 March', weight: 0 },
      { text: '31 December', weight: 1 },
      { text: '30 June', weight: 0 },
      { text: '30 September', weight: 0 },
    ],
    actReference: 'POSH Act 2013, Section 21',
    difficulty: 'hard',
  },
  {
    body: 'Which of the following is NOT an employer obligation under the POSH Act?',
    options: [
      { text: 'Displaying information about the POSH Act', weight: 0 },
      { text: 'Providing safe working conditions', weight: 0 },
      { text: 'Preparing and sharing the IC inquiry report with all employees', weight: 1 },
      { text: 'Organizing annual awareness programs', weight: 0 },
    ],
    actReference: 'POSH Act 2013, Section 19',
    difficulty: 'hard',
  },
  {
    body: 'If an organization has offices in multiple cities, how many ICs must it constitute?',
    options: [
      { text: 'One central IC at the head office', weight: 0 },
      { text: 'One IC at each office or administrative unit with 10 or more employees', weight: 1 },
      { text: 'One IC per state', weight: 0 },
      { text: 'One IC per department', weight: 0 },
    ],
    actReference: 'POSH Act 2013, Section 4(1)',
    difficulty: 'medium',
  },
  {
    body: 'Confidentiality in POSH proceedings refers to:',
    options: [
      { text: 'Keeping the complaint secret from the respondent', weight: 0 },
      { text: 'Not disclosing the identity of the aggrieved person, respondent, or witnesses to the press or public', weight: 1 },
      { text: 'Refusing to share IC findings with the employer', weight: 0 },
      { text: 'Conducting the inquiry in a closed room only', weight: 0 },
    ],
    actReference: 'POSH Act 2013, Section 16',
    difficulty: 'medium',
  },
  {
    body: 'An IC member\'s term is how many years?',
    options: [
      { text: '1 year', weight: 0 },
      { text: '2 years', weight: 0 },
      { text: '3 years', weight: 1 },
      { text: '5 years', weight: 0 },
    ],
    actReference: 'POSH Act 2013, Section 4(3)',
    difficulty: 'medium',
  },
  {
    body: 'When can the IC extend the complaint filing period beyond 3 months?',
    options: [
      { text: 'Never — the 3-month period is absolute', weight: 0 },
      { text: 'If the complainant demonstrates sufficient cause for the delay', weight: 1 },
      { text: 'Only if the respondent consents', weight: 0 },
      { text: 'Only if the employer approves the extension', weight: 0 },
    ],
    actReference: 'POSH Act 2013, Section 9(1)',
    difficulty: 'hard',
  },
  {
    body: 'Which government body is responsible for maintaining a list of empanelled NGO members for Local Committees?',
    options: [
      { text: 'The Ministry of Women and Child Development', weight: 0 },
      { text: 'The District Officer designated by the state government', weight: 1 },
      { text: 'The National Commission for Women', weight: 0 },
      { text: 'The State Women\'s Commission', weight: 0 },
    ],
    actReference: 'POSH Act 2013, Section 7',
    difficulty: 'hard',
  },
  {
    body: 'Sexual harassment by a person in a position of authority is especially serious because it may involve:',
    options: [
      { text: 'Financial fraud', weight: 0 },
      { text: 'An implicit or explicit threat to employment or work conditions', weight: 1 },
      { text: 'Violation of intellectual property rights', weight: 0 },
      { text: 'Breach of company data policies', weight: 0 },
    ],
    actReference: 'POSH Act 2013, Section 2(n)',
    difficulty: 'medium',
  },
  {
    body: 'Can a male employee file a complaint under the POSH Act?',
    options: [
      { text: 'Yes, under any circumstances', weight: 0 },
      { text: 'No, the POSH Act only protects women', weight: 1 },
      { text: 'Yes, but only against female harassers', weight: 0 },
      { text: 'Yes, through the Local Committee only', weight: 0 },
    ],
    actReference: 'POSH Act 2013, Section 2(a), 2(n)',
    difficulty: 'easy',
  },
  {
    body: 'The IC must send its inquiry report to the employer within:',
    options: [
      { text: '7 days of completing the inquiry', weight: 0 },
      { text: '10 days of completing the inquiry', weight: 1 },
      { text: '30 days of completing the inquiry', weight: 0 },
      { text: '60 days of completing the inquiry', weight: 0 },
    ],
    actReference: 'POSH Act 2013, Section 13(1)',
    difficulty: 'hard',
  },
  {
    body: 'Which of the following situations could constitute sexual harassment via digital means?',
    options: [
      { text: 'Sending a project update email after work hours', weight: 0 },
      { text: 'Forwarding explicit or unwanted sexual content via messaging apps', weight: 1 },
      { text: 'Scheduling a video call for a team meeting', weight: 0 },
      { text: 'Sharing a work-related document on a shared drive', weight: 0 },
    ],
    actReference: 'POSH Act 2013, Section 2(n)',
    difficulty: 'easy',
  },
];

// ── Fill-in-the-Blanks Questions (25) ──────────────────────────────────────
const FIB_QUESTIONS = [
  {
    body: 'The POSH Act, 2013 was enacted to provide protection against sexual harassment of women at ___.',
    blanks: [{ acceptedAnswers: ['workplace', 'the workplace', 'work place'] }],
    difficulty: 'easy',
  },
  {
    body: 'The landmark Supreme Court judgment that preceded the POSH Act was ___ vs State of Rajasthan.',
    blanks: [{ acceptedAnswers: ['vishaka', 'Vishaka', 'VISHAKA'] }],
    actReference: 'POSH Act 2013, Preamble',
    difficulty: 'medium',
  },
  {
    body: 'An IC must be constituted by every employer with ___ or more employees.',
    blanks: [{ acceptedAnswers: ['10', 'ten'] }],
    actReference: 'POSH Act 2013, Section 4',
    difficulty: 'easy',
  },
  {
    body: 'The IC must be chaired by a senior ___ employee of the organisation.',
    blanks: [{ acceptedAnswers: ['woman', 'female', 'women'] }],
    actReference: 'POSH Act 2013, Section 4(2)(a)',
    difficulty: 'easy',
  },
  {
    body: 'An aggrieved woman must file a complaint within ___ months from the date of the last incident.',
    blanks: [{ acceptedAnswers: ['3', 'three'] }],
    actReference: 'POSH Act 2013, Section 9',
    difficulty: 'easy',
  },
  {
    body: 'The IC must complete its inquiry within ___ days of receiving the complaint.',
    blanks: [{ acceptedAnswers: ['60', 'sixty'] }],
    actReference: 'POSH Act 2013, Section 11(4)',
    difficulty: 'medium',
  },
  {
    body: 'The IC must send its report to the employer within ___ days of completing the inquiry.',
    blanks: [{ acceptedAnswers: ['10', 'ten'] }],
    actReference: 'POSH Act 2013, Section 13(1)',
    difficulty: 'medium',
  },
  {
    body: 'Failure to constitute an IC attracts a fine of up to ₹___ under the POSH Act.',
    blanks: [{ acceptedAnswers: ['50000', '50,000', '50 000'] }],
    actReference: 'POSH Act 2013, Section 26',
    difficulty: 'hard',
  },
  {
    body: 'Sexual harassment that involves a threat to employment in exchange for sexual favours is called ___ pro quo harassment.',
    blanks: [{ acceptedAnswers: ['quid', 'QUID'] }],
    actReference: 'POSH Act 2013, Section 2(n)',
    difficulty: 'medium',
  },
  {
    body: 'Harassment that creates an intimidating, hostile, or offensive work environment is called ___ work environment harassment.',
    blanks: [{ acceptedAnswers: ['hostile', 'a hostile'] }],
    actReference: 'POSH Act 2013, Section 3(2)',
    difficulty: 'medium',
  },
  {
    body: 'An IC member\'s term of office is ___ years.',
    blanks: [{ acceptedAnswers: ['3', 'three'] }],
    actReference: 'POSH Act 2013, Section 4(3)',
    difficulty: 'medium',
  },
  {
    body: 'The IC must include at least one member from an ___ or association committed to the cause of women or who is familiar with issues of sexual harassment.',
    blanks: [{ acceptedAnswers: ['NGO', 'ngo', 'non-governmental organisation', 'non-governmental organization'] }],
    actReference: 'POSH Act 2013, Section 4(2)(c)',
    difficulty: 'medium',
  },
  {
    body: 'The IC must prepare an ___ report to be submitted to the employer and the District Officer by 31 December each year.',
    blanks: [{ acceptedAnswers: ['annual', 'Annual'] }],
    actReference: 'POSH Act 2013, Section 21',
    difficulty: 'medium',
  },
  {
    body: 'Disclosing the contents of a complaint or inquiry to the media or public is punishable under Section ___ of the POSH Act.',
    blanks: [{ acceptedAnswers: ['17', 'Section 17'] }],
    actReference: 'POSH Act 2013, Section 17',
    difficulty: 'hard',
  },
  {
    body: 'Under the POSH Act, the term "aggrieved woman" means a ___ of any age, employed or not, who alleges to have been subjected to sexual harassment.',
    blanks: [{ acceptedAnswers: ['woman', 'female'] }],
    actReference: 'POSH Act 2013, Section 2(a)',
    difficulty: 'easy',
  },
  {
    body: 'During inquiry proceedings, the IC has the powers of a ___ court for summoning witnesses and documents.',
    blanks: [{ acceptedAnswers: ['civil', 'Civil'] }],
    actReference: 'POSH Act 2013, Section 11(3)',
    difficulty: 'hard',
  },
  {
    body: 'An employer who does not implement the IC\'s recommendations can be penalised under Section ___ of the POSH Act.',
    blanks: [{ acceptedAnswers: ['26', 'Section 26'] }],
    actReference: 'POSH Act 2013, Section 26',
    difficulty: 'hard',
  },
  {
    body: 'Unwelcome conduct of a sexual nature that is a condition of employment or affects employment decisions is called ___ sexual harassment.',
    blanks: [{ acceptedAnswers: ['quid pro quo', 'Quid Pro Quo', 'QUID PRO QUO'] }],
    actReference: 'POSH Act 2013, Section 2(n)',
    difficulty: 'medium',
  },
  {
    body: 'Every organisation must display the penal consequences of sexual harassment at the ___ of the organisation.',
    blanks: [{ acceptedAnswers: ['workplace', 'the workplace', 'work place'] }],
    actReference: 'POSH Act 2013, Section 19(b)',
    difficulty: 'easy',
  },
  {
    body: 'In organisations with less than 10 employees, complaints are handled by the ___ Committee.',
    blanks: [{ acceptedAnswers: ['Local', 'local', 'LC', 'Local Complaints'] }],
    actReference: 'POSH Act 2013, Section 6',
    difficulty: 'medium',
  },
  {
    body: 'A repeated second violation of the POSH Act by an employer can result in ___ of their business licence or registration.',
    blanks: [{ acceptedAnswers: ['cancellation', 'revocation', 'cancellation or revocation'] }],
    actReference: 'POSH Act 2013, Section 26(3)',
    difficulty: 'hard',
  },
  {
    body: 'The POSH Act covers all women regardless of whether they are ___, contractual, temporary, part-time, or daily wagers.',
    blanks: [{ acceptedAnswers: ['permanent', 'regular'] }],
    actReference: 'POSH Act 2013, Section 2(f)',
    difficulty: 'easy',
  },
  {
    body: 'An employer must assist the aggrieved woman in filing a ___ complaint if the sexual harassment is also a criminal offence.',
    blanks: [{ acceptedAnswers: ['police', 'FIR', 'criminal'] }],
    actReference: 'POSH Act 2013, Section 19(i)',
    difficulty: 'hard',
  },
  {
    body: 'The IC must try to settle the complaint through ___ before proceeding with a formal inquiry, if the aggrieved woman requests it.',
    blanks: [{ acceptedAnswers: ['conciliation', 'mediation', 'conciliation or mediation'] }],
    actReference: 'POSH Act 2013, Section 10',
    difficulty: 'medium',
  },
  {
    body: 'A person who makes a ___ or malicious complaint under the POSH Act can face action under service rules.',
    blanks: [{ acceptedAnswers: ['false', 'False', 'malicious'] }],
    actReference: 'POSH Act 2013, Section 14',
    difficulty: 'medium',
  },
];

// ── Case Study Questions (10) ───────────────────────────────────────────────
const CASE_STUDY_QUESTIONS = [
  {
    body: `CASE STUDY: Riya is a junior analyst at a consulting firm. Her male manager frequently sends her late-night messages complimenting her appearance and asking her to "spend time together" outside work. Riya is uncomfortable and her work is suffering. She asks her colleague Meena for advice.

What is the BEST course of action Riya should take?`,
    options: [
      { text: 'File a written complaint with the Internal Committee (IC), documenting the messages as evidence', weight: 1 },
      { text: 'Ignore the messages and hope the behaviour stops on its own', weight: 0 },
      { text: 'Confront her manager publicly in a team meeting', weight: 0.5 },
      { text: 'Resign from the company immediately', weight: 0 },
    ],
    difficulty: 'medium',
  },
  {
    body: `CASE STUDY: Amit, a team leader, frequently tells jokes of a sexual nature during team meetings. Several female employees feel uncomfortable but no one has formally complained. A new female employee, Priya, reports the behaviour to HR.

HR should:`,
    options: [
      { text: 'Dismiss it as "office banter" since no formal complaint has been filed', weight: 0 },
      { text: 'Counsel Amit informally and refer the matter to the IC for awareness, given multiple employees are affected', weight: 1 },
      { text: 'Ask Priya to get signatures from other employees before acting', weight: 0 },
      { text: 'Transfer Priya to another team', weight: 0 },
    ],
    difficulty: 'medium',
  },
  {
    body: `CASE STUDY: Sunita, a senior manager, submits a POSH complaint against Rohit, a junior employee. Rohit's friends in the team begin ostracizing Sunita and spreading rumours that she is lying.

The IC should:`,
    options: [
      { text: 'Treat Sunita\'s seniority as evidence that her complaint is likely false', weight: 0 },
      { text: 'Investigate the complaint impartially and recommend interim protective action for Sunita, including addressing the victimization by Rohit\'s colleagues', weight: 1 },
      { text: 'Wait for Sunita to prove her complaint before taking any action', weight: 0.5 },
      { text: 'Ask Sunita to first attempt a friendly resolution with Rohit', weight: 0 },
    ],
    difficulty: 'hard',
  },
  {
    body: `CASE STUDY: A client of XYZ Ltd. sexually harasses Kavita, an employee of XYZ Ltd., during an on-site visit. Kavita files a complaint with XYZ Ltd.'s IC.

Does the POSH Act apply here?`,
    options: [
      { text: 'No — the harasser is not an employee of XYZ Ltd.', weight: 0 },
      { text: 'Yes — the POSH Act covers harassment by third parties including clients at any location where work is performed', weight: 1 },
      { text: 'Only if the incident occurred at XYZ Ltd.\'s registered office', weight: 0 },
      { text: 'Only if Kavita can prove she explicitly refused the client\'s advances', weight: 0 },
    ],
    difficulty: 'hard',
  },
  {
    body: `CASE STUDY: During a company-organised team outing at a restaurant, a male colleague grabs a female colleague's arm and makes an obscene comment. The female colleague complains to the IC.

Is this covered under the POSH Act?`,
    options: [
      { text: 'No — the incident occurred outside company premises', weight: 0 },
      { text: 'Yes — workplace includes any location connected with work, including company-organised events', weight: 1 },
      { text: 'Only if the company officially sponsored the event with a formal budget', weight: 0.5 },
      { text: 'No — the restaurant is a public place, not a workplace', weight: 0 },
    ],
    difficulty: 'medium',
  },
  {
    body: `CASE STUDY: Meera filed a POSH complaint 5 months after the last incident, citing severe psychological distress that prevented her from acting earlier. The IC is considering whether to accept the complaint.

What should the IC do?`,
    options: [
      { text: 'Reject the complaint — the 3-month deadline is absolute', weight: 0 },
      { text: 'Accept the complaint after recording the reasons for the delay, as "sufficient cause" (like psychological distress) can justify extension', weight: 1 },
      { text: 'Accept the complaint only if Meera provides a medical certificate', weight: 0.5 },
      { text: 'Ask Meera to re-file from the date she made this request', weight: 0 },
    ],
    difficulty: 'hard',
  },
  {
    body: `CASE STUDY: A manager tells a female employee during her performance review: "Your promotion depends on how cooperative you are with me." The employee understands this as a sexual advance. She reports it to the IC.

This is an example of:`,
    options: [
      { text: 'Hostile work environment harassment', weight: 0 },
      { text: 'Quid pro quo harassment — conditioning employment benefits on compliance with sexual demands', weight: 1 },
      { text: 'Normal managerial communication about performance expectations', weight: 0 },
      { text: 'An ambiguous statement that requires more evidence before any conclusion', weight: 0 },
    ],
    difficulty: 'medium',
  },
  {
    body: `CASE STUDY: The IC completes its inquiry and concludes that the complaint against Deepak was proven. The IC recommends a written warning and 1-month salary deduction. Deepak's department head refuses to implement the recommendation, saying Deepak is "too valuable to punish."

What should happen next?`,
    options: [
      { text: 'The IC decision is advisory — the department head can override it', weight: 0 },
      { text: 'The employer is legally required to implement the IC\'s recommendations; failure is a violation of the POSH Act', weight: 1 },
      { text: 'The IC must revise its recommendation to be more lenient', weight: 0 },
      { text: 'Deepak should be given a chance to appeal before implementation', weight: 0.5 },
    ],
    difficulty: 'hard',
  },
  {
    body: `CASE STUDY: An employee, Rahul, is accused of sexual harassment. During the IC inquiry, the IC panel discloses the name of the complainant, Divya, to Rahul's friends in the department. Divya learns of this and feels victimized.

Which violation has occurred?`,
    options: [
      { text: 'No violation — the respondent is entitled to know the complainant\'s identity', weight: 0 },
      { text: 'A breach of confidentiality under Section 16 of the POSH Act', weight: 1 },
      { text: 'A violation of data protection laws only, not the POSH Act', weight: 0 },
      { text: 'The IC acted correctly by keeping the respondent informed', weight: 0 },
    ],
    difficulty: 'hard',
  },
  {
    body: `CASE STUDY: An organisation has 8 employees. A female employee reports sexual harassment by a colleague to the HR manager. The organisation does not have an Internal Committee because it has fewer than 10 employees.

What is the correct course of action?`,
    options: [
      { text: 'The HR manager can handle the complaint informally since they have no IC', weight: 0 },
      { text: 'The complaint must be referred to the Local Committee (LC) constituted by the District Officer', weight: 1 },
      { text: 'The employee must file a police complaint directly — the POSH Act does not apply to small organisations', weight: 0 },
      { text: 'The organisation must immediately constitute an IC even though it has fewer than 10 employees', weight: 0.5 },
    ],
    difficulty: 'medium',
  },
];

// ── Seed logic ──────────────────────────────────────────────────────────────
async function seed() {
  let uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI is not set in .env');
    process.exit(1);
  }

  let mongod = null;
  const isDev = uri.includes('localhost') || uri.includes('127.0.0.1');
  if (isDev) {
    try {
      console.log('Starting in-memory MongoDB server with persistent storage...');
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      mongod = await MongoMemoryServer.create({
        instance: {
          dbPath: './mongodb-data',
          storageEngine: 'wiredTiger',
        },
      });
      uri = mongod.getUri();
      console.log(`In-memory MongoDB server started at ${uri}`);
    } catch (err) {
      console.warn('Failed to start in-memory MongoDB, attempting direct connection:', err.message);
    }
  }

  console.log('Connecting to MongoDB…');
  await mongoose.connect(uri);
  console.log('Connected. Seeding question bank…\n');

  let created = 0;
  let skipped = 0;

  async function upsertQuestions(questions, type) {
    for (const q of questions) {
      // Idempotent: match on body + type to avoid duplicates
      const existing = await Question.findOne({ body: q.body, type });
      if (existing) {
        skipped++;
        continue;
      }
      await Question.create({
        type,
        tags: ['posh-act-2013'],
        actReference: q.actReference ?? 'POSH Act 2013',
        difficulty: q.difficulty ?? 'medium',
        body: q.body,
        ...(type === 'mcq' || type === 'case_study' ? { options: q.options } : {}),
        ...(type === 'fib' ? { blanks: q.blanks } : {}),
        isActive: true,
        version: 1,
      });
      created++;
    }
  }

  await upsertQuestions(MCQ_QUESTIONS, 'mcq');
  console.log(`MCQ: done`);

  await upsertQuestions(FIB_QUESTIONS, 'fib');
  console.log(`FIB: done`);

  await upsertQuestions(CASE_STUDY_QUESTIONS, 'case_study');
  console.log(`Case Studies: done`);

  const counts = await Question.aggregate([
    { $group: { _id: '$type', count: { $sum: 1 } } },
  ]);
  console.log('\n── Question Bank Summary ──────────────────');
  counts.forEach((c) => console.log(`  ${c._id}: ${c.count}`));
  console.log(`\n✅ Created: ${created} | Skipped (already exist): ${skipped}`);

  // Create Super Admin if configured in .env
  if (process.env.SUPER_ADMIN_EMAIL && process.env.SUPER_ADMIN_PASSWORD) {
    const email = process.env.SUPER_ADMIN_EMAIL.toLowerCase();
    const existingAdmin = await User.findOne({ email });
    if (!existingAdmin) {
      const bcrypt = await import('bcryptjs');
      const passwordHash = await bcrypt.default.hash(process.env.SUPER_ADMIN_PASSWORD, 12);
      await User.create({
        email,
        name: 'Super Admin',
        role: 'super_admin',
        passwordHash
      });
      console.log(`✅ Super Admin created: ${email}`);
    } else {
      console.log(`ℹ️ Super Admin already exists: ${email}`);
    }
  }

  await mongoose.disconnect();
  if (mongod) {
    await mongod.stop();
  }
  console.log('\nDone. Database connection closed.');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
