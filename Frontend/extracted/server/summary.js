/* POSH Compass backend — dashboard aggregations.
   Everything the admin and employee dashboards show is computed here from
   real attempts; nothing is hardcoded in the pages any more. */
"use strict";

const { load } = require("./db");
const { PASS_PCT, MCQ_BANK } = require("./questions");

const READINESS_PCT = 95;

function bestAttemptPerUser(attempts) {
  const best = new Map();
  for (const a of attempts) {
    const cur = best.get(a.userId);
    if (!cur || a.pct > cur.pct) best.set(a.userId, a);
  }
  return best;
}

function weekLabel(d) {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function orgSummary(org) {
  const db = load();
  const users = db.users.filter((u) => u.orgId === org.id);
  const attempts = db.attempts.filter((a) => a.orgId === org.id);
  const best = bestAttemptPerUser(attempts);

  const headcount = org.employees;
  const registered = users.length;
  const assessedUsers = [...best.keys()];
  const assessed = assessedUsers.length;
  const certifiedUsers = [...best.values()].filter((a) => a.passed);
  const certified = certifiedUsers.length;

  const completionRate = headcount ? (assessed / headcount) * 100 : 0;
  const readiness = headcount ? (certified / headcount) * 100 : 0;
  const readinessMet = readiness >= READINESS_PCT;
  const needed = Math.max(0, Math.ceil((READINESS_PCT / 100) * headcount) - certified);

  const avgScore = assessed
    ? [...best.values()].reduce((s, a) => s + a.pct, 0) / assessed
    : 0;

  /* score distribution over each user's best attempt */
  const bands = [
    { band: "Below 60%", min: 0, max: 59.99, v: 0 },
    { band: "60–69%", min: 60, max: 69.99, v: 0 },
    { band: "70–79%", min: 70, max: 79.99, v: 0 },
    { band: "80–89%", min: 80, max: 89.99, v: 0 },
    { band: "90–100%", min: 90, max: 100, v: 0 },
  ];
  for (const a of best.values()) {
    const b = bands.find((x) => a.pct >= x.min && a.pct <= x.max);
    if (b) b.v++;
  }

  /* attempts per week, last 12 weeks */
  const weeks = [];
  const nowMs = Date.now();
  for (let i = 11; i >= 0; i--) {
    const start = new Date(nowMs - i * 7 * 864e5);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // Monday
    weeks.push({ start: start.getTime(), week: weekLabel(start), v: 0 });
  }
  for (const a of attempts) {
    const t = new Date(a.createdAt).getTime();
    for (let i = weeks.length - 1; i >= 0; i--) {
      if (t >= weeks[i].start && (i === weeks.length - 1 || t < weeks[i + 1].start)) {
        weeks[i].v++;
        break;
      }
    }
  }

  /* risk indicators — computed from high-impact scenario performance */
  const highTotal = MCQ_BANK.filter((q) => q.impact === 3).length;
  let riskIndex = 0;
  let exposed = 0;
  for (const a of best.values()) {
    if (highTotal && a.highImpactTotal) {
      riskIndex += (a.highImpactWrong / a.highImpactTotal) * 100;
      if (a.highImpactWrong > 0) exposed++;
    }
  }
  riskIndex = assessed ? riskIndex / assessed : 0;
  const exposurePct = assessed ? (exposed / assessed) * 100 : 0;
  const retrainPct = assessed ? ((assessed - certified) / assessed) * 100 : 0;

  return {
    org: {
      name: org.name, orgCode: org.orgCode, paid: !!org.paid,
      paidAt: org.paidAt || null, employees: headcount, createdAt: org.createdAt,
    },
    kpis: {
      headcount, registered, assessed, certified,
      completionRate: round1(completionRate),
      avgScore: round1(avgScore),
      totalAttempts: attempts.length,
    },
    readiness: {
      pct: round1(readiness), threshold: READINESS_PCT,
      met: readinessMet, moreNeeded: needed,
    },
    trend: weeks.map((w) => ({ week: w.week, v: w.v })),
    distribution: bands.map((b) => ({ band: b.band, v: b.v })),
    risk: {
      behaviouralIndex: round1(riskIndex),
      highRiskExposurePct: round1(exposurePct),
      retrainingRatePct: round1(retrainPct),
    },
    passPct: PASS_PCT,
  };
}

function orgEmployees(org) {
  const db = load();
  const users = db.users.filter((u) => u.orgId === org.id);
  const attempts = db.attempts.filter((a) => a.orgId === org.id);
  const best = bestAttemptPerUser(attempts);
  return users.map((u) => {
    const b = best.get(u.id);
    const count = attempts.filter((a) => a.userId === u.id).length;
    return {
      id: u.id, name: u.name, email: u.email, role: u.role,
      attempts: count,
      bestPct: b ? b.pct : null,
      certified: b ? b.passed : false,
      lastAttemptAt: count
        ? attempts.filter((a) => a.userId === u.id).sort((x, y) => y.createdAt.localeCompare(x.createdAt))[0].createdAt
        : null,
    };
  });
}

function employeeSummary(user, org) {
  const db = load();
  const mine = db.attempts
    .filter((a) => a.userId === user.id)
    .sort((x, y) => x.createdAt.localeCompare(y.createdAt));
  const best = mine.reduce((m, a) => (!m || a.pct > m.pct ? a : m), null);
  const certifiedAttempt = mine.filter((a) => a.passed).slice(-1)[0] || null;

  return {
    user: { name: user.name, email: user.email, role: user.role },
    org: { name: org ? org.name : "", paid: org ? !!org.paid : false },
    stats: {
      attempts: mine.length,
      bestPct: best ? best.pct : null,
      certified: !!certifiedAttempt,
      certifiedAt: certifiedAttempt ? certifiedAttempt.createdAt : null,
      improvement:
        mine.length >= 2 ? round1(mine[mine.length - 1].pct - mine[0].pct) : null,
    },
    certificate: certifiedAttempt
      ? {
          name: user.name,
          pct: certifiedAttempt.pct,
          date: certifiedAttempt.createdAt,
          certId: "CERT-" + certifiedAttempt.createdAt.slice(0, 4) + "-" + certifiedAttempt.id.slice(-6).toUpperCase(),
          auditLogRef: certifiedAttempt.evidence.auditLogRef,
          orgName: org ? org.name : "",
        }
      : null,
    history: mine
      .slice()
      .reverse()
      .map((a) => ({
        id: a.id,
        date: a.createdAt,
        format: a.format.toUpperCase(),
        pct: a.pct,
        passed: a.passed,
        auditLogRef: a.evidence.auditLogRef,
      })),
    trend: mine.map((a) => ({ date: a.createdAt, pct: a.pct })),
    passPct: PASS_PCT,
  };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

module.exports = { orgSummary, orgEmployees, employeeSummary };
