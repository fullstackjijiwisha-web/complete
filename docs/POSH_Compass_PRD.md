# POSH Compass — Product Requirements Document (PRD)

### DIY POSH Assessment, Certification & Compliance Platform · Jijiwisha Society

> **Version:** 1.0 · **Date:** 7 July 2026
> **Owner:** Pranav (Product & Design) · Jijiwisha Society, Lucknow
> **Base blueprint:** Full-Stack Project Blueprint & Prompt Sheet v2.2 (MERN + TypeScript)
> **Live marketing site:** https://jijiwishasociety.org/posh-compass/
> **Design references:** HR/Organisation Dashboard mock · Employee Dashboard mock (attached)
> **Tagline:** *Proof, Not Attendance.* — Assess · Prove · Get Certified · Get Compliant

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Users, Roles & Permissions](#2-users-roles--permissions)
3. [Certification Logic & Business Rules](#3-certification-logic--business-rules)
4. [Feature Requirements (Functional Spec)](#4-feature-requirements-functional-spec)
5. [Screen-by-Screen Spec (from Design Mocks)](#5-screen-by-screen-spec-from-design-mocks)
6. [Tech Stack](#6-tech-stack)
7. [Repository Structure](#7-repository-structure)
8. [Environment Variables](#8-environment-variables)
9. [Data Models](#9-data-models)
10. [API Documentation](#10-api-documentation)
11. [Backend Security & Compliance Checklist](#11-backend-security--compliance-checklist)
12. [Frontend Security Checklist](#12-frontend-security-checklist)
13. [Non-Functional Requirements](#13-non-functional-requirements)
14. [Analytics & Metric Definitions](#14-analytics--metric-definitions)
15. [Release Plan](#15-release-plan)
16. [Open Questions & Known Inconsistencies](#16-open-questions--known-inconsistencies)
17. [Master Build Prompt (AI Assistant Handoff)](#17-master-build-prompt-ai-assistant-handoff)

---

## 1. Product Overview

### 1.1 Problem

Under the POSH Act 2013, organisations must conduct annual awareness training and maintain a functioning Internal Committee (IC). In practice, most "compliance" is attendance-sheet theatre: a session is held, signatures are collected, and nothing is measured. When the NCW or a District Officer asks for evidence, organisations have sign-in sheets — not proof of understanding.

Jijiwisha Society currently delivers first-year POSH trainings directly. From **year 2 onwards**, organisations need a way to run their own trainings and assessments credibly, without Jijiwisha trainers on-site — while Jijiwisha retains the audit and final certification role.

### 1.2 Solution

POSH Compass is a self-serve digital platform where:

1. Organisations register and enrol their employees.
2. Employees take **online assessments** in four formats — MCQs, Fill-in-the-Blanks, Case Studies, and Simulations — each generating a timestamped evidence trail.
3. A **scoring engine** certifies each individual at **≥ 80%**.
4. When **≥ 95% of the organisation's employees are certified**, the organisation is automatically marked **POSH Ready** (a readiness status — explicitly *not* compliance).
5. POSH Ready organisations can **book an audit with Jijiwisha Society online**. After Jijiwisha verifies documentation, process, and the IC (in line with NCW expectations), Jijiwisha issues the **POSH Compliance Certificate**.
6. A **public dashboard** displays platform-wide impact: employees assessed, organisations POSH Ready, audits completed, and compliance certificates issued.

### 1.3 Product Principles

- **Proof, not attendance.** Every submission produces audit-grade evidence: scored responses, timestamps, decision paths, certificate IDs, and audit-log references.
- **Computed, not granted.** Certification and readiness are threshold-driven and automatic. No manual overrides, no grey zones. The same two rules apply to every organisation.
- **Two tiers, never conflated.** *POSH Ready* (self-assessed readiness) and *POSH Compliant* (Jijiwisha-audited) are distinct statuses with distinct visual identities. The platform must never let an organisation present POSH Ready as compliance.
- **Organisation-level only.** Readiness is tracked at organisation level. **Departmental breakdowns are deliberately not collected**, to protect individual confidentiality and avoid the legal exposure of department-level compliance scoring.
- **Evidence in one click.** The audit pack (scores, logs, IC records, policy documents) is exportable on demand.

### 1.4 Goals & Success Metrics

| Goal | Metric | Target (Year 1 of platform) |
|---|---|---|
| Enable DIY year-2+ trainings | Organisations onboarded | 50+ |
| Real assessment at scale | Employees assessed | 25,000+ |
| Individual certification | Certification rate among completed assessments | ≥ 85% |
| Organisational readiness | Organisations achieving POSH Ready | ≥ 60% of onboarded orgs |
| Audit conversion | POSH Ready orgs that book an audit | ≥ 50% |
| Revenue | Assessment revenue at ₹59–₹159 / employee | Per pricing page |
| Trust | Average client trust score | ≥ 4.5 / 5 |

### 1.5 Out of Scope (v1)

- LMS-style training content delivery (videos/modules) — v1 assumes the organisation runs its own refresher training; the platform *assesses*.
- Department-, team-, or manager-level score reporting (deliberate legal/confidentiality exclusion).
- Complaint management / IC case-tracking workflows.
- Multi-language assessments (Hindi assessment bank is a fast-follow — see §15).
- Native mobile apps (responsive web only).

---

## 2. Users, Roles & Permissions

### 2.1 Personas

| Persona | Who | Primary jobs-to-be-done |
|---|---|---|
| **Employee** | Any staff member of a registered organisation (e.g. *Priya Sharma, EMP-0384*) | Take assessments; see score and question review; download personal certificate |
| **HR Admin** (Org Admin) | HR / compliance owner at the organisation (e.g. *ABC Pvt. Ltd.*) | Enrol employees; monitor completion and readiness; trigger re-attempts; book audit; download audit pack |
| **Jijiwisha Auditor** | Jijiwisha Society staff | Review audit bookings; verify documentation, process & IC; record findings; issue POSH Compliance Certificates |
| **Jijiwisha Super Admin** | Platform owner | Manage question banks; manage organisations & pricing; publish public stats; user support |
| **Public Visitor** | Anyone | View marketing site, public impact dashboard, verify a certificate ID |

### 2.2 Role Matrix

| Capability | Employee | HR Admin | Auditor | Super Admin |
|---|---|---|---|---|
| Take assessment | ✅ (own) | ❌ | ❌ | ❌ |
| View own score / certificate | ✅ | ❌ | ❌ | ✅ (support) |
| View org aggregate dashboard | ❌ | ✅ (own org) | ✅ (assigned orgs) | ✅ |
| View individual employee scores | ❌ | ✅ (own org, list view) | ✅ (assigned org, audit context) | ✅ |
| Enrol / remove employees | ❌ | ✅ (own org) | ❌ | ✅ |
| Book / manage audit | ❌ | ✅ (own org, only when POSH Ready) | ✅ (schedule/assign) | ✅ |
| Record audit findings | ❌ | ❌ | ✅ | ✅ |
| Issue POSH Compliance Certificate | ❌ | ❌ | ✅ (with checklist complete) | ✅ |
| Manage question banks | ❌ | ❌ | ❌ | ✅ |
| View public dashboard | ✅ | ✅ | ✅ | ✅ |

**Permission rules (hard requirements):**

- An HR Admin can see *who has/hasn't completed* and *individual scores in a roster list*, but the UI must not provide department/team grouping, filtering, or export cuts (see §1.3, §3.6).
- Employees can never see other employees' scores.
- Auditors see org data only for audits assigned to them.
- All role checks enforced server-side via `roleGuard` middleware + `assertOwnership()` — never trust the client (blueprint §4, §6).

---

## 3. Certification Logic & Business Rules

This is the heart of the product. All thresholds are platform constants, configurable only by Super Admin via environment/config — never per-organisation.

### 3.1 Individual Certification — Threshold 80%

- An employee is **Certified** when their overall assessment score is **≥ 80%**.
- Score = weighted aggregate across the four formats (see §3.3).
- On certification: digital certificate is generated with **score, scenario IDs, certificate ID (`CERT-YYYY-EMPnnnn`), issue date, and audit-log reference**.
- Below 80% → **Not Certified**: re-training is flagged and a **re-attempt is scheduled** (HR Admin sets/approves the re-attempt window; question set is rotated — see §3.5).

### 3.2 Organisation Readiness — Threshold 95%

- **Readiness score** = (certified employees ÷ total enrolled employees) × 100, computed across the *active headcount* registered by the HR Admin.
- The score is **recomputed after every submission** (event-driven, not batch).
- When the readiness score **crosses 95%**, the platform **automatically records POSH Ready status** with a timestamp (e.g. *"POSH Ready · achieved 26 Jun 2026"*) and **unlocks audit booking**.
- POSH Ready is a **readiness declaration, not compliance**. All UI copy, certificates, and badges must state this distinction.

### 3.3 The Three Output States

| State | Condition | System actions |
|---|---|---|
| **State 1 — ✕ Not Certified** | Individual score < 80% | Re-training flag raised; re-attempt scheduled; no certificate |
| **State 2 — ✓ Certified Individual** | Individual score ≥ 80% | Certificate issued with evidence trail; counts toward org readiness |
| **State 3 — ★ Organisation POSH Ready** | ≥ 95% of enrolled employees certified | Status recorded with timestamp; POSH Ready badge on org dashboard; audit booking unlocked; org counted on public dashboard |

### 3.4 POSH Compliance (Tier 2) — Audit by Jijiwisha

- **Precondition:** organisation is POSH Ready.
- HR Admin books an audit online (slot selection + document upload).
- Jijiwisha Auditor verifies, per NCW-aligned checklist:
  1. **Documentation** — POSH policy, annual report filings, training/assessment records (the platform supplies assessment evidence automatically).
  2. **Process** — complaint-handling procedure, awareness measures, employer duties under §19 of the Act.
  3. **Internal Committee** — constitution (Presiding Officer, member composition, external member), tenure, and functioning.
- Audit states: `requested → scheduled → in_review → changes_requested → passed → certificate_issued` (or `failed` → remediation → re-audit).
- On pass, Jijiwisha issues the **POSH Compliance Certificate** (validity 12 months; `COMP-YYYY-ORGnnnn`), which appears on the org dashboard and increments the public "Audits completed / Compliant organisations" counters.
- The compliance certificate is issued by Jijiwisha Society as an expert body in line with NCW expectations; it is an audit attestation, **not** a statutory government certificate — copy must reflect this precisely.

### 3.5 Assessment & Scoring Rules

| Format | What it measures | Scoring | Evidence generated |
|---|---|---|---|
| **MCQs** | Knowledge — law, definitions, process | 1/0 per question | Scored response + timestamp per question |
| **Fill in the Blanks** | Recall — thresholds, timelines, committee rules, unprompted | Exact/normalised match against the Act (case/whitespace-insensitive; accepted-answers list per blank) | Exact response trace matched against the Act |
| **Case Studies** | Judgment — quality of decision, weighted options | Option weights (e.g. best = 1.0, acceptable = 0.5, poor = 0) | Judgment score with option-weight breakdown |
| **Simulations** | Applied decisions — branching scenarios | Decision-impact rating per choice, aggregated along the path | Full decision path + impact rating, audit-logged |

- **Default paper composition (v1):** 50 questions ≈ 30 MCQ / 10 FIB / 6 case study / 4 simulation, drawn randomly from the active question bank; total weighted to 100%. Composition is a Super Admin config.
- **Attempt rules:** timed (default 60 min, config), single sitting, auto-submit on timeout, autosave every answer, resume within grace window on disconnect.
- **Re-attempts:** unlimited count is a business decision (default: max 3 per cycle, then HR intervention); each re-attempt draws a **rotated question set** so the post-assessment answer review (§5.2) can't be memorised into a retake.
- **Integrity (proportionate, not oppressive):** question and option order shuffled per attempt; copy-paste disabled on FIB; server-side timing; one active session per employee. No webcam proctoring in v1.
- **Annual cycle:** certifications are tagged to a compliance year (e.g. FY 2026–27). A new cycle resets individual certification for the new year while preserving historical records; org readiness is per-cycle.

### 3.6 Confidentiality & Legal Guardrails (non-negotiable)

- **No department-level scoring anywhere** — not in DB aggregates exposed to org roles, not in exports, not in the audit pack. Rationale: department cuts in small teams can identify individuals and create internal legal exposure; readiness is an organisation-level claim. (This decision is already reflected in the dashboard mock's helper copy.)
- Individual question-level responses are visible only to the employee themself (and Super Admin support with logged access).
- Certificates are verifiable by ID via a public endpoint that returns only: name, org, status, score band (not raw score), issue date — nothing else.
- All personal data handling complies with the **DPDP Act 2023**: consent at enrolment, purpose limitation (assessment & compliance evidence), data-principal export & erasure requests (see §11).

---

## 4. Feature Requirements (Functional Spec)

### F1. Public Marketing Site & Public Impact Dashboard

- Existing marketing pages (home, how-it-works, assessment sample, audit, pricing) remain; the app adds a live **public stats strip / dashboard**:
  - Employees assessed across India
  - Organisations POSH Ready
  - Audits completed with Jijiwisha Society (and Compliance Certificates issued)
  - Average client trust score
- Counters are served from a cached aggregate endpoint (`GET /public/stats`, cache TTL 10 min) — never computed live per page view.
- **Certificate verification page:** enter `CERT-…` or `COMP-…` ID → validity + minimal details (§3.6).
- Sample assessment (5 questions, no login) as lead-gen, per the live site's "Try a Sample Assessment".

### F2. Organisation Registration & Onboarding

- HR Admin registers organisation: legal name, CIN/registration no., headcount, billing contact, HR admin account.
- Org receives a stable **Org ID** (`PC-ORG-YYYY-nnnn`, e.g. `PC-ORG-2026-4417` in the mock).
- Pricing tier selected (₹59–₹159/employee bands by volume); payment via gateway (Razorpay — see §6) before employee seats activate.
- **Employee enrolment:** CSV bulk upload (name, email, employee code) and/or individual add; platform issues Employee IDs (`EMP-nnnn`) and sends magic-link invitations. Duplicate/format validation with a downloadable error report.
- Reporting period (quarter/FY) configurable per org; drives the dashboard header (e.g. *"Reporting period: 1 Apr – 30 Jun 2026"*).

### F3. Assessment Engine

- Question bank management (Super Admin): CRUD for all four formats, tagging by topic (definitions, IC, timelines, employer duties, complaint process…), difficulty, and Act reference; versioned so past attempts always point to the question version answered.
- Attempt lifecycle: `not_started → in_progress → submitted → scored`; scoring is synchronous for MCQ/FIB and rubric-computed for case studies/simulations; result available immediately on submit.
- Autosave, resume, timer, and shuffle per §3.5.
- Accessibility: full keyboard operation, screen-reader labelled options, no colour-only state indicators.

### F4. Employee Workspace

- Dashboard (see §5.2), My Assessments (history of attempts per cycle), My Certificate (view + download PDF).
- Certificate PDF: generated server-side (see §6), branded per the mock ("POSH COMPASS — Certificate of Completion"), containing name, score, certificate ID, date, and QR linking to the public verification page.
- "Organisation View" nav item for employees is **label-only navigation to the public org profile** — an employee never sees the HR dashboard (mock's sidebar item resolves to a read-only org status page: POSH Ready badge yes/no).

### F5. HR / Organisation Dashboard

- KPI cards, readiness meter, weekly trend, score distribution — full spec in §5.1.
- Roster view: employee list with status (Not started / In progress / Certified / Not certified), completion nudge (resend invite), re-attempt approval. **No department grouping.**
- Data tables behind every chart ("View data table" links in mock) for accessibility and export (CSV) — org-level aggregates and roster only.
- Audit Module entry point (button in header) — disabled with tooltip until POSH Ready.

### F6. Audit Module (Two-Tier Compliance)

- Booking: calendar slots published by Jijiwisha; org selects slot, pays audit fee, uploads required documents (policy PDF, IC order, annual report copies).
- Auditor console: assigned audits queue, NCW-aligned verification checklist, findings & remediation notes, decision recording.
- Certificate issuance: on `passed`, system generates POSH Compliance Certificate (12-month validity, renewal reminder at T-60/T-30 days via cron + email).
- Full audit pack export (one click): org readiness record, per-employee certification list (name + status + score band), assessment evidence summaries, timestamps.

### F7. Notifications

- Email (Nodemailer/SMTP per blueprint): invitations, score results, certificate issued, readiness achieved, audit booked/confirmed/decision, renewal reminders.
- In-app toasts + notification centre (optional v1.1).
- Cron jobs (`node-cron`): renewal reminders, stale-attempt cleanup, nightly public-stats cache refresh, invite expiry (TTL indexes per blueprint §6).

### F8. Jijiwisha Super Admin Console

- Org management (activate/suspend, pricing overrides), question bank management, auditor assignment, public-stats moderation (e.g. trust-score source), platform config (thresholds, paper composition, attempt limits), support tools with logged impersonation-free data access.

---

## 5. Screen-by-Screen Spec (from Design Mocks)

### 5.1 HR / Organisation Dashboard (Mock 1)

**Layout:** dark-green sidebar + cream content canvas; orange primary accent. Sidebar sections: ORGANISATION (Dashboard, Assessments, Audit) and VIEWS (Employee View, Public Site); footer shows org name + Org ID (`PC-ORG-2026-4417`).

**Header row**

| Element | Behaviour |
|---|---|
| Title + subtitle | "Dashboard Overview" · `{Org name} · {headcount} employees · Reporting period: {start} – {end}` |
| POSH Ready badge | Pill, green, "✓ POSH Ready · achieved {date}". Hidden until State 3; replaced by "POSH Compliant · valid till {date}" after audit pass (compliance supersedes visually, readiness remains in history) |
| **Audit Module** button | Primary dark button → Audit Module (F6). Disabled + tooltip "Unlocks at 95% readiness" until POSH Ready |

**KPI cards (4)** — each with value, label, and month-over-month delta:

1. **Employees assessed** — count of employees with ≥1 submitted attempt this cycle (mock: 1,204; ▲ +64 vs May 2026)
2. **Assessment completion rate** — assessed ÷ enrolled (mock: 97.1%, "1,204 of 1,240 employees")
3. **Certified individuals (80%+)** — (mock: 1,181; ▲ +58)
4. **Average score** — mean of best scores across assessed employees (mock: 84.6%; ▲ +1.8 pts)

**Organisation readiness score panel**

- Large numeral (mock: **95.2%**), definition line: "Share of all {N} employees certified with 80%+ · threshold for POSH Ready: 95%".
- Horizontal progress bar 0–100% with a **tick at 95% labelled "95% = POSH Ready"**.
- Status chip top-right: "✓ Threshold met — status recorded" (or "In progress — {x} more certifications needed" below threshold; the delta count is computed as ceil(0.95×N) − certified).
- Helper copy (verbatim intent from mock): *"Recomputed after every submission. When the fill crosses the 95% line, POSH Ready status is recorded automatically and audit booking unlocks. Readiness is tracked at organisation level only — departmental breakdowns are deliberately not collected, to protect confidentiality."*

**Charts row**

- **Assessments completed per week** — line/area chart, last 12 weeks, hover tooltips, latest point labelled (mock: 116). "▸ View data table" toggle renders the same data as an accessible table.
- **Score distribution** — column chart of assessed employees by score band: Below 60 / 60–69 / 70–79 / 80–89 / 90–100 (mock: 4 / 8 / 11 / 534 / 647), with a vertical rule + label "80%+ certifies →". "▸ View data table" toggle.

**States:** empty (no assessments yet → onboarding checklist), loading skeletons, error with retry, sub-threshold vs POSH Ready vs POSH Compliant.

### 5.2 Employee Dashboard (Mock 2)

**Sidebar:** MY WORKSPACE (Dashboard, My Assessments, My Certificate) and VIEWS (Organisation View, Public Site); footer: name + `ID EMP-0384 · ABC Pvt. Ltd.`

**Header:** "Welcome, {First Last}" · "Employee ID {EMP-nnnn} · {Org}" · status pill "✓ Certified · {date}" (or "Not certified — re-attempt scheduled {date}" / "Assessment pending").

**Cards row (4)**

1. **Your Personal Score** — donut (mock: 86%), verdict copy ("Excellent! You've scored above the 80% certification threshold"), chip "🔒→✅ Certification Unlocked".
   ⚠️ Mock shows "85% threshold" — **build to 80%** per spec; correct the mock (§16).
2. **Your Score Status** — Certified / Not Certified, completion statement, Certified Date.
3. **Score Breakdown** — Correct answers, Incorrect answers, Total questions, Passing threshold (80%).
4. **Performance Level** — banded label from best score: 90–100 Outstanding · 80–89 Excellent · 70–79 Developing · <70 Needs re-training (bands configurable; mock shows "Excellent" at 86%).

**Question Review panel**

- Table: Q.No · Question · Your Answer · Correct Answer · Result (✓/✗); first ~7 rows with "View Full Question Review →".
- Shown **only after scoring**, only to the employee. Because correct answers are revealed, re-attempts must draw a rotated question set (§3.5).
- Case studies/simulations render as "your decision path vs recommended path" with the weight/impact explanation rather than a single "correct answer".

**Your Personal Certificate panel**

- Certificate preview (POSH COMPASS · Certificate of Completion · name · score · `CERT-2026-EMP0384` · date).
- **Download Certificate** (primary, orange) → server-generated PDF; secondary hint "PDF via print dialog" as fallback.
- Locked state before certification: greyed preview + "Score 80%+ to unlock your certificate".

**Footer strip:** shield icon + "Your certificate is valid as proof of completing the POSH Assessment. Keep learning. Stay aware. Help build a safe and respectful workplace." · right: "Need help? Contact Jijiwisha Support".

### 5.3 Shared Design System

- **Colours:** deep green sidebar (#123b2a-range), cream canvas, brand orange accent (primary CTAs, active nav), success green, error red for ✗/incorrect. Derive exact tokens from the Jijiwisha brand kit.
- **Type:** serif display for page titles / certificate (as in mocks), humanist sans for UI; tabular numerals on KPIs.
- **Components:** KPI card, status pill, progress meter with threshold tick, chart+data-table toggle, roster table, certificate frame, audit checklist. Build as a shared component library (`frontend/src/components/ui`).
- All charts via a single library (Recharts — §6) with a consistent green palette; every chart has an accessible table twin.

---

## 6. Tech Stack

Per Blueprint v2.2 with domain choices filled in. ⚠️ **Version Safety Rule applies:** never copy version numbers from this document. Before writing any `package.json`, web-search each dependency for the latest stable + advisories and confirm with `npm show <pkg> version`.

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Node.js (Active LTS — verify) | |
| Framework | Express + TypeScript (strict) | |
| Database | MongoDB Atlas | India region (ap-south-1 / Mumbai) for data-residency comfort |
| ODM | Mongoose | |
| Validation | Zod | Env + every route body/query/params |
| Auth | Email/password + magic-link invites; Google OAuth optional for HR admins | Passport strategies per blueprint |
| JWT | jsonwebtoken — access 15 min (header) + refresh 7 d (HttpOnly; Secure; SameSite=Strict cookie, rotation + reuse revocation) | |
| Password hashing | bcryptjs (cost ≥ 10) | |
| Security headers / CORS / rate limit / NoSQL sanitise | helmet · cors (explicit origins) · express-rate-limit · express-mongo-sanitize | Strict limits on auth, public verify, and sample-assessment endpoints |
| Real-time | socket.io (JWT-guarded) | Live readiness-meter updates on HR dashboard as submissions arrive |
| Jobs | node-cron | Renewal reminders, stats cache, invite TTL sweeps |
| Email | nodemailer (Resend/SendGrid SMTP) | |
| Payments | **Razorpay** (domain add-on) | Server-side order creation only; webhook signature verification; amounts in paise (never floats) |
| PDF generation | **Puppeteer or @react-pdf/renderer** (verify) | Certificates + audit pack |
| CSV | **papaparse** (client preview) + server-side parser | Bulk enrolment |
| Logging / Monitoring | winston · @sentry/node (PII scrubbed in beforeSend) | |
| Frontend | React + Vite + TypeScript · react-router-dom · TanStack Query · Axios (single-flight refresh) · React Hook Form + Zod · DOMPurify | Per blueprint §7 |
| **Domain UI** | **Recharts** (dashboard charts) + custom design-system components | Fills `<YOUR_DOMAIN_UI_LIB>` |
| Deploy | Frontend: Vercel · Backend: Render/Railway · DB: Atlas (IP allowlist) | HTTPS enforced |

---

## 7. Repository Structure

Blueprint §2 structure with POSH Compass modules:

```
posh-compass/
├── backend/
│   ├── src/
│   │   ├── server.ts / app.ts
│   │   ├── config/            # env.ts (Zod, crash on bad config), db.ts, passport.ts
│   │   ├── middleware/        # requireAuth, validate, roleGuard, errorHandler
│   │   ├── modules/
│   │   │   ├── auth/          # login, refresh, magic-link invites, logout
│   │   │   ├── users/         # profiles (employee / hr_admin / auditor / super_admin)
│   │   │   ├── organisations/ # org registration, readiness, reporting periods
│   │   │   ├── employees/     # enrolment, roster, CSV import
│   │   │   ├── questions/     # bank CRUD, versioning, tagging (super admin)
│   │   │   ├── assessments/   # paper assembly, attempt lifecycle, autosave
│   │   │   ├── scoring/       # scoring engine, readiness recompute, states 1–3
│   │   │   ├── certificates/  # individual CERT- + org COMP- issuance, verification
│   │   │   ├── audits/        # booking, checklist, findings, decisions
│   │   │   ├── payments/      # Razorpay orders + webhooks
│   │   │   └── stats/         # public counters (cached), org dashboard aggregates
│   │   ├── services/          # email.service, cron.service, pdf.service, csv.service
│   │   ├── sockets/           # readiness live updates (org rooms, JWT guard)
│   │   ├── utils/             # jwt, encryption (AES-256-GCM), ownershipCheck, tokenCompare
│   │   └── types/
│   ├── postman/               # collection.json + environment.json (no secrets)
│   ├── .env.example / .gitignore / tsconfig.json (strict)
├── frontend/
│   ├── src/
│   │   ├── lib/               # env.ts (Zod), api/client.ts + refreshClient.ts
│   │   ├── auth/              # AuthProvider, tokenStore (memory only)
│   │   ├── components/        # RequireAuth, RoleGate, ErrorBoundary, ui/ (design system)
│   │   ├── features/
│   │   │   ├── org-dashboard/     # §5.1
│   │   │   ├── employee-dashboard/# §5.2
│   │   │   ├── assessment-player/ # 4 formats, timer, autosave
│   │   │   ├── roster/ audits/ certificates/ payments/ public-stats/ admin/
│   │   └── pages/
│   ├── .env.example / .gitignore
└── docs/                      # PROJECT_BLUEPRINT.md, this PRD, BACKEND_PLANNING.md
```

Rules: never commit `.env`/`node_modules`/`dist`; `.env.example` always committed; `.cursorignore` mirrors sensitive paths (blueprint §9).

---

## 8. Environment Variables

Blueprint §3 baseline **plus** domain additions:

```env
# ── Domain thresholds (platform constants) ──────────────────────────────
CERT_PASS_THRESHOLD=80            # individual certification %
ORG_READY_THRESHOLD=95            # % of employees certified for POSH Ready
ATTEMPT_TIME_LIMIT_MIN=60
MAX_ATTEMPTS_PER_CYCLE=3

# ── Payments (Razorpay) ─────────────────────────────────────────────────
RAZORPAY_KEY_ID=your_key_id
RAZORPAY_KEY_SECRET=your_key_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret

# ── Certificates / verification ─────────────────────────────────────────
CERT_VERIFY_BASE_URL=https://poshcompass.jijiwishasociety.org/verify
CERT_SIGNING_SECRET=replace_with_64_char_hex   # HMAC on QR payloads

# ── Public stats cache ───────────────────────────────────────────────────
PUBLIC_STATS_CACHE_TTL_SEC=600
```

All validated in `src/config/env.ts` (crash on bad config). Thresholds read from env into a config service — no magic numbers in code.

---

## 9. Data Models

Key Mongoose models (all with `createdAt/updatedAt`, soft-delete `isDeleted/deletedAt` where marked ⊘):

| Model | Key fields | Notes |
|---|---|---|
| **User** ⊘ | email (unique), passwordHash?, role: `employee\|hr_admin\|auditor\|super_admin`, orgId?, employeeCode (`EMP-nnnn`), name, refreshTokenHash, failedLogins, lockedUntil | One user = one role in v1 |
| **Organisation** ⊘ | name, orgCode (`PC-ORG-YYYY-nnnn`), registrationNo, headcount, reportingPeriod {start,end}, pricingTier, readiness {score, isReady, achievedAt, cycle}, compliance {status, certificateId, validTill} | Readiness recomputed on submission events |
| **Question** | type: `mcq\|fib\|case_study\|simulation`, version, tags[], actReference, body, options[{text, weight}] / blanks[{acceptedAnswers[]}] / nodes[{choices[{impact}]}], difficulty, isActive | Versioned; attempts reference questionId+version |
| **AssessmentAttempt** | userId, orgId, cycle, paper [{questionId, version, order}], answers [{questionId, response, savedAt}], status: `in_progress\|submitted\|scored`, startedAt, submittedAt, timeLimitMin, score, sectionScores, attemptNo | One active per user; TTL sweep on abandoned |
| **Certificate** | certId (`CERT-YYYY-EMPnnnn`), userId, orgId, score, scoreBand, cycle, issuedAt, evidenceRef (attemptId), revoked? | Public verify returns minimal fields (§3.6) |
| **Audit** | orgId, status: `requested\|scheduled\|in_review\|changes_requested\|passed\|failed\|certificate_issued`, slot, auditorId, documents[], checklist [{item, status, note}], findings, decisionAt | NCW-aligned checklist template seeded |
| **ComplianceCertificate** | compId (`COMP-YYYY-ORGnnnn`), orgId, auditId, issuedAt, validTill | 12-month validity; renewal cron |
| **Payment** | orgId, type: `seats\|audit`, razorpayOrderId, amountPaise, status, webhookVerifiedAt | Amounts in paise only |
| **Invite** | email, orgId, tokenHash (crypto.randomBytes 32), expiresAt (TTL index) | Generic errors — no email enumeration |
| **PublicStats** (cached doc) | employeesAssessed, orgsReady, auditsCompleted, complianceIssued, trustScore, refreshedAt | Cron-refreshed |
| **AuditLog** (append-only) | actorId, action, entity, entityId, meta, at | Every certification, readiness change, audit decision, and admin data access |

Indexes: `User.email` unique; `AssessmentAttempt {userId, cycle, status}`; `Certificate.certId` unique; text index only on non-sensitive fields (question tags), per blueprint §6.

---

## 10. API Documentation

All endpoints follow blueprint §4/§5 standards: `/api/v1` prefix, `{ success, data }` / `{ success: false, error: { code, message, fields? } }` shapes, Zod validation everywhere, `assertOwnership()` in every controller (404, never 403, on wrong owner), pagination on all lists.

### 10.1 Endpoint Inventory

| Module | Endpoints |
|---|---|
| auth | `POST /auth/register-org` · `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` · `POST /auth/invite/accept` · `GET /auth/google` (+callback, HR only) |
| users | `GET /users/me` · `PATCH /users/me` · `GET /users/me/export` (DPDP) · `DELETE /users/me` (confirm-text) |
| organisations | `GET /orgs/me` · `PATCH /orgs/me` · `GET /orgs/me/dashboard` · `GET /orgs/me/readiness` |
| employees | `GET /orgs/me/employees` · `POST /orgs/me/employees` · `POST /orgs/me/employees/import` (CSV) · `POST /orgs/me/employees/:id/resend-invite` · `PATCH /orgs/me/employees/:id/approve-reattempt` · `DELETE /orgs/me/employees/:id` |
| assessments | `POST /assessments/attempts` (start) · `GET /assessments/attempts/current` · `PATCH /assessments/attempts/:id/answers` (autosave) · `POST /assessments/attempts/:id/submit` · `GET /assessments/attempts/:id/review` |
| certificates | `GET /certificates/me` · `GET /certificates/me/pdf` · `GET /public/verify/:certId` (no auth, rate-limited) |
| audits | `GET /audits/slots` · `POST /audits` (book) · `POST /audits/:id/documents` · `GET /audits/:id` · `PATCH /audits/:id/checklist` (auditor) · `POST /audits/:id/decision` (auditor) |
| payments | `POST /payments/orders` · `POST /payments/webhook` (Razorpay, signature-verified, no auth) |
| stats | `GET /public/stats` (no auth, cached) |
| admin | `GET/POST/PATCH /admin/questions` · `GET /admin/orgs` · `PATCH /admin/config` · `GET /admin/audit-log` |
| infra | `GET /health` · `GET /ready` (excluded from strict rate limits) |

### 10.2 Fully Documented Examples (blueprint §5 template)

### POST /api/v1/assessments/attempts/:id/submit

**Description:** Submits an in-progress attempt, scores it synchronously, updates certification state, and triggers org readiness recompute.
**Auth required:** Yes · **Minimum role:** employee (owner of attempt)

#### Request
Headers: `Authorization: Bearer <accessToken>`
Path params: `:id` — attempt ObjectId

Body: `{}` (answers already autosaved; server scores what's on record)

#### Response — 200 OK
```json
{
  "success": true,
  "data": {
    "attemptId": "64a1…",
    "score": 86,
    "state": "certified",
    "certificate": { "certId": "CERT-2026-EMP0384", "issuedAt": "2026-05-28T…" },
    "breakdown": { "correct": 43, "incorrect": 7, "total": 50, "threshold": 80 },
    "performanceLevel": "excellent"
  }
}
```
#### Response — 400 `INVALID_REQUEST` — attempt not in `in_progress` (already submitted / timed out)
#### Response — 401 / 404 — per standard shapes

#### Business rules
- Server recomputes score from stored answers + question versions — client-sent scores are never trusted.
- On score ≥ `CERT_PASS_THRESHOLD`: create Certificate, append AuditLog, emit socket event to org room, enqueue readiness recompute.
- On score < threshold: state `not_certified`, re-training flag; re-attempt requires HR approval after `MAX_ATTEMPTS_PER_CYCLE`.
- Readiness recompute is idempotent; POSH Ready is recorded exactly once per cycle with timestamp.

---

### GET /api/v1/orgs/me/dashboard

**Description:** Aggregates powering the HR dashboard (§5.1) for the org's current reporting period.
**Auth required:** Yes · **Minimum role:** hr_admin (own org)

#### Request
Query: `?period=2026-Q1` (optional; defaults to current)

#### Response — 200 OK
```json
{
  "success": true,
  "data": {
    "org": { "name": "ABC Pvt. Ltd.", "orgCode": "PC-ORG-2026-4417", "headcount": 1240,
             "period": { "start": "2026-04-01", "end": "2026-06-30" } },
    "kpis": {
      "assessed": { "value": 1204, "deltaVsPrevMonth": 64 },
      "completionRate": { "value": 97.1, "assessed": 1204, "enrolled": 1240 },
      "certified": { "value": 1181, "deltaVsPrevMonth": 58 },
      "avgScore": { "value": 84.6, "deltaVsPrevMonth": 1.8 }
    },
    "readiness": { "score": 95.2, "threshold": 95, "isReady": true,
                   "achievedAt": "2026-06-26", "auditUnlocked": true },
    "weeklyAssessments": [ { "weekStart": "2026-04-06", "count": 59 }, … ],
    "scoreDistribution": [
      { "band": "below_60", "count": 4 }, { "band": "60_69", "count": 8 },
      { "band": "70_79", "count": 11 }, { "band": "80_89", "count": 534 },
      { "band": "90_100", "count": 647 }
    ],
    "compliance": { "status": "not_started" }
  }
}
```
#### Business rules
- **No department/team dimension exists in this payload or any org-facing aggregate** (§3.6).
- Aggregation via MongoDB pipelines, cached 60 s per org; socket event `readiness:update` invalidates client cache (TanStack Query).

---

### GET /api/v1/public/verify/:certId

**Description:** Public verification of an individual (`CERT-`) or compliance (`COMP-`) certificate.
**Auth required:** No · rate-limited (public tier)

#### Response — 200 OK
```json
{ "success": true, "data": { "certId": "CERT-2026-EMP0384", "type": "individual",
  "holderName": "Priya Sharma", "organisation": "ABC Pvt. Ltd.",
  "status": "valid", "scoreBand": "80_89", "issuedAt": "2026-05-28" } }
```
#### Response — 404 `NOT_FOUND` — unknown or revoked ID (identical shape; no enumeration hints)
#### Business rules
- Returns score **band**, never raw score; no employee ID, email, or question data.

*(All remaining endpoints must be documented in `docs/API.md` using the same template before implementation of each module — definition of done.)*

---

## 11. Backend Security & Compliance Checklist

Everything in Blueprint §6 applies verbatim (env hygiene, JWT rotation + reuse revocation, timing-safe comparisons, account lockout, helmet/cors/sanitize/rate-limit, ownership checks, soft delete, health endpoints, Winston/Sentry with PII scrubbing, npm audit, HTTPS). **Domain additions:**

- **Score integrity:** scoring is server-side only; correct answers and option weights are never sent to the client during an attempt (review endpoint only post-scoring). Paper assembly excludes answer keys from the attempt payload.
- **Certificate integrity:** cert IDs non-sequential-guessable (random suffix component); QR payload HMAC-signed with `CERT_SIGNING_SECRET`; revocation supported.
- **Payments:** Razorpay webhook signature verified with `timingSafeEqual`; order amounts computed server-side from pricing tier — client-sent amounts ignored.
- **Confidentiality invariants (tested in CI):** no API response consumable by `hr_admin`/`auditor` contains a department field or per-question employee responses; integration tests assert this.
- **DPDP Act 2023:** consent capture at invite acceptance; `GET /users/me/export`; erasure workflow (anonymise user, retain org-level aggregates + certificate validity record as legal-obligation basis); breach-notification runbook documented.
- **Audit trail:** append-only AuditLog on certification, readiness changes, audit decisions, admin data access; retained ≥ 8 years (aligns with POSH record-keeping expectations — confirm with counsel, §16).
- **Data residency:** Atlas Mumbai region; backups within region.

## 12. Frontend Security Checklist

Blueprint §8 applies verbatim (memory-only access token, single-flight refresh, DOMPurify, RHF+Zod, RequireAuth, paginated lists, no secrets in console). **Domain additions:**

- Assessment player never receives answer keys/weights; no client-side scoring logic to reverse-engineer.
- Timer authoritative on server; client timer is display-only.
- Certificate PDF fetched via authenticated endpoint (no public unauthenticated raw-score URLs).
- Role-gated routes: `RoleGate` wrapper for hr_admin/auditor/super_admin areas in addition to RequireAuth.
- CSV import parsed client-side for preview only; server re-validates every row.

---

## 13. Non-Functional Requirements

| Area | Requirement |
|---|---|
| Performance | Dashboard API p95 < 500 ms (cached aggregates); assessment autosave < 200 ms; public stats served from cache |
| Scale (v1) | 200 concurrent test-takers per org; 50k employees platform-wide; burst-safe submit path |
| Availability | 99.5% monthly; graceful attempt-resume on disconnect |
| Accessibility | WCAG 2.1 AA; every chart has a data-table twin ("View data table"); full keyboard support in assessment player |
| Localisation | English v1; content architecture i18n-ready (Hindi question bank fast-follow) |
| Browser | Last 2 versions of Chrome/Edge/Firefox/Safari; responsive ≥ 360 px |
| Data retention | Attempts + certificates ≥ 8 years; abandoned attempts TTL 30 days; invites TTL 7 days |

## 14. Analytics & Metric Definitions

Single source of truth so dashboard, public stats, and audit pack never disagree:

| Metric | Definition |
|---|---|
| Employees assessed | Distinct employees with ≥ 1 `submitted` attempt in cycle |
| Completion rate | assessed ÷ enrolled (active roster) |
| Certified individuals | Distinct employees whose **best** scored attempt in cycle ≥ 80% |
| Average score | Mean of best scores across assessed employees |
| Readiness score | certified ÷ enrolled × 100 (recomputed per submission) |
| POSH Ready | readiness ≥ 95%, recorded once per cycle with timestamp |
| Orgs POSH Ready (public) | Orgs with recorded POSH Ready in current cycle |
| Audits completed (public) | Audits with terminal decision (`passed`/`failed` → decisioned) |
| Compliance certificates | `COMP-` certificates currently valid |
| MoM deltas on KPI cards | Value at end of current month vs end of previous month, same definitions |

## 15. Release Plan

| Phase | Scope | Exit criteria |
|---|---|---|
| **P0 — Foundation** | Auth, org registration, employee enrolment (CSV + invites), payments (seats) | Org can onboard and pay; Postman run-order green (blueprint §10) |
| **P1 — Assess & Certify** | Question bank, assessment player (4 formats), scoring engine, states 1–2, employee dashboard, certificate PDF + public verify | First real employee certified end-to-end |
| **P2 — Readiness & HR Dashboard** | Readiness recompute + State 3, HR dashboard (§5.1) with live socket updates, roster tools | Pilot org reaches POSH Ready on real data |
| **P3 — Audit & Compliance** | Audit booking + payment, auditor console + NCW checklist, COMP certificate, audit pack export, renewal crons | First POSH Compliance Certificate issued via platform |
| **P4 — Public & Polish** | Public stats dashboard, sample assessment, admin console hardening, DPDP export/erasure, accessibility pass | Security checklists §11–12 fully green; external pen-test if budget allows |
| **v1.1+** | Hindi question bank, notification centre, multi-year cycle comparisons, auditor scheduling calendar | — |

## 16. Open Questions & Known Inconsistencies

1. **Threshold mismatch in mock:** Employee dashboard mock says "85% certification threshold / Passing Threshold 85%". Spec, live site, and HR mock all say **80%**. → PRD standardises on **80%**; update the mock.
2. **Re-attempt policy:** default max 3 per cycle then HR approval — confirm with Jijiwisha ops.
3. **Answer review vs retake integrity:** full correct-answer reveal (per mock) requires a question bank large enough for rotation. Minimum bank size per topic to be defined with content team; alternative is band-level feedback only.
4. **Enrolled denominator:** readiness uses HR-registered active roster. Policy needed for exits/joiners mid-cycle (recompute on roster change — can move an org below 95% after achievement; recommend: status once recorded stays for the cycle, but live meter reflects current roster, both shown).
5. **Compliance certificate legal wording:** attestation by Jijiwisha as expert body vs statutory language — counsel review before P3 copy freeze.
6. **Retention period:** 8-year default pending counsel confirmation.
7. **Pricing mechanics:** ₹59–₹159/employee band boundaries and audit fee — finalise for payments module.
8. **Trust score source:** methodology for the public "Average Client Trust Score" counter (survey instrument + cadence).

---

## 17. Master Build Prompt (AI Assistant Handoff)

Per Blueprint §11.1, filled in — paste into your coding assistant alongside this PRD:

```
Build a production-ready full-stack app with TypeScript.

Industry: POSH Act compliance assessment & certification (India)
Primary resources: organisations, employees(users), questions, assessment_attempts,
certificates, audits, payments, public_stats

Follow docs/POSH_Compass_PRD.md for all business rules, especially:
- Individual certification at >= CERT_PASS_THRESHOLD (80%), computed server-side only
- Org POSH Ready at >= ORG_READY_THRESHOLD (95%), recomputed on every submission,
  recorded once per cycle, unlocks audit booking
- Two-tier statuses: POSH Ready (self) vs POSH Compliant (Jijiwisha audit) — never conflate
- NO department-level aggregation anywhere in org-facing APIs, exports, or UI (legal guardrail)
- Answer keys/weights never sent to client during attempts

── Backend ── per Blueprint v2.2: Express + Mongoose + TS strict; Zod env (crash on bad
config); modules per resource; JWT 15m access + 7d rotating HttpOnly refresh with reuse
revocation; helmet/cors(explicit)/mongo-sanitize/rate-limit middleware order; assertOwnership()
everywhere (404 not 403); timingSafeEqual for tokens & Razorpay webhook signatures;
{success,data} / {success,error:{code,message,fields}} shapes; Winston+Sentry with PII
scrubbing; node-cron (renewals, stats cache, TTL sweeps); socket.io org rooms (JWT-guarded)
for live readiness updates; /health + /ready.
Before writing package.json: web search each dependency (latest + CVE) and confirm with
`npm show <pkg> version` — never copy versions from docs.

── Frontend ── Vite + React + TS; Axios single-flight refresh with separate refreshClient;
access token in memory only; AuthProvider bootstrap; RequireAuth + RoleGate; TanStack Query;
RHF + Zod; DOMPurify; ErrorBoundary. Domain UI: Recharts + custom design system
(deep-green sidebar, cream canvas, orange accents, serif display headings) matching the
HR-dashboard and employee-dashboard mocks described in PRD §5.

── Deliverables ── .env.example (both), root .gitignore + .cursorignore, README with CI
baseline (npm ci, tsc --noEmit, test, npm audit), Postman collection + environment under
backend/postman/, TS strict tsconfigs, and full endpoint docs in docs/API.md using the
Blueprint §5 template.
```

---

*Prepared for Jijiwisha Society · POSH Compass — Assess. Prove. Get Certified. Get Compliant.*
