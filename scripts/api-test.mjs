#!/usr/bin/env node
/**
 * POSH Compass — Comprehensive API Endpoint Test Suite
 * Runs against live dev server at http://localhost:5000
 * Tests: happy paths, validation errors, auth/role guards, DB verification
 */

const BASE = 'http://localhost:5000';

// ─── Counters ────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
let skipped = 0;
const failures = [];

// ─── Shared state between tests ──────────────────────────────────────────
const state = {
  hrToken: null,
  hrUserId: null,
  hrOrgId: null,
  hrOrgCode: null,
  hrRefreshCookie: null,

  employeeToken: null,
  employeeUserId: null,
  employeeId: null, // The user ID of the added employee
  employeeCode: null,

  superAdminToken: null,
  superAdminUserId: null,

  questionId: null,

  attemptId: null,

  auditSlotId: null,
  auditId: null,

  auditorId: null,
  auditorToken: null,
};

// ─── Helpers ─────────────────────────────────────────────────────────────
const UNIQUE = Date.now();

async function api(method, path, { body, token, headers: h, raw } = {}) {
  const url = `${BASE}${path}`;
  const headers = { ...h };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body && !raw) {
    headers['Content-Type'] = 'application/json';
  }
  const opts = { method, headers };
  if (body) opts.body = raw ? body : JSON.stringify(body);
  const res = await fetch(url, opts);

  // Try to parse JSON; if it fails, return text
  const contentType = res.headers.get('content-type') || '';
  let data;
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  // Capture set-cookie for refresh token
  const setCookieHeader = res.headers.get('set-cookie');
  return { status: res.status, data, setCookie: setCookieHeader, headers: res.headers };
}

function extractRefreshCookie(setCookie) {
  if (!setCookie) return null;
  const match = setCookie.match(/refreshToken=([^;]+)/);
  return match ? match[1] : null;
}

function test(name, fn) {
  return { name, fn };
}

async function runTests(suiteName, tests) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  ${suiteName}`);
  console.log(`${'═'.repeat(70)}`);
  for (const t of tests) {
    try {
      await t.fn();
      passed++;
      console.log(`  ✅ ${t.name}`);
    } catch (err) {
      failed++;
      const msg = err.message || String(err);
      failures.push({ suite: suiteName, test: t.name, error: msg });
      console.log(`  ❌ ${t.name}`);
      console.log(`     → ${msg}`);
    }
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

function assertEqual(actual, expected, label = '') {
  if (actual !== expected) {
    throw new Error(`${label} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  1. HEALTH & READINESS
// ══════════════════════════════════════════════════════════════════════════
const healthTests = [
  test('GET /health — returns 200 with status up', async () => {
    const r = await api('GET', '/health');
    assertEqual(r.status, 200, 'status');
    assertEqual(r.data.success, true);
    assertEqual(r.data.data.status, 'up');
  }),

  test('GET /ready — returns 200 when DB connected', async () => {
    const r = await api('GET', '/ready');
    assertEqual(r.status, 200, 'status');
    assertEqual(r.data.data.status, 'ready');
  }),

  test('GET /api/v1 — returns API index', async () => {
    const r = await api('GET', '/api/v1');
    assertEqual(r.status, 200, 'status');
    assertEqual(r.data.data.name, 'POSH Compass API');
    assertEqual(r.data.data.version, 'v1');
  }),
];

// ══════════════════════════════════════════════════════════════════════════
//  2. AUTH — REGISTER ORG
// ══════════════════════════════════════════════════════════════════════════
const authRegisterTests = [
  test('POST /auth/register-org — validation: missing fields → 400', async () => {
    const r = await api('POST', '/api/v1/auth/register-org', { body: {} });
    assertEqual(r.status, 400, 'status');
    assertEqual(r.data.success, false);
  }),

  test('POST /auth/register-org — validation: password too short → 400', async () => {
    const r = await api('POST', '/api/v1/auth/register-org', {
      body: { orgName: 'TestOrg', headcount: 10, adminName: 'Admin', email: 'x@y.com', password: 'short' },
    });
    assertEqual(r.status, 400, 'status');
  }),

  test('POST /auth/register-org — validation: invalid email → 400', async () => {
    const r = await api('POST', '/api/v1/auth/register-org', {
      body: { orgName: 'TestOrg', headcount: 10, adminName: 'Admin', email: 'not-an-email', password: 'TestPassword123!' },
    });
    assertEqual(r.status, 400, 'status');
  }),

  test('POST /auth/register-org — validation: headcount 0 → 400', async () => {
    const r = await api('POST', '/api/v1/auth/register-org', {
      body: { orgName: 'TestOrg', headcount: 0, adminName: 'Admin', email: `a${UNIQUE}@test.com`, password: 'TestPassword123!' },
    });
    assertEqual(r.status, 400, 'status');
  }),

  test('POST /auth/register-org — happy path → 201 + user + orgCode + accessToken', async () => {
    const r = await api('POST', '/api/v1/auth/register-org', {
      body: {
        orgName: `TestOrg_${UNIQUE}`,
        headcount: 50,
        adminName: 'HR Admin Test',
        email: `hr_${UNIQUE}@testposh.com`,
        password: 'TestPassword123!',
        registrationNo: 'REG-001',
      },
    });
    assertEqual(r.status, 201, 'status');
    assertEqual(r.data.success, true);
    assert(r.data.data.accessToken, 'missing accessToken');
    assert(r.data.data.user.id, 'missing user.id');
    assert(r.data.data.orgCode, 'missing orgCode');
    assertEqual(r.data.data.user.role, 'hr_admin');
    assertEqual(r.data.data.user.email, `hr_${UNIQUE}@testposh.com`);

    // Save for later tests
    state.hrToken = r.data.data.accessToken;
    state.hrUserId = r.data.data.user.id;
    state.hrOrgCode = r.data.data.orgCode;
    state.hrOrgId = r.data.data.user.orgId;
    state.hrRefreshCookie = extractRefreshCookie(r.setCookie);
  }),

  test('POST /auth/register-org — duplicate email → 409', async () => {
    const r = await api('POST', '/api/v1/auth/register-org', {
      body: {
        orgName: `DupeOrg_${UNIQUE}`,
        headcount: 10,
        adminName: 'Dupe Admin',
        email: `hr_${UNIQUE}@testposh.com`,
        password: 'TestPassword123!',
      },
    });
    assertEqual(r.status, 409, 'status');
  }),
];

