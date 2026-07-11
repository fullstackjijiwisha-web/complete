/* POSH Compass — organisation admin dashboard, wired to the real API.
   Data sources (all hr_admin):
     GET  /orgs/me                    → org record incl. seatsActive
     GET  /orgs/me/dashboard          → §5.1 aggregates (60s server cache)
     GET  /orgs/me/employees          → paginated roster
     POST /orgs/me/employees          → enrol one (magic-link invite)
     POST /orgs/me/employees/import   → CSV bulk enrol
   Charts are hand-rolled SVG (validated palette). */
(function () {
  "use strict";

  const PC = window.PC;
  const RAMP = ["#7bb897", "#57a47c", "#35905d", "#1e7a4e", "#14532f"];
  const BAND_LABEL = { below_60: "<60", "60_69": "60–69", "70_79": "70–79", "80_89": "80–89", "90_100": "90–100" };
  const root = document.getElementById("dash-root");
  if (!root) return;

  let rosterPage = 1;

  /* ================= entry ================= */
  document.addEventListener("DOMContentLoaded", async function () {
    let user;
    try {
      user = await PC.me();
    } catch (e) {
      return showMessage("Backend not running",
        'Start the server with <span class="mono">npm run dev</span> and open <span class="mono">http://localhost:3000/dashboard.html</span>');
    }
    if (user === null) {
      const probe = await fetch("/health").then(r => r.ok).catch(() => false);
      if (!probe) return showMessage("Backend not running",
        'Start the server with <span class="mono">npm run dev</span> and open <span class="mono">http://localhost:3000/dashboard.html</span>');
      return showLogin();
    }
    if (user.role !== "hr_admin" && user.role !== "super_admin") {
      return showMessage("Admin access required",
        'This view is for organisation HR admins. <a href="employee.html" style="color:var(--green-700);font-weight:600">Go to your employee dashboard →</a>');
    }
    load();
  });

  function showMessage(title, html) {
    root.innerHTML =
      '<div class="dash-header"><div><h1>Dashboard</h1></div></div>' +
      '<div class="chart-card center" style="padding:48px"><h2 class="h-md">' + title + "</h2>" +
      '<p class="small muted mt-2">' + html + "</p></div>";
  }

  function showLogin() {
    root.innerHTML =
      '<div class="dash-header"><div><h1>Dashboard Overview</h1><div class="sub">Sign in to see your organisation\'s live data</div></div></div>' +
      '<div class="chart-card center" style="padding:48px">' +
      '<h2 class="h-md">Sign in required</h2>' +
      '<p class="small muted mt-1 mb-2">The dashboard is computed from your organisation\'s real assessment records.</p>' +
      '<div class="flex" style="justify-content:center">' +
      '<button class="btn btn-orange" data-login>Login</button>' +
      '<button class="btn btn-ghost" data-register>Register Organisation</button>' +
      "</div></div>";
  }

  /* ================= main render ================= */
  async function load() {
    let org, s, rosterRes;
    try {
      org = await PC.api("/orgs/me");
      s = await PC.api("/orgs/me/dashboard");
      rosterRes = await PC.api("/orgs/me/employees?page=" + rosterPage + "&limit=100");
    } catch (e) {
      return showMessage("Could not load data", PC.esc(e.message));
    }
    const roster = rosterRes.data || rosterRes;
    const pagination = rosterRes.pagination || { total: roster.length, page: 1, totalPages: 1 };

    const sideFoot = document.getElementById("side-foot");
    if (sideFoot) sideFoot.innerHTML =
      PC.esc(s.org.name) + '<br>Org code <span class="mono">' + PC.esc(s.org.orgCode) + "</span>";

    const k = s.kpis, r = s.readiness;
    const enrolled = k.completionRate.enrolled;
    const paidBadge = org.seatsActive
      ? '<span class="badge badge-good">✓ Seats active</span>'
      : '<span class="badge badge-warning">◷ Payment pending</span>';
    const readyBadge = r.isReady
      ? '<span class="badge badge-good">★ POSH Ready — recorded for ' + PC.esc(s.cycle) + "</span>"
      : '<span class="badge badge-neutral">Working toward POSH Ready</span>';

    const invitesPending = roster.filter(function (u) { return u.inviteStatus === "invited"; }).length;
    const retrainingFlagged = roster.filter(function (u) { return u.retrainingFlagged; }).length;
    const notCertified = roster.filter(function (u) { return u.assessmentStatus === "not_certified"; }).length;

    root.innerHTML =
      '<div class="dash-header">' +
      "<div><h1>Dashboard Overview</h1>" +
      '<div class="sub">' + PC.esc(s.org.name) + " · " + s.org.headcount.toLocaleString("en-IN") +
      ' declared employees · Org code <span class="mono">' + PC.esc(s.org.orgCode) + "</span> · Cycle " + PC.esc(s.cycle) + "</div></div>" +
      '<div class="flex">' + paidBadge + readyBadge +
      '<a class="btn btn-green btn-sm" href="audit.html">Audit Module</a></div>' +
      "</div>" +

      (!org.seatsActive
        ? '<div class="chart-card mb-3" style="border-color:var(--orange-600)"><div class="flex spread">' +
          '<div><div class="c-title">◷ Seat payment pending</div>' +
          '<div class="c-sub">One payment covers every declared employee — ' + s.org.headcount.toLocaleString("en-IN") +
          " seats. (While the payment gateway is unconfigured in dev, assessments stay unlocked.)</div></div>" +
          '<button class="btn btn-orange" id="btn-dash-pay">Complete Payment</button></div></div>'
        : "") +

      /* KPI tiles */
      '<div class="tile-row">' +
      tile("Employees enrolled", enrolled.toLocaleString("en-IN"),
        "of " + s.org.headcount.toLocaleString("en-IN") + " declared · " + invitesPending + " invite" + (invitesPending === 1 ? "" : "s") + " pending") +
      tile("Employees assessed", k.assessed.value.toLocaleString("en-IN"),
        k.completionRate.value + "% of enrolled" + delta(k.assessed.deltaVsPrevMonth)) +
      tile("Certified individuals", k.certified.value.toLocaleString("en-IN"),
        "current cycle" + delta(k.certified.deltaVsPrevMonth)) +
      tile("Average best score", k.assessed.value ? k.avgScore.value + "%" : "—",
        k.assessed.value ? "across assessed employees" : "no attempts yet") +
      "</div>" +

      /* Readiness hero */
      '<div class="chart-card mb-3">' +
      '<div class="c-head"><div><div class="c-title">Organisation readiness score</div>' +
      '<div class="c-sub">Share of enrolled employees certified this cycle · threshold for POSH Ready: ' + r.threshold + "%</div></div>" +
      (r.isReady
        ? '<span class="badge badge-good">✓ Threshold met' + (r.achievedAt ? " — " + PC.esc(r.achievedAt) : "") + "</span>"
        : '<span class="badge badge-warning">▲ ' + r.certificationsNeeded.toLocaleString("en-IN") + " more certification" + (r.certificationsNeeded === 1 ? "" : "s") + " needed</span>") +
      "</div>" +
      '<div style="display:flex;gap:34px;align-items:center;flex-wrap:wrap;margin-top:14px">' +
      '<div style="font-family:var(--serif);font-size:3.4rem;font-weight:700;line-height:1;color:var(--green-900)">' + r.score + '<span style="font-size:1.6rem">%</span></div>' +
      '<div style="flex:1;min-width:240px">' +
      '<div class="meter" style="margin-top:16px">' +
      '<div class="fill' + (r.isReady ? "" : " warn") + '" style="width:' + Math.min(100, r.score) + '%"></div>' +
      '<div class="threshold" style="left:' + r.threshold + '%" data-label="' + r.threshold + '% = POSH Ready"></div>' +
      "</div>" +
      '<div class="meter-scale"><span>0%</span><span>50%</span><span>100%</span></div></div></div>' +
      '<p class="small muted" style="margin-top:12px">Recomputed after every scored submission. Readiness is tracked at organisation level only — departmental breakdowns are deliberately not collected, to protect confidentiality.</p>' +
      "</div>" +

      /* POSH Ready certificate + audit decision (Steps 5–6) */
      (r.isReady
        ? '<div class="chart-card mb-3">' +
          '<div class="c-head"><div><div class="c-title">★ POSH Ready — organisation certificate</div>' +
          '<div class="c-sub">Issued automatically at ' + r.threshold + '% readiness' +
          (r.certificateIssuedAt ? " on " + PC.esc(r.certificateIssuedAt) : "") +
          '. Attests self-assessed readiness — <strong>not</strong> audited POSH Compliance.</div></div>' +
          (r.certificateId ? '<span class="badge badge-good mono">' + PC.esc(r.certificateId) + "</span>" : "") +
          "</div>" +
          '<div class="flex mt-2" style="flex-wrap:wrap;gap:10px">' +
          (r.certificateId ? '<button class="btn btn-orange" id="btn-ready-cert">⬇ View / Print certificate</button>' : "") +
          (r.certificateVerifyUrl ? '<a class="btn btn-ghost" href="' + PC.esc(r.certificateVerifyUrl) + '" target="_blank" rel="noopener">Verify publicly ↗</a>' : "") +
          "</div>" +
          auditDecision(s.compliance.status) +
          "</div>"
        : "") +

      /* Charts */
      '<div class="card-grid cols-2 mb-3">' +
      '<div class="chart-card"><div class="c-head"><div><div class="c-title">Assessments completed per week</div>' +
      '<div class="c-sub">Last 12 weeks · live · hover for values</div></div></div>' +
      '<div class="c-plot" id="chart-trend"></div>' +
      '<details class="data-view"><summary>View data table</summary><div class="table-wrap" id="table-trend"></div></details></div>' +
      '<div class="chart-card"><div class="c-head"><div><div class="c-title">Score distribution</div>' +
      '<div class="c-sub">' + k.assessed.value.toLocaleString("en-IN") + " assessed · best attempt per employee</div></div></div>" +
      '<div class="c-plot" id="chart-dist"></div>' +
      '<details class="data-view"><summary>View data table</summary><div class="table-wrap" id="table-dist"></div></details></div>' +
      "</div>" +

      /* Attention indicators (roster-derived) */
      '<h2 class="h-sm mb-2" style="font-family:var(--sans)">Needs attention</h2>' +
      '<div class="card-grid cols-3 mb-3">' +
      attnTile("Invites not yet accepted", invitesPending,
        "Enrolled employees who haven't activated their account. Resend from the roster below.",
        invitesPending === 0 ? "good" : "warning") +
      attnTile("Assessed but not certified", notCertified,
        "Best score below the certification threshold — re-attempts draw a rotated paper.",
        notCertified === 0 ? "good" : "warning") +
      attnTile("Re-training flagged", retrainingFlagged,
        "Latest attempt scored below threshold; the flag clears automatically on certification.",
        retrainingFlagged === 0 ? "good" : "serious") +
      "</div>" +

      /* Roster */
      '<div class="chart-card mb-3"><div class="c-head"><div><div class="c-title">Employee roster</div>' +
      '<div class="c-sub">Enrol employees below — each receives a personal invite link' +
      ' <span class="mono">(dev without SMTP: links print in the backend console)</span></div></div>' +
      '<button class="btn btn-ghost btn-sm" id="btn-download-template" style="margin-right:8px">⬇ Download Template</button>' +
      '<button class="btn btn-ghost btn-sm" id="btn-import-csv">⬆ Import CSV</button></div>' +
      '<form class="flex mt-2" id="enrol-form" style="flex-wrap:wrap;gap:10px">' +
      '<input name="name" required minlength="2" placeholder="Full name" style="flex:1;min-width:150px">' +
      '<input type="email" name="email" required placeholder="Work email" style="flex:1.3;min-width:190px">' +
      '<input name="whatsapp" inputmode="tel" maxlength="20" placeholder="WhatsApp (optional)" style="flex:1;min-width:150px">' +
      '<button class="btn btn-green">+ Enrol &amp; send invite</button></form>' +
      '<div id="enrol-msg" class="small mt-1"></div>' +
      '<input type="file" id="csv-file" accept=".csv,text/csv" hidden>' +
      '<div class="table-wrap mt-2" id="roster-wrap"></div>' +
      (pagination.totalPages > 1
        ? '<div class="flex mt-2" style="justify-content:center">' +
          '<button class="btn btn-ghost btn-sm" id="pg-prev"' + (pagination.page <= 1 ? " disabled" : "") + ">← Prev</button>" +
          '<span class="small muted">Page ' + pagination.page + " of " + pagination.totalPages + "</span>" +
          '<button class="btn btn-ghost btn-sm" id="pg-next"' + (pagination.page >= pagination.totalPages ? " disabled" : "") + ">Next →</button></div>"
        : "") +
      "</div>" +

      /* Audit status */
      '<div class="chart-card"><div class="c-head"><div><div class="c-title">Audit status — Jijiwisha Society</div>' +
      '<div class="c-sub">Audit booking unlocks when the ' + r.threshold + "% readiness threshold is met</div></div>" +
      '<a class="btn btn-ghost btn-sm" href="audit.html">Open audit module →</a></div>' +
      '<div class="mini-track">' +
      trackStep(org.seatsActive, "1", "Payment", org.seatsActive ? "Seats active" : "Pending") +
      trackStep(k.assessed.value > 0, "2", "Assessments running", k.assessed.value > 0 ? k.assessed.value.toLocaleString("en-IN") + " assessed" : "None yet") +
      trackStep(r.isReady, "3", "POSH Ready (" + r.threshold + "%)", r.isReady ? "Achieved" : r.score + "% so far") +
      trackStep(["scheduled", "in_review", "changes_requested", "passed", "certificate_issued"].indexOf(s.compliance.status) >= 0,
        "4", "Audit booked",
        (s.compliance.status === "not_started" || s.compliance.status === "requested")
          ? (r.auditUnlocked ? "Book now" : "Locked")
          : s.compliance.status === "declined"
            ? "Declined (optional)"
            : PC.esc(s.compliance.status.replace(/_/g, " "))) +
      trackStep(s.compliance.status === "certificate_issued", "5", "Compliance certificate",
        s.compliance.certificateId ? PC.esc(s.compliance.certificateId) : "Pending") +
      "</div></div>" +

      '<p class="small muted mt-3">All figures are computed live from assessment records by the scoring engine — they cannot be edited manually.</p>';

    /* wire up */
    const pay = document.getElementById("btn-dash-pay");
    if (pay) pay.addEventListener("click", async function () {
      pay.disabled = true;
      try {
        // Primary path: pay via Shopify (redirects out). Seats flip when the
        // Shopify order webhook lands.
        await PC.startShopifyCheckout();
      } catch (e) {
        pay.disabled = false;
        if (e && e.code === "PAYMENTS_NOT_CONFIGURED") {
          PC.startPayment(function () { load(); }); // fall back to Razorpay/mock
        } else {
          alert("Could not start checkout: " + (e.message || e));
        }
      }
    });

    wireEnrolForm();
    wireCsvImport();
    const rc = document.getElementById("btn-ready-cert");
    if (rc) rc.addEventListener("click", openReadyCertPdf);
    const decline = document.getElementById("btn-decline-audit");
    if (decline) decline.addEventListener("click", async function () {
      if (!confirm("Keep only the POSH Ready certificate and skip the audit for now? You can still book the audit later.")) return;
      decline.disabled = true;
      try {
        await PC.api("/orgs/me/audit/decline", { method: "POST", body: {} });
        load();
      } catch (e) { alert("Could not update: " + e.message); decline.disabled = false; }
    });
    const prev = document.getElementById("pg-prev");
    const next = document.getElementById("pg-next");
    if (prev) prev.addEventListener("click", function () { rosterPage--; load(); });
    if (next) next.addEventListener("click", function () { rosterPage++; load(); });

    renderRoster(roster);
    trendChart(s.weeklyAssessments.map(function (w) {
      return { week: fmtWeek(w.weekStart), v: w.count };
    }));
    distChart(s.scoreDistribution.map(function (d) {
      return { band: BAND_LABEL[d.band] || d.band, v: d.count };
    }), k.assessed.value, s.readiness.threshold);
  }

  function fmtWeek(iso) {
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  }

  function delta(d) {
    if (!d) return "";
    return " · " + (d > 0 ? "+" + d : d) + " vs last month";
  }

  /* ================= roster ================= */
  function renderRoster(roster) {
    const wrap = document.getElementById("roster-wrap");
    if (!roster.length) {
      wrap.innerHTML = '<p class="small muted" style="padding:14px">No employees enrolled yet — add the first one above, or import a CSV (columns: name, email, whatsapp — whatsapp optional).</p>';
      return;
    }
    let rows = "";
    roster.forEach(function (u) {
      const status =
        u.assessmentStatus === "certified" ? '<span class="badge badge-good">✓ Certified</span>' :
        u.assessmentStatus === "not_certified" ? '<span class="badge badge-warning">◷ Re-training</span>' :
        u.assessmentStatus === "in_progress" ? '<span class="badge badge-neutral">▶ In progress</span>' :
        '<span class="badge badge-neutral">Not started</span>';
      const invite = u.inviteStatus === "active"
        ? '<span class="badge badge-good">Active</span>'
        : '<span class="badge badge-warning">Invited</span>';
      let actions = "";
      if (u.inviteStatus === "invited")
        actions += '<button class="btn btn-ghost btn-sm" data-resend="' + u.id + '">Resend invite</button> ';
      if (u.assessmentStatus === "not_certified" && u.attemptsUsed >= 3)
        actions += '<button class="btn btn-ghost btn-sm" data-reattempt="' + u.id + '">Approve re-attempt</button> ';
      actions += '<button class="btn btn-ghost btn-sm" data-remove="' + u.id + '" data-name="' + PC.esc(u.name) + '" title="Remove from roster">✕</button>';

      rows += '<tr><td class="mono">' + PC.esc(u.employeeCode || "—") + "</td>" +
        "<td>" + PC.esc(u.name) + "</td>" +
        "<td>" + PC.esc(u.email) + "</td>" +
        '<td class="mono">' + (u.whatsapp ? PC.esc(u.whatsapp) : "—") + "</td>" +
        "<td>" + invite + "</td>" +
        '<td class="num">' + u.attemptsUsed + "</td>" +
        '<td class="num">' + (u.bestScore === null ? "—" : u.bestScore + "%") + "</td>" +
        "<td>" + status + "</td>" +
        '<td style="white-space:nowrap">' + actions + "</td></tr>";
    });
    wrap.innerHTML =
      '<table class="data-table"><thead><tr><th>Code</th><th>Employee</th><th>Email</th><th>WhatsApp</th><th>Invite</th>' +
      '<th class="num">Attempts</th><th class="num">Best score</th><th>Status</th><th>Actions</th></tr></thead><tbody>' +
      rows + "</tbody></table>";

    wrap.querySelectorAll("[data-resend]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        btn.disabled = true;
        try {
          await PC.api("/orgs/me/employees/" + btn.dataset.resend + "/resend-invite", { method: "POST", body: {} });
          btn.textContent = "✓ Invite re-sent";
        } catch (e) { btn.textContent = "Failed"; btn.title = e.message; }
      });
    });
    wrap.querySelectorAll("[data-reattempt]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        btn.disabled = true;
        try {
          await PC.api("/orgs/me/employees/" + btn.dataset.reattempt + "/approve-reattempt", { method: "PATCH", body: {} });
          btn.textContent = "✓ Approved";
        } catch (e) { btn.textContent = "Failed"; btn.title = e.message; }
      });
    });
    wrap.querySelectorAll("[data-remove]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        if (!confirm("Remove " + btn.dataset.name + " from the roster? Their readiness contribution is recomputed.")) return;
        btn.disabled = true;
        try {
          await PC.api("/orgs/me/employees/" + btn.dataset.remove, { method: "DELETE" });
          load();
        } catch (e) { alert("Could not remove: " + e.message); btn.disabled = false; }
      });
    });
  }

  function wireEnrolForm() {
    const form = document.getElementById("enrol-form");
    const msg = document.getElementById("enrol-msg");
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      const btn = form.querySelector("button");
      btn.disabled = true;
      msg.textContent = "";
      try {
        const body = { name: form.name.value, email: form.email.value };
        if (form.whatsapp && form.whatsapp.value.trim()) body.whatsapp = form.whatsapp.value.trim();
        const res = await PC.api("/orgs/me/employees", { body: body });
        msg.innerHTML = '<span style="color:var(--green-700)">✓ Enrolled as <span class="mono">' + PC.esc(res.employeeCode) +
          "</span> — invite sent to " + PC.esc(form.email.value) + ".</span>";
        form.reset();
        load();
      } catch (ex) {
        msg.innerHTML = '<span style="color:var(--status-critical)">' + PC.esc(ex.message) + "</span>";
      } finally {
        btn.disabled = false;
      }
    });
  }

  function wireCsvImport() {
    const fileInput = document.getElementById("csv-file");
    document.getElementById("btn-import-csv").addEventListener("click", function () { fileInput.click(); });
    
    const dlTemplateBtn = document.getElementById("btn-download-template");
    if (dlTemplateBtn) {
      dlTemplateBtn.addEventListener("click", function () {
        PC.downloadFile("/orgs/me/employees/import/template", "employee-import-template.csv");
      });
    }

    fileInput.addEventListener("change", async function () {
      if (!fileInput.files.length) return;
      const text = await fileInput.files[0].text();
      fileInput.value = "";
      try {
        const res = await PC.api("/orgs/me/employees/import", {
          method: "POST",
          rawBody: text,
          headers: { "Content-Type": "text/csv" },
        });
        let html = res.createdCount + " employee" + (res.createdCount === 1 ? "" : "s") + " enrolled and invited.";
        if (res.errorCount) {
          html += "<br><strong>" + res.errorCount + " row" + (res.errorCount === 1 ? "" : "s") + " failed:</strong><br>" +
            res.errors.map(function (er) { return "Row " + er.row + ": " + PC.esc(er.error); }).join("<br>") +
            '<br><br><button class="btn btn-sm btn-orange mt-2" id="btn-download-errors">⬇ Download Error Report (CSV)</button>';
        }
        PC.alertModal("CSV import result", html);
        
        const dlErrorsBtn = document.getElementById("btn-download-errors");
        if (dlErrorsBtn) {
          dlErrorsBtn.addEventListener("click", function () {
            PC.downloadFile("/orgs/me/employees/import/errors", "employee-import-errors.csv");
          });
        }
        
        load();
      } catch (e) {
        PC.alertModal("CSV import failed", PC.esc(e.message));
      }
    });
  }

  /* ================= components ================= */
  function tile(label, value, delta) {
    return '<div class="tile"><div class="t-label">' + label + '</div><div class="t-value">' + value +
      '</div><div class="t-delta">' + delta + "</div></div>";
  }

  function attnTile(label, value, desc, level) {
    const badge =
      level === "good" ? '<span class="badge badge-good">✓ Clear</span>' :
      level === "warning" ? '<span class="badge badge-warning">▲ Follow up</span>' :
      '<span class="badge badge-serious">⚑ Needs attention</span>';
    return '<div class="tile"><div class="flex spread"><div class="t-label">' + label + "</div>" + badge + "</div>" +
      '<div class="t-value">' + value.toLocaleString("en-IN") + "</div>" +
      '<p class="small muted mt-1">' + desc + "</p></div>";
  }

  function trackStep(done, n, title, sub) {
    return '<div class="mt-step' + (done ? " done" : "") + '"><span class="node">' + (done ? "✓" : n) + "</span><strong>" +
      title + "</strong>" + sub + "</div>";
  }

  // Step 6: audit decision shown under the POSH Ready certificate.
  function auditDecision(status) {
    const inProgress = ["scheduled", "in_review", "changes_requested", "passed", "certificate_issued"];
    if (inProgress.indexOf(status) >= 0) {
      return '<div class="mt-3 small"><span class="badge badge-neutral">Audit ' + PC.esc(status.replace(/_/g, " ")) +
        '</span> <a href="audit.html" style="color:var(--green-700);font-weight:600">Open audit module →</a></div>';
    }
    if (status === "declined") {
      return '<div class="mt-3" style="border-top:1px solid var(--border,#e6e2d6);padding-top:14px">' +
        '<p class="small muted">You chose to stop at the POSH Ready certificate. You can still start the Jijiwisha audit anytime to become POSH Compliant.</p>' +
        '<a class="btn btn-green btn-sm" href="audit.html">Take the POSH Audit</a></div>';
    }
    return '<div class="mt-3" style="border-top:1px solid var(--border,#e6e2d6);padding-top:14px">' +
      '<div class="c-title" style="font-size:1rem">Next: POSH Compliance (optional)</div>' +
      '<p class="small muted mt-1">Book a Jijiwisha audit to upgrade to the audited POSH Compliant certificate — or keep only your POSH Ready certificate for now.</p>' +
      '<div class="flex mt-2" style="flex-wrap:wrap;gap:10px">' +
      '<a class="btn btn-green" href="audit.html">Take the POSH Audit</a>' +
      '<button class="btn btn-ghost" id="btn-decline-audit">Not now — keep only the certificate</button>' +
      "</div></div>";
  }

  // Fetches the server-rendered POSH Ready certificate (auth header required, so
  // a plain link won't do) and opens it in a new tab; it auto-prints.
  async function openReadyCertPdf() {
    let token = null;
    try { token = localStorage.getItem("pc.accessToken"); } catch (e) {}
    const w = window.open("", "_blank");
    try {
      const res = await fetch("/api/v1/orgs/me/ready-certificate/pdf", {
        headers: token ? { Authorization: "Bearer " + token } : {},
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const html = await res.text();
      if (w) { w.document.open(); w.document.write(html); w.document.close(); }
    } catch (e) {
      if (w) w.close();
      PC.alertModal("Could not open certificate", PC.esc(e.message));
    }
  }

  /* ================= charts ================= */
  function svgEl(tag, attrs) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }
  function niceMax(v) {
    if (v <= 4) return 4;
    if (v <= 8) return 8;
    if (v <= 12) return 12;
    if (v <= 20) return 20;
    if (v <= 40) return 40;
    if (v <= 100) return Math.ceil(v / 20) * 20;
    return Math.ceil(v / 100) * 100;
  }

  function trendChart(data) {
    const host = document.getElementById("chart-trend");
    const W = 520, H = 230, mL = 40, mR = 46, mT = 14, mB = 26;
    const pw = W - mL - mR, ph = H - mT - mB;
    const maxV = niceMax(Math.max(1, Math.max.apply(null, data.map(d => d.v))));
    const x = (i) => mL + (i / (data.length - 1)) * pw;
    const y = (v) => mT + ph - (v / maxV) * ph;

    const svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, width: "100%", role: "img", "aria-label": "Assessments per week" });
    for (let t = 0; t <= 4; t++) {
      const v = (maxV / 4) * t, yy = y(v);
      svg.appendChild(svgEl("line", { x1: mL, x2: W - mR, y1: yy, y2: yy, stroke: t === 0 ? "var(--axis)" : "var(--grid)", "stroke-width": 1 }));
      const lbl = svgEl("text", { x: mL - 8, y: yy + 4, "text-anchor": "end", "font-size": 10.5, fill: "var(--muted)" });
      lbl.textContent = v; svg.appendChild(lbl);
    }
    data.forEach(function (d, i) {
      if (i % 3 !== 0 && i !== data.length - 1) return;
      const lbl = svgEl("text", { x: x(i), y: H - 8, "text-anchor": "middle", "font-size": 10.5, fill: "var(--muted)" });
      lbl.textContent = d.week; svg.appendChild(lbl);
    });
    let dLine = "";
    data.forEach(function (d, i) { dLine += (i ? " L" : "M") + x(i) + " " + y(d.v); });
    svg.appendChild(svgEl("path", { d: dLine + " L" + x(data.length - 1) + " " + (mT + ph) + " L" + x(0) + " " + (mT + ph) + " Z", fill: "#1e7a4e", opacity: 0.1 }));
    svg.appendChild(svgEl("path", { d: dLine, fill: "none", stroke: "#1e7a4e", "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
    const last = data[data.length - 1];
    svg.appendChild(svgEl("circle", { cx: x(data.length - 1), cy: y(last.v), r: 5, fill: "#1e7a4e", stroke: "var(--surface)", "stroke-width": 2 }));
    const endLbl = svgEl("text", { x: x(data.length - 1) + 9, y: y(last.v) + 4, "font-size": 11.5, "font-weight": 700, fill: "var(--ink)" });
    endLbl.textContent = last.v; svg.appendChild(endLbl);

    const cross = svgEl("line", { y1: mT, y2: mT + ph, stroke: "var(--axis)", "stroke-width": 1, opacity: 0 });
    const hoverDot = svgEl("circle", { r: 5, fill: "#1e7a4e", stroke: "var(--surface)", "stroke-width": 2, opacity: 0 });
    svg.appendChild(cross); svg.appendChild(hoverDot);
    const hit = svgEl("rect", { x: mL, y: mT, width: pw, height: ph, fill: "transparent" });
    svg.appendChild(hit);
    hit.addEventListener("mousemove", function (e) {
      const r = svg.getBoundingClientRect();
      let i = Math.round((((e.clientX - r.left) / r.width) * W - mL) / pw * (data.length - 1));
      i = Math.max(0, Math.min(data.length - 1, i));
      cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.setAttribute("opacity", 1);
      hoverDot.setAttribute("cx", x(i)); hoverDot.setAttribute("cy", y(data[i].v)); hoverDot.setAttribute("opacity", 1);
      PC.tooltip.show(host, "Week of " + data[i].week + "<br><strong>" + data[i].v + "</strong> attempts",
        (x(i) / W) * r.width, (y(data[i].v) / H) * r.height);
    });
    hit.addEventListener("mouseleave", function () {
      cross.setAttribute("opacity", 0); hoverDot.setAttribute("opacity", 0); PC.tooltip.hide();
    });
    host.appendChild(svg);

    document.getElementById("table-trend").innerHTML =
      '<table class="data-table"><thead><tr><th>Week of</th><th class="num">Attempts</th></tr></thead><tbody>' +
      data.map(d => "<tr><td>" + d.week + '</td><td class="num">' + d.v + "</td></tr>").join("") +
      "</tbody></table>";
  }

  function distChart(dist, total, threshold) {
    const host = document.getElementById("chart-dist");
    const W = 520, H = 230, mL = 44, mR = 14, mT = 20, mB = 26;
    const pw = W - mL - mR, ph = H - mT - mB;
    const maxV = niceMax(Math.max(1, Math.max.apply(null, dist.map(d => d.v))));
    const band = pw / dist.length;
    const barW = 24;
    const y = (v) => mT + ph - (v / maxV) * ph;

    const svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, width: "100%", role: "img", "aria-label": "Score distribution" });
    for (let t = 0; t <= 4; t++) {
      const v = (maxV / 4) * t, yy = y(v);
      svg.appendChild(svgEl("line", { x1: mL, x2: W - mR, y1: yy, y2: yy, stroke: t === 0 ? "var(--axis)" : "var(--grid)", "stroke-width": 1 }));
      const lbl = svgEl("text", { x: mL - 8, y: yy + 4, "text-anchor": "end", "font-size": 10.5, fill: "var(--muted)" });
      lbl.textContent = v; svg.appendChild(lbl);
    }
    const bx = mL + band * 3;
    svg.appendChild(svgEl("line", { x1: bx, x2: bx, y1: mT - 6, y2: mT + ph, stroke: "var(--ink)", "stroke-width": 1 }));
    const bl = svgEl("text", { x: bx + 5, y: mT + 2, "font-size": 9.5, "font-weight": 700, fill: "var(--ink)" });
    bl.textContent = (threshold || 80) + "%+ certifies →"; svg.appendChild(bl);

    dist.forEach(function (d, i) {
      const cx = mL + band * i + band / 2;
      const yy = y(d.v);
      const path =
        "M" + (cx - barW / 2) + " " + (mT + ph) +
        " L" + (cx - barW / 2) + " " + Math.min(mT + ph - 1, yy + 4) +
        " Q" + (cx - barW / 2) + " " + yy + " " + (cx - barW / 2 + 4) + " " + yy +
        " L" + (cx + barW / 2 - 4) + " " + yy +
        " Q" + (cx + barW / 2) + " " + yy + " " + (cx + barW / 2) + " " + Math.min(mT + ph - 1, yy + 4) +
        " L" + (cx + barW / 2) + " " + (mT + ph) + " Z";
      const bar = svgEl("path", { d: d.v > 0 ? path : "M0 0", fill: RAMP[i] });
      svg.appendChild(bar);
      const val = svgEl("text", { x: cx, y: yy - 6, "text-anchor": "middle", "font-size": 11, "font-weight": 700, fill: "var(--ink)" });
      val.textContent = d.v; svg.appendChild(val);
      const xl = svgEl("text", { x: cx, y: H - 8, "text-anchor": "middle", "font-size": 10, fill: "var(--muted)" });
      xl.textContent = d.band; svg.appendChild(xl);

      const hit = svgEl("rect", { x: mL + band * i, y: mT, width: band, height: ph, fill: "transparent" });
      svg.appendChild(hit);
      hit.addEventListener("mousemove", function () {
        const r = svg.getBoundingClientRect();
        bar.setAttribute("opacity", 0.85);
        PC.tooltip.show(host, d.band + "<br><strong>" + d.v + "</strong> employee" + (d.v === 1 ? "" : "s") +
          (total ? " · " + ((d.v / total) * 100).toFixed(1) + "%" : ""),
          (cx / W) * r.width, (y(d.v) / H) * r.height);
      });
      hit.addEventListener("mouseleave", function () { bar.setAttribute("opacity", 1); PC.tooltip.hide(); });
    });
    host.appendChild(svg);

    document.getElementById("table-dist").innerHTML =
      '<table class="data-table"><thead><tr><th>Score band</th><th class="num">Employees</th></tr></thead><tbody>' +
      dist.map(d => "<tr><td>" + d.band + '</td><td class="num">' + d.v + "</td></tr>").join("") +
      "</tbody></table>";
  }
})();
