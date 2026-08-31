import { Question } from '../questions/question.model';
import { canonicalAnswer, fibBlankMatches, NUMBER_WORDS } from './scoring.service';
import { buildZip } from '../../utils/zip';

/**
 * Builds a Word document listing every answer accepted for every live
 * fill-in-the-blank question.
 *
 * The lists are not written by hand and they are not a description of the
 * rules: every candidate below is put through `fibBlankMatches` — the very
 * function that marks the assessment — and kept only if it actually passes. If
 * the matcher ever changes, this document changes with it, and it cannot claim
 * something is accepted when it is not.
 *
 * Two of the accepted sets are genuinely endless and are stated as rules rather
 * than listed: any capitalisation, and any wording that contains the answer
 * ("the Vishaka guidelines"). Everything else is enumerated in full.
 */

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

function titleCase(value: string): string {
  return value.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** Every arrangement of the separators inside a key: SHE-BOX, SHE BOX, SHEBOX. */
function spacingVariants(key: string): string[] {
  const parts = key.split(/[^A-Za-z0-9ऀ-ॿ]+/).filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return [];
  const separators = ['', ' ', '-', '.', '/'];
  let out = [parts[0]!];
  for (let i = 1; i < parts.length; i++) {
    const next: string[] = [];
    for (const prefix of out) for (const sep of separators) next.push(prefix + sep + parts[i]);
    out = next;
  }
  return out;
}

/** Every notation for a number: words, Roman, Hindi, Devanagari, restatements. */
function numberVariants(digits: string): string[] {
  const names = Object.entries(NUMBER_WORDS)
    .filter(([, value]) => value === digits)
    .map(([word]) => word);

  const out: string[] = [digits];
  for (const name of names) {
    out.push(name, name.toUpperCase(), titleCase(name));
    out.push(`(${name})`, `${name}.`, `${name})`);
  }
  out.push(`(${digits})`, `${digits}.`, `${digits})`);
  // Devanagari digits, one glyph per ASCII digit.
  out.push(digits.replace(/\d/g, (d) => String.fromCharCode(0x0966 + Number(d))));
  // The same number said twice for clarity: "1 (one)", "one (1)", "4 - four".
  for (const name of names) {
    out.push(`${digits} (${name})`, `${name} (${digits})`, `${digits} - ${name}`);
  }
  return out;
}

/**
 * A number sitting inside a longer answer, written every other way:
 * "90 days" -> "ninety days", "9० days" and so on.
 */
function numberPhraseVariants(key: string): string[] {
  const match = key.match(/\d+/);
  if (!match) return [];
  const digits = String(Number(match[0]));
  const out: string[] = [];
  for (const [word, value] of Object.entries(NUMBER_WORDS)) {
    if (value !== digits) continue;
    out.push(
      key.replace(/\d+/, word),
      key.replace(/\d+/, titleCase(word)),
      key.replace(/\d+/, word.toUpperCase()),
    );
  }
  out.push(
    key.replace(/\d+/, (run) =>
      run.replace(/\d/g, (d) => String.fromCharCode(0x0966 + Number(d))),
    ),
  );
  return out;
}

/**
 * The same name written another way in the Latin alphabet: the optional
 * aspiration h after a consonant, and single or doubled letters.
 */
function spellingStep(key: string): string[] {
  const out = new Set<string>();
  const lower = key.toLowerCase();

  for (let i = 0; i < lower.length; i++) {
    const ch = lower[i]!;
    // Drop an aspiration h, or add one after a consonant that can take it.
    if (ch === 'h' && i > 0 && /[bcdgjkpstz]/.test(lower[i - 1]!)) {
      out.add(lower.slice(0, i) + lower.slice(i + 1));
    }
    if (/[bcdgjkpstz]/.test(ch) && lower[i + 1] !== 'h') {
      out.add(lower.slice(0, i + 1) + 'h' + lower.slice(i + 1));
    }
    // Double a letter, or collapse a doubled one.
    if (/[a-z]/.test(ch)) {
      out.add(lower.slice(0, i) + ch + lower.slice(i));
      if (lower[i + 1] === ch) out.add(lower.slice(0, i) + lower.slice(i + 1));
    }
  }
  return [...out];
}

/**
 * Applies those rewrites twice, because the interesting spellings need two
 * moves: "Vishaka" reaches "Visakha" only by dropping one aspiration h and
 * adding another. Anything the rewrites overshoot is discarded by the matcher
 * afterwards, so a wider net here costs nothing but time.
 */
function spellingVariants(key: string): string[] {
  const first = spellingStep(key);
  const out = new Set(first);
  if (first.length <= 80) {
    for (const variant of first) for (const deeper of spellingStep(variant)) out.add(deeper);
  }
  out.delete(key.toLowerCase());
  return [...out];
}

/** Every string one edit away: a dropped, doubled, swapped or added letter. */
function typoVariants(key: string): string[] {
  const out = new Set<string>();
  const lower = key.toLowerCase();
  for (let i = 0; i < lower.length; i++) {
    out.add(lower.slice(0, i) + lower.slice(i + 1)); // dropped
    for (const letter of LETTERS) {
      out.add(lower.slice(0, i) + letter + lower.slice(i + 1)); // mistyped
      out.add(lower.slice(0, i) + letter + lower.slice(i)); // added
    }
  }
  for (const letter of LETTERS) out.add(lower + letter);
  out.delete(lower);
  return [...out];
}

export interface KeyGroup {
  title: string;
  note?: string;
  items: string[];
}

export interface BlankReport {
  blankIndex: number;
  storedKeys: string[];
  groups: KeyGroup[];
  total: number;
}

export interface QuestionReport {
  body: string;
  actReference?: string;
  blanks: BlankReport[];
}

/** Enumerates and verifies every accepted answer for one blank. */
export function reportForBlank(acceptedAnswers: string[], blankIndex: number): BlankReport {
  const seen = new Set(acceptedAnswers.map((a) => a.toLowerCase()));
  const accepts = (value: string) => fibBlankMatches(acceptedAnswers, value);

  const keep = (candidates: string[]): string[] => {
    const out: string[] = [];
    for (const candidate of candidates) {
      const lower = candidate.toLowerCase();
      if (seen.has(lower) || !candidate.trim()) continue;
      if (!accepts(candidate)) continue; // the matcher itself is the authority
      seen.add(lower);
      out.push(candidate);
    }
    return out.sort((a, b) => a.localeCompare(b));
  };

  const groups: KeyGroup[] = [];
  const capitals: string[] = [];
  const spacing: string[] = [];
  const articles: string[] = [];
  const numbers: string[] = [];
  const spellings: string[] = [];
  const typos: string[] = [];

  for (const key of acceptedAnswers) {
    capitals.push(key.toUpperCase(), key.toLowerCase(), titleCase(key));
    spacing.push(...spacingVariants(key));
    articles.push(`the ${key}`, `a ${key}`, `an ${key}`);

    const canonical = canonicalAnswer(key);
    if (/^\d+$/.test(canonical)) {
      numbers.push(...numberVariants(canonical));
    } else {
      numbers.push(...numberPhraseVariants(key));
      spellings.push(...spellingVariants(key));
      if (canonical.length >= 5) typos.push(...typoVariants(key));
    }
  }

  const push = (title: string, items: string[], note?: string) => {
    const kept = keep(items);
    if (kept.length) groups.push({ title, items: kept, ...(note ? { note } : {}) });
  };

  push(
    'Written in any case',
    capitals,
    'Capitals are ignored entirely, so every mix of upper and lower case is accepted — these are only the usual three.',
  );
  push('Spacing, hyphens and punctuation', spacing, 'Any punctuation between the words is ignored.');
  push('With a leading article', articles);
  push('The number in any notation', numbers);
  push('The same name spelled another way', spellings);
  push('With one letter wrong', typos, 'A single dropped, doubled, mistyped or added letter.');

  const total =
    acceptedAnswers.length + groups.reduce((sum, group) => sum + group.items.length, 0);
  return { blankIndex, storedKeys: acceptedAnswers, groups, total };
}

export async function buildAnswerKeyReport(): Promise<QuestionReport[]> {
  const questions = await Question.find({ type: 'fib', isActive: true })
    .select('body blanks actReference')
    .sort({ createdAt: 1 })
    .lean();

  return questions.map((q) => ({
    body: q.body,
    actReference: q.actReference,
    blanks: (q.blanks ?? []).map((blank, i) => reportForBlank(blank.acceptedAnswers, i)),
  }));
}

// ── Word document ────────────────────────────────────────────────────────

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function para(text: string, opts: { size?: number; bold?: boolean; after?: number; color?: string } = {}) {
  const { size = 20, bold = false, after = 80, color } = opts;
  return (
    `<w:p><w:pPr><w:spacing w:after="${after}"/></w:pPr>` +
    `<w:r><w:rPr><w:sz w:val="${size}"/>${bold ? '<w:b/>' : ''}` +
    `${color ? `<w:color w:val="${color}"/>` : ''}</w:rPr>` +
    `<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`
  );
}

function pageBreak() {
  return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
}

export function buildAnswerKeyDocx(report: QuestionReport[], generatedAt: Date): Buffer {
  const totalAccepted = report.reduce(
    (sum, q) => sum + q.blanks.reduce((s, b) => s + b.total, 0),
    0,
  );

  let body = '';
  body += para('POSH Compass — Fill-in-the-blank answer key', { size: 32, bold: true, after: 120 });
  body += para(
    `Every answer accepted for every live fill-in-the-blank question. ` +
      `${report.length} questions, ${totalAccepted.toLocaleString('en-IN')} accepted answers in total.`,
    { size: 20, after: 60 },
  );
  body += para(
    `Generated ${generatedAt.toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short' })}.`,
    { size: 18, color: '666666', after: 200 },
  );
  body += para('How to read this', { size: 24, bold: true, after: 60 });
  body += para(
    'Each list below was produced by running the actual marking function, not by describing it. ' +
      'An answer appears here only if the system genuinely accepts it.',
    { size: 20, after: 60 },
  );
  body += para(
    'Two of the accepted sets are endless and cannot be listed. First, capitalisation: every mix ' +
      'of upper and lower case is accepted, so only the three usual forms are shown. Second, extra ' +
      'words: any answer that contains the correct answer is accepted, so "the Vishaka guidelines" ' +
      'and "Vishaka Guidelines 1997" both pass wherever "Vishaka" does.',
    { size: 20, after: 60 },
  );
  body += para(
    'Numbers are the one place the system stays strict: 4 and 5 are not interchangeable, "40" is ' +
      'not "4", and "three months" is not "3", because the extra word changes what was said.',
    { size: 20, after: 200 },
  );

  report.forEach((q, qi) => {
    body += pageBreak();
    body += para(`Question ${qi + 1}${q.actReference ? ` — ${q.actReference}` : ''}`, {
      size: 26,
      bold: true,
      after: 60,
    });
    body += para(q.body, { size: 22, after: 140 });

    q.blanks.forEach((blank) => {
      const label =
        q.blanks.length > 1 ? `Blank ${blank.blankIndex + 1}` : 'Accepted answers';
      body += para(
        `${label} — answer key: ${blank.storedKeys.join(' / ')}`,
        { size: 22, bold: true, after: 60 },
      );
      body += para(
        `${blank.total.toLocaleString('en-IN')} accepted answers in total for this blank.`,
        { size: 18, color: '666666', after: 100 },
      );

      for (const group of blank.groups) {
        body += para(`${group.title} (${group.items.length})`, { size: 20, bold: true, after: 40 });
        if (group.note) body += para(group.note, { size: 18, color: '666666', after: 40 });
        body += para(group.items.join(',  '), { size: 18, after: 120 });
      }
    });
  });

  const document =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>` +
    '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>';

  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '</Types>';

  const rels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>';

  return buildZip([
    { name: '[Content_Types].xml', data: Buffer.from(contentTypes, 'utf8') },
    { name: '_rels/.rels', data: Buffer.from(rels, 'utf8') },
    { name: 'word/document.xml', data: Buffer.from(document, 'utf8') },
  ]);
}