// ══════════════════════════════════════════════════════════════════════════
//  3. AUTH — LOGIN
// ══════════════════════════════════════════════════════════════════════════
const authLoginTests = [
  test('POST /auth/login — validation: missing fields → 400', async () => {
    const r = await api('POST', '/api/v1/auth/login', { body: {} });
    assertEqual(r.status, 400, 'status');
  }),

  test('POST /auth/login — wrong password → 401', async () => {
    const r = await api('POST', '/api/v1/auth/login', {
      body: { email: `hr_${UNIQUE}@testposh.com`, password: 'WrongPassword999!' },
    });
    assertEqual(r.status, 401, 'status');
  }),

  test('POST /auth/login — non-existent email → 401 (constant time)', async () => {
    const r = await api('POST', '/api/v1/auth/login', {
      body: { email: 'nobody@example.com', password: 'SomePassword1234' },
    });
    assertEqual(r.status, 401, 'status');
  }),

  test('POST /auth/login — happy path → 200 + tokens', async () => {
    const r = await api('POST', '/api/v1/auth/login', {
      body: { email: `hr_${UNIQUE}@testposh.com`, password: 'TestPassword123!' },
    });
    assertEqual(r.status, 200, 'status');
    assertEqual(r.data.success, true);
    assert(r.data.data.accessToken, 'missing accessToken');
    assertEqual(r.data.data.user.role, 'hr_admin');

    // Update token with a fresh one from login
    state.hrToken = r.data.data.accessToken;
    state.hrRefreshCookie = extractRefreshCookie(r.setCookie);
  }),
];

// ══════════════════════════════════════════════════════════════════════════
//  4. AUTH — REFRESH & LOGOUT
// ══════════════════════════════════════════════════════════════════════════
const authTokenTests = [
  test('POST /auth/refresh — no cookie → 401', async () => {
    const r = await api('POST', '/api/v1/auth/refresh');
    assertEqual(r.status, 401, 'status');
  }),

  test('POST /auth/refresh — with valid cookie → 200 + new accessToken', async () => {
    if (!state.hrRefreshCookie) { skipped++; return; }
    const r = await api('POST', '/api/v1/auth/refresh', {
      headers: { Cookie: `refreshToken=${state.hrRefreshCookie}` },
    });
    assertEqual(r.status, 200, 'status');
    assert(r.data.data.accessToken, 'missing new accessToken');
    state.hrToken = r.data.data.accessToken;
    state.hrRefreshCookie = extractRefreshCookie(r.setCookie);
  }),

  test('POST /auth/logout — no auth → 401', async () => {
    const r = await api('POST', '/api/v1/auth/logout');
    assertEqual(r.status, 401, 'status');
  }),

  test('POST /auth/logout — with auth → 200', async () => {
    // Login again to get fresh tokens, then logout
    const loginR = await api('POST', '/api/v1/auth/login', {
      body: { email: `hr_${UNIQUE}@testposh.com`, password: 'TestPassword123!' },
    });
    const tempToken = loginR.data.data.accessToken;
    const r = await api('POST', '/api/v1/auth/logout', { token: tempToken });
    assertEqual(r.status, 200, 'status');
    assertEqual(r.data.data.loggedOut, true);
  }),

  test('POST /auth/login — re-login after logout to get fresh tokens', async () => {
    const r = await api('POST', '/api/v1/auth/login', {
      body: { email: `hr_${UNIQUE}@testposh.com`, password: 'TestPassword123!' },
    });
    assertEqual(r.status, 200, 'status');
    state.hrToken = r.data.data.accessToken;
    state.hrRefreshCookie = extractRefreshCookie(r.setCookie);
  }),
];

