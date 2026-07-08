import crypto from 'crypto';

function randomDigits(length: number): string {
  let out = '';
  while (out.length < length) out += crypto.randomInt(0, 10).toString();
  return out;
}

// Unambiguous alphabet (no 0/O, 1/I) for human-checked ID suffixes.
function randomSuffix(length: number): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return out;
}

export function newOrgCode(year: number): string {
  return `PC-ORG-${year}-${randomDigits(4)}`;
}

export function employeeCode(seq: number): string {
  return `EMP-${String(seq).padStart(4, '0')}`;
}

// PRD §3.1 shows CERT-YYYY-EMPnnnn, but §11 requires non-guessable IDs —
// the random suffix satisfies §11 while keeping the human-readable stem.
export function newCertId(year: number, empCode: string): string {
  return `CERT-${year}-${empCode.replace(/-/g, '')}-${randomSuffix(4)}`;
}

export function newCompId(year: number, orgCode: string): string {
  const orgPart = orgCode.split('-').pop() ?? 'ORG';
  return `COMP-${year}-ORG${orgPart}-${randomSuffix(4)}`;
}

// Organisation-level POSH Ready certificate (self-assessed readiness at 95%),
// deliberately prefixed differently from the audited COMP- so the two tiers
// are never confused (PRD §1.3 two-tier guardrail).
export function newReadyId(year: number, orgCode: string): string {
  const orgPart = orgCode.split('-').pop() ?? 'ORG';
  return `READY-${year}-ORG${orgPart}-${randomSuffix(4)}`;
}

export function newInviteToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Indian financial year: 1 Apr – 31 Mar (PRD §3.5 annual cycle).
export function currentCycle(date = new Date()): string {
  const startYear = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return `FY${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}
