/* POSH Compass — employee dashboard, wired to the real API.
     GET /users/me               → identity + organisation
     GET /assessments/attempts   → scored attempt history (threshold, cycle)
     GET /certificates/me        → issued certificates (verify URL)
   Personal score, attempts, certification, trend and a printable certificate. */
(function () {
  "use strict";

  const PC = window.PC;
  const root = document.getElementById("emp-root");
  if (!root) return;

  document.addEventListener("DOMContentLoaded", async function () {
    const user = await PC.me();
    if (user === null) {
      const probe = await fetch("/health").then(r => r.ok).catch(() => false);
      if (!probe) {
        root.innerHTML =
          '<div class="dash-header"><div><h1>My Dashboard</h1></div></div>' +
          '<div class="chart-card center" style="padding:48px"><h2 class="h-md">Backend not running</h2>' +
          '<p class="small muted mt-1">Start it with <span class="mono">npm run dev</span> and open <span class="mono">http://localhost:3000/employee.html</span></p></div>';
        return;
      }
      root.innerHTML =
        '<div class="dash-header"><div><h1>My Dashboard</h1><div class="sub">Sign in to see your scores and certificates</div></div></div>' +
        '<div class="chart-card center" style="padding:48px"><h2 class="h-md">Sign in required</h2>' +
        '<p class="small muted mt-1 mb-2">Enrolled by your organisation? Activate your account with the invite link from your email.</p>' +
        '<div class="flex" style="justify-content:center">' +
        '<button class="btn btn-orange" data-login>Login</button>' +
        '<button class="btn btn-ghost" data-invite>Accept Invite</button></div></div>';
      return;
    }
    if (user.role !== "employee") {
      root.innerHTML =
        '<div class="dash-header"><div><h1>My Dashboard</h1></div></div>' +
        '<div class="chart-card center" style="padding:48px"><h2 class="h-md">This view is for employees</h2>' +
        '<p class="small muted mt-1">You are signed in as an organisation admin. <a href="dashboard.html" style="color:var(--green-700);font-weight:600">Open the admin dashboard →</a></p></div>';
      return;
    }
    load(user);
  });

  async function load(user) {
    let hist, certs;
    try {
      hist = await PC.api("/assessments/attempts");
      certs = await PC.api("/certificates/me");
    } catch (e) {
      root.innerHTML = '<div class="chart-card center" style="padding:48px"><h2 class="h-md">Could not load data</h2><p class="small muted mt-1">' + PC.esc(e.message) + "</p></div>";
      return;
    }

    const orgName = user.org ? user.org.name : "";
    const passPct = hist.threshold;
    const attempts = hist.attempts; // chronological
    const cycleAttempts = attempts.filter(function (a) { return a.cycle === hist.cycle; });
    const cert = certs.length ? certs[0] : null; // newest first from the API

    const bestPct = attempts.length ? Math.max.apply(null, attempts.map(a => a.score)) : null;
    const improvement = attempts.length >= 2
      ? Math.round((attempts[attempts.length - 1].score - attempts[0].score) * 10) / 10
      : null;
    const certified = !!cert;

    const sideFoot = document.getElementById("side-foot");
    if (sideFoot) sideFoot.innerHTML = PC.esc(user.name) + "<br>" + PC.esc(orgName);

    const headerBadge = certified
      ? '<span class="badge badge-good">✓ Certified Individual · since ' + fmtDate(cert.issuedAt) + "</span>"
      : attempts.length
        ? '<span class="badge badge-warning">◷ Not yet certified — ' + passPct + "% needed</span>"
        : '<span class="badge badge-neutral">No attempts yet</span>';

    root.innerHTML =
      '<div class="dash-header">' +
      "<div><h1>Welcome, " + PC.esc(user.name) + "</h1>" +
      '<div class="sub">' + PC.esc(orgName) + " · " + PC.esc(user.email) +
      (user.employeeCode ? ' · <span class="mono">' + PC.esc(user.employeeCode) + "</span>" : "") + "</div></div>" +
      headerBadge + "</div>" +

      /* Below-threshold → POSH training prompt (Step 4) */
      (!certified && attempts.length
        ? '<div class="chart-card mb-3" style="border-color:var(--orange-600)">' +
          '<div class="flex spread" style="flex-wrap:wrap;gap:12px;align-items:center">' +
          '<div><div class="c-title">◷ POSH training recommended</div>' +
          '<div class="c-sub">Your best score is ' + bestPct + "%, below the " + passPct +
          "% certification threshold. Complete a POSH refresher, then take a fresh (rotated) assessment to certify.</div></div>" +
          (hist.trainingUrl
            ? '<a class="btn btn-orange" href="' + PC.esc(hist.trainingUrl) + '" target="_blank" rel="noopener">Take POSH Training ↗</a>'
            : '<button class="btn btn-orange" disabled title="Training link coming soon">Take POSH Training — link coming soon</button>') +
          "</div></div>"
        : "") +

      '<div class="tile-row">' +
      tile("Personal best score", bestPct === null ? "—" : bestPct + "%",
        "Threshold: " + passPct + "% · " + (certified ? '<span class="up">cleared</span>' : "not yet cleared")) +
      tile("Attempts this cycle", cycleAttempts.length + " of " + hist.maxAttemptsPerCycle,
        cycleAttempts.length >= hist.maxAttemptsPerCycle
          ? "limit reached — HR can approve a re-attempt"
          : attempts.length ? "rotated paper on every attempt" : "start your first assessment") +
      tile("Certification status",
        certified ? '<span class="badge badge-good" style="font-size:0.9rem">✓ Certified</span>' : '<span class="badge badge-neutral" style="font-size:0.9rem">Not certified</span>',
        certified ? "counts toward your organisation's readiness" : "score " + passPct + "%+ to certify") +
      tile("Improvement trend",
        improvement === null ? "—" : (improvement >= 0 ? "+" : "") + improvement + ' <span class="muted" style="font-size:1rem">pts</span>',
        improvement === null ? "needs 2+ attempts" : "first attempt → latest attempt") +
      "</div>" +

      '<div class="card-grid cols-2 mb-3" style="align-items:start">' +
      '<div class="chart-card"><div class="c-head"><div><div class="c-title">Score across attempts</div>' +
      '<div class="c-sub">The ' + passPct + "% line is the certification threshold</div></div></div>" +
      '<div class="c-plot" id="chart-attempts"></div>' +
      '<details class="data-view"><summary>View data table</summary><div class="table-wrap" id="table-attempts"></div></details></div>' +

      '<div class="chart-card" id="certificate-card"><div class="c-head"><div><div class="c-title">My certificate</div>' +
      '<div class="c-sub">' + (cert ? "Publicly verifiable by its certificate ID" : "Certify with " + passPct + "%+ to unlock your certificate") + "</div></div></div>" +
      (cert ? certPreview(cert, user, orgName) :
        '<div class="center" style="padding:40px 20px"><p class="small muted">No certificate yet.</p>' +
        '<a class="btn btn-orange mt-2" href="assessment.html">Take the Assessment</a></div>') +
      "</div></div>" +

      '<div class="chart-card"><div class="c-head"><div><div class="c-title">Attempt history</div>' +
      '<div class="c-sub">Every attempt is evidence — scored server-side, timestamped and audit-logged</div></div>' +
      '<a class="btn btn-ghost btn-sm" href="assessment.html">New attempt →</a></div>' +
      '<div class="table-wrap mt-2" id="history-wrap"></div></div>' +

      '<p class="small muted mt-3">Scores and certificates are computed by the assessment engine and cannot be edited. Your data is visible to you and your organisation\'s admin — never to other employees.</p>';

    renderHistory(attempts, passPct);
    if (attempts.length) {
      attemptsChart(attempts.map(function (a) { return { date: a.submittedAt, pct: a.score }; }), passPct);
    } else {
      document.getElementById("chart-attempts").innerHTML =
        '<p class="small muted center" style="padding:44px 10px">No attempts yet — your progress chart appears after your first assessment.</p>';
    }
    if (cert) wireCertificate(cert, user, orgName, passPct);
  }

  function tile(label, value, delta) {
    return '<div class="tile"><div class="t-label">' + label + '</div><div class="t-value">' + value +
      '</div><div class="t-delta">' + delta + "</div></div>";
  }

  function fmtDate(iso) {
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }

  function renderHistory(attempts, passPct) {
    const wrap = document.getElementById("history-wrap");
    if (!attempts.length) {
      wrap.innerHTML = '<p class="small muted" style="padding:14px">No attempts yet.</p>';
      return;
    }
    wrap.innerHTML =
      '<table class="data-table"><thead><tr><th>Date</th><th>Cycle</th><th class="num">Attempt #</th><th class="num">Score</th><th>Status</th></tr></thead><tbody>' +
      attempts.slice().reverse().map(function (h) {
        return "<tr><td>" + fmtDate(h.submittedAt) + '</td><td class="mono">' + PC.esc(h.cycle) +
          '</td><td class="num">' + h.attemptNo + '</td><td class="num">' + h.score + "%</td>" +
          "<td>" + (h.passed ? '<span class="badge badge-good">✓ Passed</span>' : '<span class="badge badge-warning">◷ Re-training</span>') + "</td></tr>";
      }).join("") + "</tbody></table>";
  }

  /* ---------- certificate ---------- */
  function certPreview(c, user, orgName) {
    return (
      '<div class="certificate" style="padding:30px 22px;margin-top:12px">' +
      '<div class="c-brand">✦ POSH COMPASS</div>' +
      '<h2 style="font-size:1.3rem">Certificate of Completion</h2>' +
      '<p class="small muted">This is to certify that</p>' +
      '<div class="c-name" style="font-size:1.5rem">' + PC.esc(user.name) + "</div>" +
      '<p class="c-score small">has successfully completed the POSH Assessment with a score of <strong>' + c.score + "%</strong></p>" +
      '<div class="c-ref">' + PC.esc(c.certId) + " · " + fmtDate(c.issuedAt) + "</div>" +
      "</div>" +
      '<div class="flex mt-2" style="flex-wrap:wrap">' +
      '<button class="btn btn-orange" id="btn-cert">⬇ View / Print Certificate</button>' +
      '<a class="btn btn-ghost" href="' + PC.esc(c.verifyUrl) + '" target="_blank" rel="noopener">Verify publicly ↗</a></div>'
    );
  }

  function wireCertificate(c, user, orgName, passPct) {
    const modal = document.getElementById("cert-modal");
    modal.innerHTML =
      '<div class="modal wide">' +
      '<button class="close" data-close-cert aria-label="Close">✕</button>' +
      '<div class="certificate">' +
      '<div class="c-brand">✦ POSH COMPASS</div>' +
      "<h2>Certificate of Completion</h2>" +
      '<p class="small muted">This is to certify that</p>' +
      '<div class="c-name">' + PC.esc(user.name) + "</div>" +
      '<p class="c-score">has successfully completed the POSH Assessment<br>with a score of <strong>' + c.score + "%</strong> (threshold: " + passPct + "%)</p>" +
      '<p class="small muted">' + PC.esc(orgName) + " · Assessed on the POSH Compass platform</p>" +
      '<div class="c-ref">Certificate ID: ' + PC.esc(c.certId) + " &nbsp;·&nbsp; Cycle: " + PC.esc(c.cycle) + " &nbsp;·&nbsp; Issued: " + fmtDate(c.issuedAt) + "</div>" +
      '<div class="seal">Verified<br>' + passPct + "%+<br>Score</div>" +
      "</div>" +
      '<div class="flex mt-3 no-print" style="justify-content:center">' +
      '<button class="btn btn-orange" id="btn-print-cert">Print / Save as PDF</button>' +
      '<span class="small muted">Anyone can verify this certificate at <span class="mono">' + PC.esc(c.verifyUrl) + "</span></span>" +
      "</div></div>";

    document.getElementById("btn-cert").addEventListener("click", function () { modal.classList.add("open"); });
    modal.addEventListener("click", function (e) {
      if (e.target === modal || e.target.closest("[data-close-cert]")) modal.classList.remove("open");
    });
    document.getElementById("btn-print-cert").addEventListener("click", function () {
      PC.printCertificate({
        title: "Certificate of Completion",
        name: PC.esc(user.name),
        bodyHtml:
          "has successfully completed the POSH Assessment<br>with a score of <strong>" +
          c.score + "%</strong> (threshold: " + passPct + "%)",
        subLine: PC.esc(orgName) + " · Assessed on the POSH Compass platform",
        refLine:
          "Certificate ID: " + PC.esc(c.certId) +
          " · Cycle: " + PC.esc(c.cycle) +
          " · Issued: " + fmtDate(c.issuedAt),
      });
    });
  }

  /* ---------- trend chart ---------- */
  function svgEl(tag, attrs) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  function attemptsChart(trend, passPct) {
    const host = document.getElementById("chart-attempts");
    const W = 520, H = 240, mL = 40, mR = 48, mT = 16, mB = 26;
    const pw = W - mL - mR, ph = H - mT - mB;
    const minV = 0, maxV = 100;
    const n = trend.length;
    const x = (i) => n === 1 ? mL + pw / 2 : mL + (i / (n - 1)) * pw;
    const y = (v) => mT + ph - ((v - minV) / (maxV - minV)) * ph;

    const svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, width: "100%", role: "img", "aria-label": "Score across attempts" });
    [0, 20, 40, 60, 80, 100].forEach(function (v) {
      const yy = y(v);
      svg.appendChild(svgEl("line", { x1: mL, x2: W - mR, y1: yy, y2: yy, stroke: v === 0 ? "var(--axis)" : "var(--grid)", "stroke-width": 1 }));
      const lbl = svgEl("text", { x: mL - 8, y: yy + 4, "text-anchor": "end", "font-size": 10.5, fill: "var(--muted)" });
      lbl.textContent = v + "%"; svg.appendChild(lbl);
    });
    const ty = y(passPct);
    svg.appendChild(svgEl("line", { x1: mL, x2: W - mR, y1: ty, y2: ty, stroke: "var(--ink)", "stroke-width": 1 }));
    const tl = svgEl("text", { x: W - mR - 4, y: ty - 6, "text-anchor": "end", "font-size": 9.5, "font-weight": 700, fill: "var(--ink)" });
    tl.textContent = passPct + "% — certification threshold"; svg.appendChild(tl);

    trend.forEach(function (d, i) {
      if (n > 8 && i % 2 !== 0 && i !== n - 1) return;
      const lbl = svgEl("text", { x: x(i), y: H - 8, "text-anchor": "middle", "font-size": 10, fill: "var(--muted)" });
      lbl.textContent = fmtDate(d.date); svg.appendChild(lbl);
    });

    if (n > 1) {
      let dLine = "";
      trend.forEach(function (d, i) { dLine += (i ? " L" : "M") + x(i) + " " + y(d.pct); });
      svg.appendChild(svgEl("path", { d: dLine + " L" + x(n - 1) + " " + (mT + ph) + " L" + x(0) + " " + (mT + ph) + " Z", fill: "#1e7a4e", opacity: 0.1 }));
      svg.appendChild(svgEl("path", { d: dLine, fill: "none", stroke: "#1e7a4e", "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
    }
    trend.forEach(function (d, i) {
      svg.appendChild(svgEl("circle", { cx: x(i), cy: y(d.pct), r: 4.5, fill: "#1e7a4e", stroke: "var(--surface)", "stroke-width": 2 }));
    });
    const last = trend[n - 1];
    const endLbl = svgEl("text", { x: x(n - 1) + 9, y: y(last.pct) + 4, "font-size": 12, "font-weight": 700, fill: "var(--ink)" });
    endLbl.textContent = last.pct + "%"; svg.appendChild(endLbl);

    const hoverDot = svgEl("circle", { r: 5.5, fill: "#1e7a4e", stroke: "var(--surface)", "stroke-width": 2, opacity: 0 });
    svg.appendChild(hoverDot);
    const hit = svgEl("rect", { x: mL, y: mT, width: pw, height: ph, fill: "transparent" });
    svg.appendChild(hit);
    hit.addEventListener("mousemove", function (e) {
      const r = svg.getBoundingClientRect();
      let i = Math.round((((e.clientX - r.left) / r.width) * W - mL) / pw * (n - 1));
      i = Math.max(0, Math.min(n - 1, i));
      hoverDot.setAttribute("cx", x(i)); hoverDot.setAttribute("cy", y(trend[i].pct)); hoverDot.setAttribute("opacity", 1);
      PC.tooltip.show(host, fmtDate(trend[i].date) + "<br><strong>" + trend[i].pct + "%</strong>" +
        (trend[i].pct >= passPct ? " — passed" : " — below threshold"),
        (x(i) / W) * r.width, (y(trend[i].pct) / H) * r.height);
    });
    hit.addEventListener("mouseleave", function () { hoverDot.setAttribute("opacity", 0); PC.tooltip.hide(); });
    host.appendChild(svg);

    document.getElementById("table-attempts").innerHTML =
      '<table class="data-table"><thead><tr><th>Date</th><th class="num">Score</th></tr></thead><tbody>' +
      trend.map(d => "<tr><td>" + fmtDate(d.date) + '</td><td class="num">' + d.pct + "%</td></tr>").join("") +
      "</tbody></table>";
  }
})();