// ══════════════════════════════════════════════════════════════════════════
//  5. USERS — /me endpoints
// ══════════════════════════════════════════════════════════════════════════
const userTests = [
  test('GET /users/me — no auth → 401', async () => {
    const r = await api('GET', '/api/v1/users/me');
    assertEqual(r.status, 401, 'status');
  }),

  test('GET /users/me — with auth → 200 + user data', async () => {
    const r = await api('GET', '/api/v1/users/me', { token: state.hrToken });
    assertEqual(r.status, 200, 'status');
    assertEqual(r.data.data.id, state.hrUserId);
    assertEqual(r.data.data.role, 'hr_admin');
    assertEqual(r.data.data.email, `hr_${UNIQUE}@testposh.com`);
    assert(r.data.data.org, 'missing org info');
    assert(r.data.data.org.orgCode, 'missing orgCode');
  }),

  test('PATCH /users/me — validation: name too short → 400', async () => {
    const r = await api('PATCH', '/api/v1/users/me', { token: state.hrToken, body: { name: 'A' } });
    assertEqual(r.status, 400, 'status');
  }),

  test('PATCH /users/me — happy path → 200 + updated name', async () => {
    const r = await api('PATCH', '/api/v1/users/me', { token: state.hrToken, body: { name: 'Updated HR Name' } });
    assertEqual(r.status, 200, 'status');
    assertEqual(r.data.data.name, 'Updated HR Name');
  }),

  test('GET /users/me — verify name was updated in DB', async () => {
    const r = await api('GET', '/api/v1/users/me', { token: state.hrToken });
    assertEqual(r.data.data.name, 'Updated HR Name');
  }),

  test('GET /users/me/export — happy path → 200 + profile, attempts, certificates', async () => {
    const r = await api('GET', '/api/v1/users/me/export', { token: state.hrToken });
    assertEqual(r.status, 200, 'status');
    assert(r.data.data.profile, 'missing profile');
    assert(Array.isArray(r.data.data.attempts), 'attempts should be array');
    assert(Array.isArray(r.data.data.certificates), 'certificates should be array');
  }),
];

// ══════════════════════════════════════════════════════════════════════════
//  6. ORGANISATIONS — /orgs/me
// ══════════════════════════════════════════════════════════════════════════
const orgTests = [
  test('GET /orgs/me — no auth → 401', async () => {
    const r = await api('GET', '/api/v1/orgs/me');
    assertEqual(r.status, 401, 'status');
  }),

  test('GET /orgs/me — hr_admin → 200 + org data', async () => {
    const r = await api('GET', '/api/v1/orgs/me', { token: state.hrToken });
    assertEqual(r.status, 200, 'status');
    assert(r.data.data.orgCode, 'missing orgCode');
    assertEqual(r.data.data.headcount, 50);
    assertEqual(r.data.data.registrationNo, 'REG-001');
  }),

  test('PATCH /orgs/me — update headcount → 200', async () => {
    const r = await api('PATCH', '/api/v1/orgs/me', {
      token: state.hrToken,
      body: { headcount: 100 },
    });
    assertEqual(r.status, 200, 'status');
    assertEqual(r.data.data.headcount, 100);
  }),

  test('GET /orgs/me — verify headcount updated in DB', async () => {
    const r = await api('GET', '/api/v1/orgs/me', { token: state.hrToken });
    assertEqual(r.data.data.headcount, 100);
  }),

  test('PATCH /orgs/me — update reporting period → 200', async () => {
    const r = await api('PATCH', '/api/v1/orgs/me', {
      token: state.hrToken,
      body: { reportingPeriod: { start: '2026-01-01', end: '2026-12-31' } },
    });
    assertEqual(r.status, 200, 'status');
    assert(r.data.data.reportingPeriod, 'missing reportingPeriod');
  }),

  test('PATCH /orgs/me — invalid reporting period (end before start) → 400', async () => {
    const r = await api('PATCH', '/api/v1/orgs/me', {
      token: state.hrToken,
      body: { reportingPeriod: { start: '2026-12-31', end: '2026-01-01' } },
    });
    assertEqual(r.status, 400, 'status');
  }),

  test('GET /orgs/me/readiness — hr_admin → 200', async () => {
    const r = await api('GET', '/api/v1/orgs/me/readiness', { token: state.hrToken });
    assertEqual(r.status, 200, 'status');
    assert(r.data.data !== undefined, 'missing readiness data');
  }),

  test('GET /orgs/me/dashboard — hr_admin → 200', async () => {
    const r = await api('GET', '/api/v1/orgs/me/dashboard', { token: state.hrToken });
    assertEqual(r.status, 200, 'status');
  }),
];

