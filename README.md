# POSH Compass — Backend + Frontend (integrated)

DIY POSH assessment, certification & compliance platform · Jijiwisha Society.
Built per `docs/POSH_Compass_PRD.md` on the practices in `docs/PROJECT_BLUEPRINT.md` (Blueprint v2.2).

**Assess · Prove · Get Certified · Get Compliant** — *Proof, Not Attendance.*

## Run the integrated stack

The API also serves the static frontend (`Frontend/extracted/`) from the same
origin — required by the `SameSite=Strict` refresh cookie. One process runs
everything:

```bash
cd backend
npx tsx scripts/seed-questions.ts   # once: question bank + open audit slots
npm run dev                         # API + site on http://localhost:5000
```

Then open <http://localhost:5000>. Register an organisation (creates the HR
admin), enrol employees from the dashboard — without SMTP configured their
invite links are printed in this console — and each employee activates at
`/invite/accept?token=…`, takes the assessment, and certificates verify
publicly at `/verify/<certId>`. Frontend/API wiring lives in
`Frontend/extracted/js/api.js` (auth tokens, `{success,data}` envelope,
refresh rotation) and the per-page scripts next to it.

## Stack

Express 5 + TypeScript (strict) · MongoDB (Mongoose 9) · Zod 4 · JWT (15 min access / 7 d rotating refresh) · Socket.io · node-cron · Nodemailer · Razorpay · Winston + Sentry.

Dependency versions were verified at scaffold time (7 Jul 2026) via `npm show <pkg> version` per the blueprint's Version Safety Rule — `npm audit` reported **0 vulnerabilities**. Re-verify before adding anything new.

## Setup

```bash
cd backend
cp .env.example .env       # fill in MONGODB_URI + generate JWT secrets:
# node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
npm ci
npm run dev                # tsx watch src/server.ts
```

Requires Node ≥ 24 and a MongoDB (local or Atlas — use the Mumbai / ap-south-1 region in production for data residency, PRD §11).

Optional `.env` bootstrap: set `SUPER_ADMIN_EMAIL` + `SUPER_ADMIN_PASSWORD` and a super-admin account is seeded at startup — use it to create questions (`POST /api/v1/admin/questions`), audit slots, and auditor accounts.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Watch-mode dev server |
| `npm run typecheck` | `tsc --noEmit` (CI gate) |
| `npm run build` / `npm start` | Compile to `dist/` and run |
| `npm run audit:high` | `npm audit --audit-level=high` (CI gate) |
| `npx tsx scripts/smoke.ts` | Boots the app DB-less; checks /health, /ready, 404 & auth shapes |

CI baseline (blueprint §9): `npm ci` → `npm run typecheck` → tests (when added) → `npm run audit:high`.

## Business rules implemented (PRD §3)

- **Individual certification ≥ 80%** (`CERT_PASS_THRESHOLD`) — scored 100% server-side from stored answers + question versions; answer keys/weights never sent during an attempt.
- **Org POSH Ready ≥ 95%** (`ORG_READY_THRESHOLD`) — recomputed after every scored submission (event-driven), recorded **once per cycle** with timestamp, unlocks audit booking, emits `readiness:update` to the org's socket room.
- **Two tiers never conflated** — `readiness` and `compliance` are separate structures on Organisation; compliance changes only through the auditor decision endpoint.
- **No department dimension anywhere** — no model field, no aggregate, no export contains department/team. Keep it that way (PRD §3.6 legal guardrail); add a CI test asserting it before P2.
- Attempts: 60-min server-authoritative timer, autosave, auto-submit on expiry (+ cron sweep), max 3/cycle then HR approval, rotated random paper per attempt.
- DPDP: consent at invite accept, `GET /users/me/export`, erasure via `DELETE /users/me` (anonymise, retain org aggregates + cert validity).

## Deliberate deviations from PRD/Blueprint (all flagged)

1. **`express-mongo-sanitize` replaced** by `src/middleware/sanitize.ts` — the package is incompatible with Express 5 (read-only `req.query`). Same protection ($/dot key stripping) + Zod on every route.
2. **Cert IDs carry a random suffix** (`CERT-2026-EMP0384-XXXX`): PRD §3.1's format is sequential-guessable, §11 forbids that. §11 wins; adjust display if needed.
3. **CSV import** is `Content-Type: text/csv` raw body (2 MB route-level limit) so the global `express.json({limit:'10kb'})` stays strict.
4. **Razorpay webhook** is mounted **before** the JSON parser with `express.raw` — HMAC must cover the exact signed bytes.
5. **Payment gate on assessments** only enforced when Razorpay env keys are set, so dev works without a gateway account.
6. **Certificate "PDF"** is a print-ready server-rendered HTML page for now (matches the mock's "PDF via print dialog" fallback). TODO P1: Puppeteer/@react-pdf + HMAC-signed QR (`CERT_SIGNING_SECRET`).
7. **Google OAuth** (optional for HR) not wired yet — env-gated Passport strategy is a P0.5 add.

## Deployment notes

- `SameSite=Strict` refresh cookie **will not survive cross-site deployment** (frontend on Vercel domain + API on Render domain are different sites). Serve both under one site, e.g. `poshcompass.jijiwishasociety.org` + `api.poshcompass.jijiwishasociety.org`, or the refresh flow breaks silently.
- Set `trust proxy` is already on (needed for rate-limit + secure cookies behind Render/Railway).
- Audit document upload stores metadata only — object storage (signed S3/Cloudinary upload) is an open infra decision (PRD §16).

## API

See `backend/docs/API.md` for the endpoint inventory and documented examples, and `backend/postman/` for the collection + environment (import both; run top-to-bottom).
