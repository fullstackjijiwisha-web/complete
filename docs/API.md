# POSH Compass API

Base URL: `/api/v1` · All responses: `{ success, data }` or `{ success: false, error: { code, message, fields? } }` (blueprint §4).
Three fully documented reference endpoints live in the PRD §10.2 (`submit`, `orgs/me/dashboard`, `public/verify`). Every endpoint below must be expanded to the Blueprint §5 template before its module is considered done.

## Endpoint inventory (implemented)

| Module | Endpoint | Auth · Role | Notes |
|---|---|---|---|
| auth | `POST /auth/register-org` | — | Creates org + HR admin, returns access token, sets refresh cookie |
| auth | `POST /auth/login` | — | Lockout: 5 fails → 15 min |
| auth | `POST /auth/refresh` | cookie | Rotation + reuse revocation |
| auth | `POST /auth/logout` | any | Clears cookie + stored hash |
| auth | `POST /auth/invite/accept` | — | Sets password, captures DPDP consent |
| users | `GET /users/me` · `PATCH /users/me` | any | |
| users | `GET /users/me/export` | any | DPDP data portability |
| users | `DELETE /users/me` | any | Body `{ "confirm": "DELETE MY ACCOUNT" }` → anonymise |
| orgs | `GET /orgs/me` · `PATCH /orgs/me` | hr_admin | reportingPeriod, headcount |
| orgs | `GET /orgs/me/readiness` | hr_admin | Live recompute |
| orgs | `GET /orgs/me/dashboard` | hr_admin | §5.1 aggregates, 60 s cache, **no department dimension** |
| employees | `GET /orgs/me/employees` | hr_admin | Paginated roster + status + best score |
| employees | `POST /orgs/me/employees` | hr_admin | Single enrol + magic-link invite |
| employees | `POST /orgs/me/employees/import` | hr_admin | `Content-Type: text/csv`, per-row error report |
| employees | `POST /orgs/me/employees/:id/resend-invite` | hr_admin | |
| employees | `PATCH /orgs/me/employees/:id/approve-reattempt` | hr_admin | After max attempts |
| employees | `DELETE /orgs/me/employees/:id` | hr_admin | Soft delete + readiness recompute |
| assessments | `POST /assessments/attempts` | employee | Assembles rotated paper, no answer keys in payload |
| assessments | `GET /assessments/attempts/current` | employee | Resume; auto-submits if expired |
| assessments | `PATCH /assessments/attempts/:id/answers` | employee | Autosave (upsert) |
| assessments | `POST /assessments/attempts/:id/submit` | employee | Scores server-side; may issue certificate; readiness recompute |
| assessments | `GET /assessments/attempts/:id/review` | employee (owner) | Post-scoring only |
| certificates | `GET /certificates/me` | employee | |
| certificates | `GET /certificates/me/pdf` | employee | Print-ready HTML (P1: true PDF) |
| public | `GET /public/verify/:certId` | — (rate-limited) | CERT- and COMP-; minimal fields, score band only |
| public | `GET /public/stats` | — (rate-limited) | Cached counters |
| audits | `GET /audits/slots` | hr_admin | |
| audits | `POST /audits` | hr_admin | Requires POSH Ready; seeds NCW checklist |
| audits | `POST /audits/:id/documents` | hr_admin | Metadata only (storage TBD) |
| audits | `GET /audits/:id` | hr/auditor(assigned)/admin | 404 on wrong owner |
| audits | `GET /audits/:id/pack` | hr/auditor/admin | Audit pack export (name + status + score band) |
| audits | `PATCH /audits/:id/checklist` | auditor | |
| audits | `POST /audits/:id/decision` | auditor | `passed` (checklist all ok) → COMP- certificate |
| payments | `POST /payments/orders` | hr_admin | Server-side amounts (paise) |
| payments | `POST /payments/webhook` | — | Raw-body HMAC, timing-safe |
| admin | `GET/POST/PATCH /admin/questions` | super_admin | Versioned bank, 4 formats |
| admin | `GET /admin/orgs` · `PATCH /admin/orgs/:id` | super_admin | activate/suspend, seatsActive |
| admin | `GET /admin/audit-log` | super_admin | Append-only trail |
| admin | `GET /admin/config` | super_admin | Thresholds (read-only, env-driven) |
| admin | `POST /admin/audit-slots` · `PATCH /admin/audits/:id/assign` · `POST /admin/auditors` | super_admin | |
| admin | `PATCH /admin/public-stats` | super_admin | Trust-score moderation |
| infra | `GET /health` · `GET /ready` | — | Outside rate limits |

## Error codes

Per Blueprint §5 master reference: `VALIDATION_ERROR`, `INVALID_REQUEST`, `UNAUTHORIZED`, `TOKEN_EXPIRED`, `TOKEN_INVALID`, `REFRESH_TOKEN_INVALID`, `ACCOUNT_LOCKED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMIT_EXCEEDED`, `INTERNAL_ERROR`, plus domain codes `ATTEMPT_EXPIRED`, `QUESTION_BANK_EMPTY`, `PAYMENTS_NOT_CONFIGURED`.