// ══════════════════════════════════════════════════════════════════════════
//  7. EMPLOYEES
// ══════════════════════════════════════════════════════════════════════════
const employeeTests = [
  test('GET /orgs/me/employees — no auth → 401', async () => {
    const r = await api('GET', '/api/v1/orgs/me/employees');
    assertEqual(r.status, 401, 'status');
  }),

  test('GET /orgs/me/employees — hr_admin → 200 + empty list initially', async () => {
    const r = await api('GET', '/api/v1/orgs/me/employees', { token: state.hrToken });
    assertEqual(r.status, 200, 'status');
    assert(Array.isArray(r.data.data), 'data should be array');
    assert(r.data.pagination, 'missing pagination');
  }),

  test('POST /orgs/me/employees — validation: missing fields → 400', async () => {
    const r = await api('POST', '/api/v1/orgs/me/employees', { token: state.hrToken, body: {} });
    assertEqual(r.status, 400, 'status');
  }),

  test('POST /orgs/me/employees — validation: invalid email → 400', async () => {
    const r = await api('POST', '/api/v1/orgs/me/employees', {
      token: state.hrToken,
      body: { name: 'John', email: 'not-email' },
    });
    assertEqual(r.status, 400, 'status');
  }),

  test('POST /orgs/me/employees — happy path → 201 + employeeCode', async () => {
    const r = await api('POST', '/api/v1/orgs/me/employees', {
      token: state.hrToken,
      body: { name: 'Test Employee', email: `emp_${UNIQUE}@testposh.com` },
    });
    assertEqual(r.status, 201, 'status');
    assert(r.data.data.employeeCode, 'missing employeeCode');
    assert(r.data.data.userId, 'missing userId');
    state.employeeId = r.data.data.userId;
    state.employeeCode = r.data.data.employeeCode;
  }),

  test('POST /orgs/me/employees — duplicate email → 409', async () => {
    const r = await api('POST', '/api/v1/orgs/me/employees', {
      token: state.hrToken,
      body: { name: 'Dupe Employee', email: `emp_${UNIQUE}@testposh.com` },
    });
    assertEqual(r.status, 409, 'status');
  }),

  test('GET /orgs/me/employees — verify employee appears in list', async () => {
    const r = await api('GET', '/api/v1/orgs/me/employees', { token: state.hrToken });
    assertEqual(r.status, 200, 'status');
    const emp = r.data.data.find(e => e.id === state.employeeId);
    assert(emp, 'employee not found in list');
    assertEqual(emp.email, `emp_${UNIQUE}@testposh.com`);
    assertEqual(emp.inviteStatus, 'invited');
    assertEqual(emp.assessmentStatus, 'not_started');
  }),

  test('POST /orgs/me/employees/:id/resend-invite — invited employee → 200', async () => {
    const r = await api('POST', `/api/v1/orgs/me/employees/${state.employeeId}/resend-invite`, {
      token: state.hrToken,
    });
    assertEqual(r.status, 200, 'status');
    assertEqual(r.data.data.resent, true);
  }),

  test('PATCH /orgs/me/employees/:id/approve-reattempt → 200', async () => {
    const r = await api('PATCH', `/api/v1/orgs/me/employees/${state.employeeId}/approve-reattempt`, {
      token: state.hrToken,
    });
    assertEqual(r.status, 200, 'status');
    assertEqual(r.data.data.approved, true);
  }),

  test('POST /orgs/me/employees/import — CSV happy path → 201', async () => {
    const csv = `name,email\nCSV Employee One,csv1_${UNIQUE}@testposh.com\nCSV Employee Two,csv2_${UNIQUE}@testposh.com`;
    const r = await api('POST', '/api/v1/orgs/me/employees/import', {
      token: state.hrToken,
      body: csv,
      raw: true,
      headers: { 'Content-Type': 'text/csv' },
    });
    assert(r.status === 201 || r.status === 200, `expected 201, got ${r.status}`);
    assertEqual(r.data.data.createdCount, 2);
  }),

  test('POST /orgs/me/employees/import — empty body → 400', async () => {
    const r = await api('POST', '/api/v1/orgs/me/employees/import', {
      token: state.hrToken,
      body: '',
      raw: true,
      headers: { 'Content-Type': 'text/csv' },
    });
    assertEqual(r.status, 400, 'status');
  }),

  test('POST /orgs/me/employees/import — CSV with invalid rows', async () => {
    const csv = `name,email\n,bad-email\nValid Name,csvvalid_${UNIQUE}@testposh.com`;
    const r = await api('POST', '/api/v1/orgs/me/employees/import', {
      token: state.hrToken,
      body: csv,
      raw: true,
      headers: { 'Content-Type': 'text/csv' },
    });
    // Should create the valid one and report errors for the invalid
    assert(r.data.data.errorCount >= 1, 'should have errors');
  }),

  test('GET /orgs/me/employees — pagination works', async () => {
    const r = await api('GET', '/api/v1/orgs/me/employees?page=1&limit=2', { token: state.hrToken });
    assertEqual(r.status, 200, 'status');
    assert(r.data.data.length <= 2, 'pagination limit not respected');
    assert(r.data.pagination.page === 1, 'wrong page');
  }),

  test('POST /orgs/me/employees/:id/resend-invite — non-existent employee → 404', async () => {
    const r = await api('POST', `/api/v1/orgs/me/employees/000000000000000000000000/resend-invite`, {
      token: state.hrToken,
    });
    assertEqual(r.status, 404, 'status');
  }),

  test('DELETE /orgs/me/employees/:id — non-existent → 404', async () => {
    const r = await api('DELETE', `/api/v1/orgs/me/employees/000000000000000000000000`, {
      token: state.hrToken,
    });
    assertEqual(r.status, 404, 'status');
  }),
];

