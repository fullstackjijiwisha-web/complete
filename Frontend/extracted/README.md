# POSH Compass — Proof, Not Attendance.

A digital platform that assesses real understanding of the POSH Act, 2013 —
and generates the audit-ready evidence the NCW expects. Built for
[Jijiwisha Society](https://www.jijiwishasociety.org/).

## Running the platform

The site ships with its own backend (plain Node.js — **zero npm dependencies**):

```bash
node server/server.js
# → http://localhost:3000
```

That one process serves the website **and** the JSON API (accounts, question
bank, server-side scoring, payments, dashboards). Data is stored in
`data/db.json` (auto-created, git-ignored); swap `server/db.js` for a real
database later without touching the routes.

### Payments (Razorpay)

Without keys the gateway runs in a clearly-labelled **TEST MODE** that
exercises the identical order → verify flow. To go live, create
`server/config.json` (git-ignored):

```json
{ "razorpayKeyId": "rzp_live_xxxx", "razorpayKeySecret": "xxxx" }
```

(or set `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` env vars). Amounts are always
computed server-side from the organisation's headcount and the pricing tiers.

### How access works

1. An admin registers the organisation (gets an **org code**).
2. The admin completes the payment — until then `/api/questions` returns
   402 and assessments stay locked for everyone.
3. Employees join with the org code and take assessments.
4. **MCQs are live**; Fill in the Blanks, Case Studies and Live Simulations
   are flagged *coming soon* by the API (`GET /api/formats`).
5. Scoring happens on the server — correct answers never reach the browser.

### API surface

```
POST /api/auth/register-org · /api/auth/join · /api/auth/login · /api/auth/logout
GET  /api/auth/me · /api/formats · /api/questions?format=mcq
POST /api/attempts            GET /api/attempts/mine
GET  /api/org/summary · /api/org/employees        (admin)
POST /api/payments/order · /api/payments/verify
```

## Pages

| Page | What it does |
|---|---|
| `index.html` | Landing: hero, key metrics, 5-step flow, assessment formats, certification logic, audit CTA |
| `how-it-works.html` | The 5-step system — each step shows input, system action, output and the proof it generates |
| `assessment.html` | **Working assessment engine**: 8 scenarios (MCQ / FIB / case study / simulation), 12-min timer, strict 80% threshold, evidence record with JSON download |
| `pricing.html` | Tiered per-employee pricing (₹159 / ₹129 / ₹89 / ₹59) with a live cost calculator |
| `dashboard.html` | Organisation admin view: readiness vs the 95% rule, trend & score-distribution charts, risk indicators, audit tracker |
| `employee.html` | Employee view: personal score, improvement trend, scenario history, certificate download |
| `audit.html` | Audit module: booking with Jijiwisha Society, document fingerprinting, IC verification, sealed evidence pack, compliance certificate |

## Certification logic

- **Individual**: overall score ≥ 80% → Certified Individual.
- **Organisation**: 95% of all employees certified with 80%+ → POSH Ready.
- Every submission generates: timestamp, scenario IDs, response trace,
  score breakdown, audit log reference.

## Structure

```
index.html … audit.html   # pages
css/styles.css            # single design-system stylesheet
js/                       # vanilla JS (no frameworks) — api.js is the API client
server/                   # Node backend: auth, questions, scoring, payments, summaries
data/db.json              # runtime data (auto-created, git-ignored)
drupal-integration/       # nav-bar changes for the main Drupal website
IMAGES/                   # design reference mockups
```

## Hosting

The platform needs a Node.js host (Render, Railway, a VPS, or any server with
Node 18+): run `node server/server.js` and put it behind your domain. Static-only
hosts (GitHub Pages) can still serve the marketing pages, but login, payments,
assessments and dashboards require the backend. For the main-website nav
integration see `drupal-integration/README.md`.