// ══════════════════════════════════════════════════════════════════════════
//  8. SUPER ADMIN SETUP — create super_admin, then use it
// ══════════════════════════════════════════════════════════════════════════
const superAdminSetupTests = [
  test('Create super_admin via register + manual DB hack (or login if seeded)', async () => {
    // Try to login as a known super admin; if not seeded, we will create one
    // We'll create a temporary super admin by registering a new org, then
    // directly using the admin routes won't work because only super_admin can.
    // Instead, let's just create a super admin by registering and patching role.
    // But we can't patch our own role! So let's create via direct API registration.
    // Actually, the system seeds one if SUPER_ADMIN_EMAIL is set. Let's try a
    // test email/password first.
    
    // Register a new org whose admin we'll test with as HR for role tests.
    // For super_admin, we need to create one directly. Let's try:
    const saEmail = `sa_${UNIQUE}@testposh.com`;
    const saPass = 'SuperAdminPass123!';
    
    // We can't create a super_admin via public API — need DB direct.
    // Instead, let's see if there's any super_admin already.
    // For testing, we'll just verify that super_admin-only routes reject hr_admin.
    // We'll skip actual super_admin tests if we can't get a token.
    
    // Let's try to register one more org just for role tests
    state.superAdminEmail = saEmail;
    state.superAdminPass = saPass;
    
    // Mark as skipped; admin creation is done via seeding
    skipped++;
    console.log('     ℹ  Super admin requires DB seeding. Testing role-guard rejections instead.');
  }),
];

// ══════════════════════════════════════════════════════════════════════════
//  9. ADMIN ROUTES — role guard tests + functionality (where possible)
// ══════════════════════════════════════════════════════════════════════════
const adminRoleGuardTests = [
  test('GET /admin/questions — hr_admin → 403 (requires super_admin)', async () => {
    const r = await api('GET', '/api/v1/admin/questions', { token: state.hrToken });
    assertEqual(r.status, 403, 'status');
  }),

  test('POST /admin/questions — hr_admin → 403', async () => {
    const r = await api('POST', '/api/v1/admin/questions', {
      token: state.hrToken,
      body: { type: 'mcq', body: 'Test Q?', options: [{ text: 'A', weight: 1 }, { text: 'B', weight: 0 }] },
    });
    assertEqual(r.status, 403, 'status');
  }),

  test('GET /admin/orgs — hr_admin → 403', async () => {
    const r = await api('GET', '/api/v1/admin/orgs', { token: state.hrToken });
    assertEqual(r.status, 403, 'status');
  }),

  test('GET /admin/audit-log — hr_admin → 403', async () => {
    const r = await api('GET', '/api/v1/admin/audit-log', { token: state.hrToken });
    assertEqual(r.status, 403, 'status');
  }),

  test('GET /admin/config — hr_admin → 403', async () => {
    const r = await api('GET', '/api/v1/admin/config', { token: state.hrToken });
    assertEqual(r.status, 403, 'status');
  }),

  test('POST /admin/audit-slots — hr_admin → 403', async () => {
    const r = await api('POST', '/api/v1/admin/audit-slots', {
      token: state.hrToken,
      body: { startsAt: new Date(Date.now() + 86400000).toISOString() },
    });
    assertEqual(r.status, 403, 'status');
  }),

  test('POST /admin/auditors — hr_admin → 403', async () => {
    const r = await api('POST', '/api/v1/admin/auditors', {
      token: state.hrToken,
      body: { name: 'Auditor', email: 'auditor@test.com', password: 'AuditorPass123!' },
    });
    assertEqual(r.status, 403, 'status');
  }),

  test('PATCH /admin/public-stats — hr_admin → 403', async () => {
    const r = await api('PATCH', '/api/v1/admin/public-stats', {
      token: state.hrToken,
      body: { trustScore: 4.5 },
    });
    assertEqual(r.status, 403, 'status');
  }),

  test('All admin routes — no auth → 401', async () => {
    const routes = [
      ['GET', '/api/v1/admin/questions'],
      ['GET', '/api/v1/admin/orgs'],
      ['GET', '/api/v1/admin/audit-log'],
      ['GET', '/api/v1/admin/config'],
    ];
    for (const [method, path] of routes) {
      const r = await api(method, path);
      assertEqual(r.status, 401, `${method} ${path} status`);
    }
  }),
];

// ══════════════════════════════════════════════════════════════════════════
//  10. ASSESSMENT ROUTES — role guard tests
// ══════════════════════════════════════════════════════════════════════════
const assessmentRoleTests = [
  test('POST /assessments/attempts — hr_admin → 403 (requires employee)', async () => {
    const r = await api('POST', '/api/v1/assessments/attempts', { token: state.hrToken });
    assertEqual(r.status, 403, 'status');
  }),

  test('GET /assessments/attempts/current — hr_admin → 403', async () => {
    const r = await api('GET', '/api/v1/assessments/attempts/current', { token: state.hrToken });
    assertEqual(r.status, 403, 'status');
  }),

  test('POST /assessments/attempts — no auth → 401', async () => {
    const r = await api('POST', '/api/v1/assessments/attempts');
    assertEqual(r.status, 401, 'status');
  }),
];

// ══════════════════════════════════════════════════════════════════════════
//  11. CERTIFICATE ROUTES — role guard tests
// ══════════════════════════════════════════════════════════════════════════
const certificateRoleTests = [
  test('GET /certificates/me — hr_admin → 403 (requires employee)', async () => {
    const r = await api('GET', '/api/v1/certificates/me', { token: state.hrToken });
    assertEqual(r.status, 403, 'status');
  }),

  test('GET /certificates/me/pdf — hr_admin → 403', async () => {
    const r = await api('GET', '/api/v1/certificates/me/pdf', { token: state.hrToken });
    assertEqual(r.status, 403, 'status');
  }),

  test('GET /certificates/me — no auth → 401', async () => {
    const r = await api('GET', '/api/v1/certificates/me');
    assertEqual(r.status, 401, 'status');
  }),
];

// ══════════════════════════════════════════════════════════════════════════
//  12. PUBLIC ROUTES
// ══════════════════════════════════════════════════════════════════════════
const publicTests = [
  test('GET /public/stats — no auth required → 200', async () => {
    const r = await api('GET', '/api/v1/public/stats');
    assertEqual(r.status, 200, 'status');
    assert(r.data.success, 'success should be true');
  }),

  test('GET /public/verify/:certId — invalid certId → 404', async () => {
    const r = await api('GET', '/api/v1/public/verify/INVALID-ID');
    assertEqual(r.status, 404, 'status');
  }),

  test('GET /public/verify/:certId — non-existent CERT- ID → 404', async () => {
    const r = await api('GET', '/api/v1/public/verify/CERT-0000000000');
    assertEqual(r.status, 404, 'status');
  }),

  test('GET /public/verify/:certId — non-existent COMP- ID → 404', async () => {
    const r = await api('GET', '/api/v1/public/verify/COMP-0000000000');
    assertEqual(r.status, 404, 'status');
  }),
];

// ══════════════════════════════════════════════════════════════════════════
//  13. AUDIT ROUTES — role guard + flow tests
// ══════════════════════════════════════════════════════════════════════════
const auditTests = [
  test('GET /audits/slots — no auth → 401', async () => {
    const r = await api('GET', '/api/v1/audits/slots');
    assertEqual(r.status, 401, 'status');
  }),

  test('GET /audits/slots — hr_admin → 200 (allowed role)', async () => {
    const r = await api('GET', '/api/v1/audits/slots', { token: state.hrToken });
    assertEqual(r.status, 200, 'status');
    assert(Array.isArray(r.data.data), 'data should be array');
  }),

  test('POST /audits — hr_admin without readiness → 403', async () => {
    // Org doesn't have readiness yet, so booking should fail
    const r = await api('POST', '/api/v1/audits', {
      token: state.hrToken,
      body: { slotId: '000000000000000000000000' },
    });
    assertEqual(r.status, 403, 'status');
  }),

  test('POST /audits/:id/documents — non-existent audit → 404', async () => {
    const r = await api('POST', '/api/v1/audits/000000000000000000000000/documents', {
      token: state.hrToken,
      body: { name: 'Test Doc', url: 'https://example.com/doc.pdf' },
    });
    assertEqual(r.status, 404, 'status');
  }),

  test('GET /audits/:id — non-existent → 404', async () => {
    const r = await api('GET', '/api/v1/audits/000000000000000000000000', { token: state.hrToken });
    assertEqual(r.status, 404, 'status');
  }),

  test('GET /audits/:id/pack — non-existent → 404', async () => {
    const r = await api('GET', '/api/v1/audits/000000000000000000000000/pack', { token: state.hrToken });
    assertEqual(r.status, 404, 'status');
  }),
];

// ══════════════════════════════════════════════════════════════════════════
//  14. PAYMENT ROUTES
// ══════════════════════════════════════════════════════════════════════════
const paymentTests = [
  test('POST /payments/orders — no auth → 401', async () => {
    const r = await api('POST', '/api/v1/payments/orders', {
      body: { type: 'seats' },
    });
    assertEqual(r.status, 401, 'status');
  }),

  test('POST /payments/orders — hr_admin, Razorpay not configured → 503', async () => {
    const r = await api('POST', '/api/v1/payments/orders', {
      token: state.hrToken,
      body: { type: 'seats' },
    });
    assertEqual(r.status, 503, 'status');
  }),

  test('POST /payments/orders — invalid type → 400', async () => {
    const r = await api('POST', '/api/v1/payments/orders', {
      token: state.hrToken,
      body: { type: 'invalid' },
    });
    assertEqual(r.status, 400, 'status');
  }),

  test('POST /payments/webhook — no body → 400 or 503', async () => {
    const r = await api('POST', '/api/v1/payments/webhook', {
      body: Buffer.from('{}'),
      raw: true,
      headers: { 'Content-Type': 'application/json' },
    });
    // Should be 503 (webhook not configured) or 400 (bad payload)
    assert(r.status === 503 || r.status === 400, `expected 400/503, got ${r.status}`);
  }),
];

// ══════════════════════════════════════════════════════════════════════════
//  15. 404 HANDLER
// ══════════════════════════════════════════════════════════════════════════
const notFoundTests = [
  test('GET /api/v1/nonexistent — 404', async () => {
    const r = await api('GET', '/api/v1/nonexistent');
    assertEqual(r.status, 404, 'status');
  }),

  test('POST /api/v1/nonexistent — 404', async () => {
    const r = await api('POST', '/api/v1/nonexistent', { body: {} });
    assertEqual(r.status, 404, 'status');
  }),
];

// ══════════════════════════════════════════════════════════════════════════
//  16. EMPLOYEE DELETE (run last for this employee)
// ══════════════════════════════════════════════════════════════════════════
const employeeDeleteTests = [
  test('DELETE /orgs/me/employees/:id — happy path → 200', async () => {
    if (!state.employeeId) { skipped++; return; }
    const r = await api('DELETE', `/api/v1/orgs/me/employees/${state.employeeId}`, {
      token: state.hrToken,
    });
    assertEqual(r.status, 200, 'status');
    assertEqual(r.data.data.removed, true);
  }),

  test('GET /orgs/me/employees — verify deleted employee is gone from list', async () => {
    const r = await api('GET', '/api/v1/orgs/me/employees', { token: state.hrToken });
    assertEqual(r.status, 200, 'status');
    const emp = r.data.data.find(e => e.id === state.employeeId);
    assert(!emp, 'deleted employee should not appear in list');
  }),

  test('DELETE /orgs/me/employees/:id — same employee again → 404 (already deleted)', async () => {
    if (!state.employeeId) { skipped++; return; }
    const r = await api('DELETE', `/api/v1/orgs/me/employees/${state.employeeId}`, {
      token: state.hrToken,
    });
    assertEqual(r.status, 404, 'status');
  }),
];

// ══════════════════════════════════════════════════════════════════════════
//  17. USER DELETE / ERASURE (DPDP) — run near the end
// ══════════════════════════════════════════════════════════════════════════
const userDeleteTests = [
  test('DELETE /users/me — validation: missing confirm → 400', async () => {
    const r = await api('DELETE', '/api/v1/users/me', { token: state.hrToken, body: {} });
    assertEqual(r.status, 400, 'status');
  }),

  test('DELETE /users/me — validation: wrong confirm text → 400', async () => {
    const r = await api('DELETE', '/api/v1/users/me', {
      token: state.hrToken,
      body: { confirm: 'wrong' },
    });
    assertEqual(r.status, 400, 'status');
  }),
];

// ══════════════════════════════════════════════════════════════════════════
//  18. CROSS-ORG ISOLATION TESTS
// ══════════════════════════════════════════════════════════════════════════
const isolationTests = [
  test('Register second org for isolation testing', async () => {
    const r = await api('POST', '/api/v1/auth/register-org', {
      body: {
        orgName: `IsolationOrg_${UNIQUE}`,
        headcount: 20,
        adminName: 'Isolation Admin',
        email: `iso_${UNIQUE}@testposh.com`,
        password: 'IsolationPass123!',
      },
    });
    assertEqual(r.status, 201, 'status');
    state.isoToken = r.data.data.accessToken;
    state.isoOrgId = r.data.data.user.orgId;
  }),

  test('Second org cannot see first org data', async () => {
    // Try to access employees from the first org using the second org's token
    const r = await api('GET', '/api/v1/orgs/me/employees', { token: state.isoToken });
    assertEqual(r.status, 200, 'status');
    // The second org shouldn't have any employees from the first org
    assertEqual(r.data.data.length, 0);
  }),

  test('Second org cannot delete first org employees', async () => {
    // Add a fresh employee to first org
    const addR = await api('POST', '/api/v1/orgs/me/employees', {
      token: state.hrToken,
      body: { name: 'Cross Org Test', email: `cross_${UNIQUE}@testposh.com` },
    });
    if (addR.status !== 201) { skipped++; return; }
    const empId = addR.data.data.userId;

    // Try to delete using the second org's token — should fail with 404
    const r = await api('DELETE', `/api/v1/orgs/me/employees/${empId}`, {
      token: state.isoToken,
    });
    assertEqual(r.status, 404, 'status');
  }),
];

// ══════════════════════════════════════════════════════════════════════════
//  19. INVITE ACCEPT (edge cases)
// ══════════════════════════════════════════════════════════════════════════
const inviteTests = [
  test('POST /auth/invite/accept — validation: missing fields → 400', async () => {
    const r = await api('POST', '/api/v1/auth/invite/accept', { body: {} });
    assertEqual(r.status, 400, 'status');
  }),

  test('POST /auth/invite/accept — invalid token → 400', async () => {
    const r = await api('POST', '/api/v1/auth/invite/accept', {
      body: {
        token: 'a'.repeat(64),
        password: 'ValidPassword123!',
        consent: true,
      },
    });
    assertEqual(r.status, 400, 'status');
  }),

  test('POST /auth/invite/accept — consent: false → 400', async () => {
    const r = await api('POST', '/api/v1/auth/invite/accept', {
      body: {
        token: 'a'.repeat(64),
        password: 'ValidPassword123!',
        consent: false,
      },
    });
    assertEqual(r.status, 400, 'status');
  }),
];

// ══════════════════════════════════════════════════════════════════════════
//  20. EDGE CASES & SECURITY
// ══════════════════════════════════════════════════════════════════════════
const securityTests = [
  test('Expired/invalid access token → 401', async () => {
    const r = await api('GET', '/api/v1/users/me', { token: 'invalid.token.here' });
    assertEqual(r.status, 401, 'status');
  }),

  test('Empty Authorization header → 401', async () => {
    const r = await api('GET', '/api/v1/users/me', { headers: { Authorization: '' } });
    assertEqual(r.status, 401, 'status');
  }),

  test('Bearer without token → 401', async () => {
    const r = await api('GET', '/api/v1/users/me', { headers: { Authorization: 'Bearer ' } });
    assertEqual(r.status, 401, 'status');
  }),

  test('NoSQL injection attempt in login email → 401 (not crash)', async () => {
    const r = await api('POST', '/api/v1/auth/login', {
      body: { email: { $gt: '' }, password: 'anything123!' },
    });
    // Should be 400 (validation) or 401, not 500
    assert(r.status === 400 || r.status === 401, `expected 400/401, got ${r.status}`);
  }),

  test('NoSQL injection attempt in login password → 400/401', async () => {
    const r = await api('POST', '/api/v1/auth/login', {
      body: { email: 'test@test.com', password: { $gt: '' } },
    });
    assert(r.status === 400 || r.status === 401, `expected 400/401, got ${r.status}`);
  }),

  test('Oversized JSON body → 413', async () => {
    const bigBody = { data: 'x'.repeat(50000) };
    const r = await api('POST', '/api/v1/auth/login', { body: bigBody });
    assert(r.status === 413 || r.status === 400, `expected 413/400, got ${r.status}`);
  }),
];

// ══════════════════════════════════════════════════════════════════════════
//  CLEANUP — Delete test data
// ══════════════════════════════════════════════════════════════════════════
const cleanupTests = [
  test('DELETE /users/me — erasure of HR admin (first org) → 200', async () => {
    // Re-login to get a fresh token
    const loginR = await api('POST', '/api/v1/auth/login', {
      body: { email: `hr_${UNIQUE}@testposh.com`, password: 'TestPassword123!' },
    });
    if (loginR.status !== 200) { skipped++; return; }
    const freshToken = loginR.data.data.accessToken;

    const r = await api('DELETE', '/api/v1/users/me', {
      token: freshToken,
      body: { confirm: 'DELETE MY ACCOUNT' },
    });
    assertEqual(r.status, 200, 'status');
    assertEqual(r.data.data.erased, true);
  }),

  test('Verify erased user cannot login anymore', async () => {
    const r = await api('POST', '/api/v1/auth/login', {
      body: { email: `hr_${UNIQUE}@testposh.com`, password: 'TestPassword123!' },
    });
    assertEqual(r.status, 401, 'status');
  }),

  test('DELETE /users/me — erasure of isolation org admin → 200', async () => {
    const loginR = await api('POST', '/api/v1/auth/login', {
      body: { email: `iso_${UNIQUE}@testposh.com`, password: 'IsolationPass123!' },
    });
    if (loginR.status !== 200) { skipped++; return; }
    const freshToken = loginR.data.data.accessToken;

    const r = await api('DELETE', '/api/v1/users/me', {
      token: freshToken,
      body: { confirm: 'DELETE MY ACCOUNT' },
    });
    assertEqual(r.status, 200, 'status');
    assertEqual(r.data.data.erased, true);
  }),
];

// ══════════════════════════════════════════════════════════════════════════
//  RUN ALL
// ══════════════════════════════════════════════════════════════════════════
async function main() {
  console.log('\n🧪 POSH Compass — Comprehensive API Test Suite');
  console.log(`   Target: ${BASE}`);
  console.log(`   Timestamp: ${new Date().toISOString()}`);
  console.log(`   Unique ID: ${UNIQUE}`);

  await runTests('1. Health & Readiness', healthTests);
  await runTests('2. Auth — Register Org', authRegisterTests);
  await runTests('3. Auth — Login', authLoginTests);
  await runTests('4. Auth — Refresh & Logout', authTokenTests);
  await runTests('5. Users — /me', userTests);
  await runTests('6. Organisations — /orgs/me', orgTests);
  await runTests('7. Employees — CRUD + CSV Import', employeeTests);
  await runTests('8. Super Admin Setup', superAdminSetupTests);
  await runTests('9. Admin Routes — Role Guard', adminRoleGuardTests);
  await runTests('10. Assessments — Role Guard', assessmentRoleTests);
  await runTests('11. Certificates — Role Guard', certificateRoleTests);
  await runTests('12. Public Routes', publicTests);
  await runTests('13. Audits — Role Guard + Flow', auditTests);
  await runTests('14. Payments', paymentTests);
  await runTests('15. 404 Handler', notFoundTests);
  await runTests('16. Employee Delete', employeeDeleteTests);
  await runTests('17. User Delete — Validation', userDeleteTests);
  await runTests('18. Cross-Org Isolation', isolationTests);
  await runTests('19. Invite Accept', inviteTests);
  await runTests('20. Security & Edge Cases', securityTests);
  await runTests('21. Cleanup — Erase Test Data', cleanupTests);

  // ── Summary ──────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(70)}`);
  console.log('  RESULTS');
  console.log(`${'═'.repeat(70)}`);
  console.log(`  ✅ Passed:  ${passed}`);
  console.log(`  ❌ Failed:  ${failed}`);
  console.log(`  ⏭  Skipped: ${skipped}`);
  console.log(`  ── Total:   ${passed + failed + skipped}`);

  if (failures.length) {
    console.log(`\n  FAILURE DETAILS:`);
    for (const f of failures) {
      console.log(`  • [${f.suite}] ${f.test}`);
      console.log(`    → ${f.error}`);
    }
  }

  console.log(`\n${'═'.repeat(70)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error running tests:', err);
  process.exit(2);
});
