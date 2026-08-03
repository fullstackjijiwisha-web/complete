(function () {
  "use strict";

  const PC = window.PC;
  const root = document.getElementById("admin-main-view");
  const authGuard = document.getElementById("admin-auth-guard");
  if (!root) return;

  let currentTab = "questions";
  let questions = [];
  let orgs = [];

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    const user = await PC.me();
    if (!user || user.role !== "super_admin") {
      authGuard.classList.remove("hidden");
      return;
    }
    root.classList.remove("hidden");

    // Tab buttons wiring
    document.querySelectorAll(".admin-tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".admin-tab-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        switchTab(btn.dataset.tab);
      });
    });

    document.getElementById("btn-add-question").addEventListener("click", () => openQuestionModal());
    document.getElementById("question-modal-close").addEventListener("click", closeQuestionModal);
    document.getElementById("btn-add-option-row").addEventListener("click", () => addOptionRow("", 0));
    document.getElementById("btn-add-blank-row").addEventListener("click", () => addBlankRow([]));
    document.getElementById("q-field-type").addEventListener("change", handleTypeChange);
    document.getElementById("question-form").addEventListener("submit", handleQuestionSave);

    // Maintenance: rescore a certified attempt after an answer-key fix
    document.getElementById("btn-rescore-cert").addEventListener("click", async function () {
      const input = document.getElementById("rescore-cert-id");
      const msg = document.getElementById("rescore-msg");
      const certId = input.value.trim();
      if (!certId) { msg.textContent = "Enter a certificate ID."; msg.style.color = "#dc2626"; return; }
      this.disabled = true;
      msg.style.color = "";
      msg.textContent = "Rescoring…";
      try {
        const r = await PC.api("/admin/certificates/rescore", { method: "POST", body: { certId: certId } });
        msg.style.color = "#0e7a3d";
        msg.textContent = "✓ " + r.certId + ": " + r.oldScore + "% → " + r.newScore + "% (band: " + r.scoreBand + "). Attempt, certificate and readiness updated.";
      } catch (ex) {
        msg.style.color = "#dc2626";
        msg.textContent = ex.message;
      }
      this.disabled = false;
    });

    document.getElementById("btn-refresh-feedback").addEventListener("click", loadFeedback);
    document.getElementById("btn-refresh-email").addEventListener("click", loadEmailHealth);
    document.getElementById("btn-refresh-tests").addEventListener("click", loadTestStats);

    // Wire up the org danger-zone wipe modal
    document.getElementById("btn-wipe-orgs").addEventListener("click", openWipeOrgsModal);
    document.getElementById("wipe-orgs-modal-close").addEventListener("click", closeWipeOrgsModal);
    document.getElementById("wipe-orgs-cancel").addEventListener("click", closeWipeOrgsModal);
    document.getElementById("wipe-orgs-confirm-input").addEventListener("input", handleWipeConfirmInput);
    document.getElementById("wipe-orgs-confirm-btn").addEventListener("click", handleWipeConfirm);

    // Event delegation for dynamically generated question buttons
    document.addEventListener("click", function(e) {
      const editBtn = e.target.closest(".admin-edit-q-btn");
      if (editBtn) {
        PC.openEditQuestion(editBtn.dataset.id);
        return;
      }
      const deleteBtn = e.target.closest(".admin-delete-q-btn");
      if (deleteBtn) {
        PC.deleteQuestion(deleteBtn.dataset.id);
        return;
      }
      const rmOptBtn = e.target.closest(".admin-remove-opt-btn");
      if (rmOptBtn) {
        document.getElementById(rmOptBtn.dataset.target).remove();
        return;
      }
      const rmBlankBtn = e.target.closest(".admin-remove-blank-btn");
      if (rmBlankBtn) {
        document.getElementById(rmBlankBtn.dataset.target).remove();
        return;
      }
    });

    // Load initial tab
    switchTab("questions");
  }

  function switchTab(tab) {
    currentTab = tab;
    ["questions", "tests", "orgs", "feedback", "email"].forEach(t => {
      document.getElementById("tab-" + t).classList.toggle("hidden", t !== tab);
    });
    if (tab === "questions") loadQuestions();
    if (tab === "tests") loadTestStats();
    if (tab === "orgs") loadOrgs();
    if (tab === "feedback") loadFeedback();
    if (tab === "email") loadEmailHealth();
  }

  /* ---------------- Tests Taken Tab ---------------- */
  async function loadTestStats() {
    const box = document.getElementById("tests-container");
    box.innerHTML = '<p class="small muted">Loading…</p>';
    let d;
    try {
      d = await PC.api("/admin/assessment-stats");
    } catch (e) {
      box.innerHTML = '<p class="small" style="color:#dc2626">' + PC.esc(e.message) + "</p>";
      return;
    }

    const n = function (v) { return (v === null || v === undefined) ? "—" : Number(v).toLocaleString("en-IN"); };
    const tile = function (num, lbl) {
      return '<div class="fbadmin-tile"><div class="num">' + num + '</div><div class="lbl">' + lbl + "</div></div>";
    };

    let html =
      '<div style="background:var(--green-900); color:#fff; border-radius:10px; padding:22px; text-align:center; margin-bottom:16px">' +
      '<div style="font-family:var(--serif); font-size:3.2rem; font-weight:700; line-height:1">' + n(d.employeesTested) + "</div>" +
      '<div style="font-size:0.9rem; letter-spacing:0.06em; opacity:0.85; margin-top:4px">EMPLOYEES WHO TOOK THE TEST</div>' +
      '<div style="font-size:0.8rem; opacity:0.7; margin-top:6px">across all organisations · ' + n(d.totalAttempts) +
      " attempt" + (d.totalAttempts === 1 ? "" : "s") + " in total, retakes included</div></div>";

    html +=
      '<div class="fbadmin-stats" style="margin-bottom:16px">' +
      tile(n(d.employeesThisCycle), "This cycle (" + PC.esc(d.cycle) + ")") +
      tile(n(d.employeesLast30Days), "Last 30 days") +
      tile(n(d.employeesLast7Days), "Last 7 days") +
      tile(n(d.employeesInProgress), "Taking the test right now") +
      tile(n(d.certificatesIssued), "Certificates issued") +
      tile(d.averageScore === null ? "—" : d.averageScore + "%", "Average score") +
      tile(d.passRate === null ? "—" : d.passRate + "%", "Pass rate (≥" + d.passThreshold + "%)") +
      "</div>";

    const rows = d.byOrganisation || [];
    if (!rows.length) {
      html += '<p class="small muted">No assessments have been completed yet.</p>';
    } else {
      html +=
        '<h3 class="small" style="margin:18px 0 8px; font-weight:700; color:var(--green-900)">By organisation</h3>' +
        '<div class="table-wrap"><table><thead><tr>' +
        "<th>Organisation</th><th class=\"num\">Employees who took the test</th>" +
        "<th class=\"num\">Attempts (incl. retakes)</th><th class=\"num\">Avg score</th>" +
        "</tr></thead><tbody>" +
        rows.map(function (r) {
          return "<tr><td>" + PC.esc(r.orgName) +
            (r.orgCode ? ' <span class="mono small muted">' + PC.esc(r.orgCode) + "</span>" : "") + "</td>" +
            '<td class="num"><strong>' + n(r.employeesTested) + "</strong></td>" +
            '<td class="num">' + n(r.attempts) + "</td>" +
            '<td class="num">' + (r.averageScore === null ? "—" : r.averageScore + "%") + "</td></tr>";
        }).join("") +
        "</tbody></table></div>";
    }

    box.innerHTML = html;
  }

  /* ---------------- Email health Tab ---------------- */
  async function loadEmailHealth() {
    const box = document.getElementById("email-health-container");
    box.innerHTML = '<p class="small muted">Checking every configured mail account…</p>';
    let d;
    try {
      d = await PC.api("/admin/email/health");
    } catch (e) {
      box.innerHTML = '<p class="small" style="color:#dc2626">' + PC.esc(e.message) + "</p>";
      return;
    }

    const banner = {
      ok: ["#0e7a3d", "#e8f5ee", "✓ Email is working"],
      degraded: ["#b45309", "#fef3c7", "▲ Email is working, but needs attention"],
      down: ["#dc2626", "#fef2f2", "✕ Email is NOT going out"],
      not_configured: ["#dc2626", "#fef2f2", "✕ No mail account is configured"],
    }[d.summary] || ["#444", "#f5f5f5", d.summary];

    let html =
      '<div style="border-left:4px solid ' + banner[0] + '; background:' + banner[1] +
      '; border-radius:6px; padding:12px 14px; margin-bottom:14px">' +
      '<strong style="color:' + banner[0] + '">' + banner[2] + "</strong></div>";

    const credits = d.totalCreditsRemaining;
    html +=
      '<div class="fbadmin-stats" style="margin-bottom:14px">' +
      '<div class="fbadmin-tile"><div class="num">' + d.providerCount + '</div><div class="lbl">Mail accounts configured</div></div>' +
      '<div class="fbadmin-tile"><div class="num">' + (credits === null || credits === undefined ? "—" : credits) +
      '</div><div class="lbl">Sending allowance left</div></div>' +
      '<div class="fbadmin-tile"><div class="num">' + (d.undeliveredInvites ?? 0) + '</div><div class="lbl">Invites awaiting delivery</div></div>' +
      "</div>";

    html += '<p class="small" style="margin:0 0 10px">Sending from <strong>' + PC.esc(d.from) + "</strong> — " +
      (d.fromVerified === true
        ? '<span style="color:#0e7a3d;font-weight:600">verified sender ✓</span>'
        : d.fromVerified === false
          ? '<span style="color:#dc2626;font-weight:600">NOT a verified sender ✕</span> — every send will fail until this address is verified in Brevo (Settings → Senders).'
          : '<span class="muted">verification status unavailable</span>') + "</p>";

    html += (d.providers || []).map(function (p) {
      const okBadge = p.ok
        ? '<span class="badge badge-good">✓ reachable</span>'
        : '<span class="badge badge-serious">✕ failing</span>';
      let rows = "";
      if (p.accountEmail) rows += '<div class="small muted">Account: ' + PC.esc(p.accountEmail) + (p.company ? " · " + PC.esc(p.company) : "") + "</div>";
      if (p.plans && p.plans.length) {
        rows += '<div class="small muted">Plan: ' + p.plans.map(function (pl) {
          return PC.esc(pl.type) + (typeof pl.credits === "number" ? " (" + pl.credits + " " + PC.esc(pl.creditsType || "credits") + ")" : "");
        }).join(" · ") + "</div>";
      }
      if (p.status) rows += '<div class="small" style="color:#dc2626">HTTP ' + p.status + "</div>";
      if (p.error) rows += '<div class="small" style="color:#dc2626">' + PC.esc(p.error) + "</div>";
      if (p.hint) rows += '<div class="small" style="color:#b45309">→ ' + PC.esc(p.hint) + "</div>";
      return '<div style="border:1px solid var(--line); border-radius:6px; padding:10px; margin-bottom:8px">' +
        '<div class="flex spread" style="align-items:center"><strong>' + PC.esc(p.name) + "</strong>" + okBadge + "</div>" +
        rows + "</div>";
    }).join("");

    if (d.providerCount < 2) {
      html += '<p class="small muted" style="margin-top:12px">Only one mail account is configured. Adding another key to ' +
        '<span class="mono">BREVO_API_KEYS</span> in Vercel (comma-separated) increases the daily ceiling — a send one ' +
        "account rejects is retried on the next automatically.</p>";
    }
    if ((d.undeliveredInvites ?? 0) > 0) {
      html += '<p class="small muted">' + d.undeliveredInvites + " invite" + (d.undeliveredInvites === 1 ? "" : "s") +
        " still awaiting delivery — these are retried automatically every night until each one is accepted.</p>";
    }

    box.innerHTML = html;
  }

  /* ---------------- Feedbacks Tab ---------------- */
  const SUGGESTION_LABELS = {
    more_case_scenarios: "More real-life case scenarios",
    more_practice_questions: "More practice questions",
    better_explanations: "Better explanations / feedback",
    shorter_assessment: "Shorter assessment time",
    industry_examples: "Industry specific examples",
    other: "Other",
  };

  function starsTxt(n) {
    return '<span class="star">' + "★".repeat(n) + "</span>" + "☆".repeat(5 - n);
  }

  async function loadFeedback() {
    const box = document.getElementById("feedback-container");
    box.innerHTML = '<p class="small muted">Loading feedback…</p>';
    let data;
    try {
      data = await PC.api("/admin/feedback");
    } catch (e) {
      box.innerHTML = '<p class="small" style="color:#dc2626">' + PC.esc(e.message) + "</p>";
      return;
    }
    const s = data.stats;
    if (!s.count) {
      box.innerHTML = '<p class="small muted">No feedback yet — entries appear here as employees complete their assessments.</p>';
      return;
    }

    let html =
      '<div class="fbadmin-stats">' +
      '<div class="fbadmin-tile"><div class="num">' + s.count + '</div><div class="lbl">Responses</div></div>' +
      '<div class="fbadmin-tile"><div class="num">' + (s.avgOverall ?? "—") + '</div><div class="lbl">Avg overall (of 5)</div></div>' +
      '<div class="fbadmin-tile"><div class="num">' + (s.avgContent ?? "—") + '</div><div class="lbl">Avg content (of 5)</div></div>' +
      '<div class="fbadmin-tile"><div class="num">' + (s.avgCaseScenarios ?? "—") + '</div><div class="lbl">Avg case scenarios (of 5)</div></div>' +
      '<div class="fbadmin-tile"><div class="num">' + (s.avgApplication ?? "—") + '</div><div class="lbl">Avg confidence (of 5)</div></div>' +
      '<div class="fbadmin-tile"><div class="num">' + (s.avgRecommendation ?? "—") + '</div><div class="lbl">Avg recommendation (of 10)</div></div>' +
      "</div>";

    const suggEntries = Object.entries(s.suggestionCounts || {});
    if (suggEntries.length) {
      html += '<div class="pill-row" style="margin-bottom:14px">' +
        suggEntries.map(([k, n]) =>
          '<span class="badge badge-neutral">' + PC.esc(SUGGESTION_LABELS[k] || k) + " · " + n + "</span>").join("") +
        "</div>";
    }

    html += data.items.map(function (f) {
      const d = new Date(f.createdAt);
      const r = f.ratings;
      let item =
        '<div class="fbadmin-item">' +
        '<div class="fbadmin-meta"><strong>' + PC.esc(f.orgName) + "</strong>" +
        "<span>" + f.cycle + "</span><span>" + d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) + "</span></div>" +
        '<div class="fbadmin-ratings">' +
        "<span>Overall " + starsTxt(r.overall) + "</span>" +
        "<span>Content " + starsTxt(r.content) + "</span>" +
        "<span>Cases " + starsTxt(r.caseScenarios) + "</span>" +
        "<span>Confidence " + starsTxt(r.application) + "</span>" +
        "<span>Recommends <strong>" + r.recommendation + "/10</strong></span>" +
        "</div>";
      const suggs = (f.suggestions || []).map(function (k) {
        let label = SUGGESTION_LABELS[k] || k;
        if (k === "other" && f.suggestionOther) label = "Other: " + f.suggestionOther;
        return '<span class="badge badge-neutral">' + PC.esc(label) + "</span>";
      });
      if (suggs.length) item += '<div class="fbadmin-sugg">' + suggs.join("") + "</div>";
      if (f.comments) item += '<div class="fbadmin-comment">' + PC.esc(f.comments) + "</div>";
      return item + "</div>";
    }).join("");

    box.innerHTML = html;
  }

  /* ---------------- Questions Tab ---------------- */
  async function loadQuestions() {
    const container = document.getElementById("questions-container");
    container.innerHTML = '<p class="small muted">Loading questions...</p>';
    try {
      const res = await PC.api("/admin/questions?limit=100");
      questions = res.data;
      renderQuestions();
    } catch (ex) {
      container.innerHTML = `<p style="color:var(--orange-700)">Error: ${PC.esc(ex.message)}</p>`;
    }
  }

  function renderQuestions() {
    const container = document.getElementById("questions-container");
    if (!questions.length) {
      container.innerHTML = '<p class="small muted">No questions found. Click "+ Add New Question" to create one.</p>';
      return;
    }
    container.innerHTML = questions.map(q => {
      const editBtn = `<button class="btn btn-ghost btn-sm admin-edit-q-btn" data-id="${q._id}">Edit</button>`;
      const deleteBtn = `<button class="btn btn-ghost btn-sm admin-delete-q-btn" data-id="${q._id}" style="color:var(--orange-700)">Delete</button>`;
      return `
        <div class="card question-list-item" style="padding:16px;">
          <div class="flex spread">
            <div>
              <span class="badge" style="background:#eef6f2; color:var(--green-900); font-weight:600">${q.type.toUpperCase()} (v${q.version})</span>
            </div>
            <div style="display:flex; gap:8px;">
              ${editBtn}
              ${deleteBtn}
            </div>
          </div>
          <p class="mt-1" style="font-weight:500; font-size:0.95rem;">${PC.esc(q.body)}</p>
          <div class="pill-row">
            ${q.options ? q.options.map(o => `<span class="tag" style="background:${o.weight === 1 ? '#dbeae2' : '#f0f0ed'}">${PC.esc(o.text)} (${o.weight})</span>`).join("") : ""}
            ${q.blanks ? q.blanks.map(b => `<span class="tag" style="background:#eef6f2">${PC.esc(b.acceptedAnswers.join(" / "))}</span>`).join("") : ""}
          </div>
        </div>
      `;
    }).join("");
  }

  /* ---------------- Add / Edit Question Modal ---------------- */
  let optionRowCounter = 0;
  let blankRowCounter = 0;

  function openQuestionModal(q = null) {
    const modal = document.getElementById("question-modal");
    document.getElementById("q-field-id").value = q ? q._id : "";
    document.getElementById("q-modal-title").textContent = q ? "Edit Question" : "Add New Question";
    document.getElementById("q-field-type").value = q ? q.type : "mcq";
    document.getElementById("q-field-type").disabled = !!q;
    document.getElementById("q-field-body").value = q ? q.body : "";

    document.getElementById("q-options-list").innerHTML = "";
    document.getElementById("q-blanks-list").innerHTML = "";

    handleTypeChange();

    if (q) {
      if (q.options) q.options.forEach(o => addOptionRow(o.text, o.weight));
      if (q.blanks) q.blanks.forEach(b => addBlankRow(b.acceptedAnswers));
    } else {
      addOptionRow("", 1);
      addOptionRow("", 0);
    }

    modal.classList.add("open");
  }

  window.PC = window.PC || {};
  PC.openEditQuestion = function (id) {
    const q = questions.find(item => item._id === id);
    if (q) openQuestionModal(q);
  };

  PC.deleteQuestion = async function (id) {
    if (!confirm("Are you sure you want to delete this question? It will no longer appear in future assessments.")) return;
    try {
      await PC.api(`/admin/questions/${id}`, { method: "DELETE" });
      loadQuestions();
    } catch (e) {
      alert("Error deleting question: " + e.message);
    }
  };

  function closeQuestionModal() {
    document.getElementById("question-modal").classList.remove("open");
  }

  function handleTypeChange() {
    const type = document.getElementById("q-field-type").value;
    const optBlock = document.getElementById("q-block-options");
    const blankBlock = document.getElementById("q-block-blanks");
    optBlock.classList.toggle("hidden", type === "fib");
    blankBlock.classList.toggle("hidden", type !== "fib");
    // A hidden-but-required empty input silently blocks form submission (the
    // browser can't focus it to show the message) — e.g. the default MCQ
    // option rows after switching Format to FIB. Disable whichever block is
    // hidden: disabled controls are exempt from constraint validation.
    optBlock.querySelectorAll("input").forEach(i => { i.disabled = type === "fib"; });
    blankBlock.querySelectorAll("input").forEach(i => { i.disabled = type !== "fib"; });
  }

  function addOptionRow(text = "", weight = 0) {
    const list = document.getElementById("q-options-list");
    const id = optionRowCounter++;
    const row = document.createElement("div");
    row.className = "flex";
    row.style.gap = "8px";
    row.id = `q-opt-row-${id}`;
    row.innerHTML = `
      <input type="text" placeholder="Option text" value="${PC.esc(text)}" class="q-opt-text" style="flex:1" required>
      <input type="number" step="0.1" min="0" max="1" placeholder="Weight" value="${weight}" class="q-opt-weight" style="width:80px" required>
      <button type="button" class="btn btn-ghost btn-sm admin-remove-opt-btn" data-target="q-opt-row-${id}" style="color:var(--orange-700)">✕</button>
    `;
    list.appendChild(row);
  }

  function addBlankRow(answers = []) {
    const list = document.getElementById("q-blanks-list");
    const id = blankRowCounter++;
    const row = document.createElement("div");
    row.className = "flex";
    row.style.gap = "8px";
    row.id = `q-blank-row-${id}`;
    row.innerHTML = `
      <input type="text" placeholder="Accepted answers (comma separated)" value="${PC.esc(answers.join(", "))}" class="q-blank-text" style="flex:1" required>
      <button type="button" class="btn btn-ghost btn-sm admin-remove-blank-btn" data-target="q-blank-row-${id}" style="color:var(--orange-700)">✕</button>
    `;
    list.appendChild(row);
  }

  async function handleQuestionSave(e) {
    e.preventDefault();
    const errEl = document.getElementById("q-form-error");
    errEl.classList.add("hidden");

    const id = document.getElementById("q-field-id").value;
    const type = document.getElementById("q-field-type").value;
    const body = document.getElementById("q-field-body").value;

    const payload = { type, body };

    if (type !== "fib") {
      const optionRows = document.querySelectorAll("#q-options-list .flex");
      payload.options = Array.from(optionRows).map(row => ({
        text: row.querySelector(".q-opt-text").value,
        weight: parseFloat(row.querySelector(".q-opt-weight").value)
      }));
    } else {
      const blankRows = document.querySelectorAll("#q-blanks-list .flex");
      payload.blanks = Array.from(blankRows).map(row => ({
        acceptedAnswers: row.querySelector(".q-blank-text").value.split(",").map(s => s.trim()).filter(Boolean)
      }));
    }

    try {
      if (id) {
        await PC.api(`/admin/questions/${id}`, { method: "PATCH", body: payload });
      } else {
        await PC.api("/admin/questions", { method: "POST", body: payload });
      }
      closeQuestionModal();
      loadQuestions();
    } catch (ex) {
      errEl.textContent = ex.message;
      errEl.classList.remove("hidden");
    }
  }


  /* ---------------- Organisations Tab ---------------- */
  async function loadOrgs() {
    const container = document.getElementById("orgs-container");
    container.innerHTML = '<p class="small muted">Loading organisations...</p>';
    try {
      const res = await PC.api("/admin/orgs?limit=100");
      orgs = res.data;
      renderOrgs();
    } catch (ex) {
      container.innerHTML = `<p style="color:var(--orange-700)">Error: ${PC.esc(ex.message)}</p>`;
    }
  }

  function renderOrgs() {
    const container = document.getElementById("orgs-container");
    if (!orgs.length) {
      container.innerHTML = '<p class="small muted">No organisations registered yet.</p>';
      return;
    }
    container.innerHTML = orgs.map(org => {
      const seatBtnText = org.seatsActive ? "Deactivate Seats" : "Activate Seats";
      const seatBadge = org.seatsActive
        ? '<span class="badge badge-good">Active</span>'
        : '<span class="badge badge-warning">Pending Payment</span>';

      const complianceStatus = org.compliance.status;

      // ── Evidence documents list ──
      let evidencePackHtml = "";
      if (org.currentAudit && org.currentAudit.documents.length) {
        const docItems = org.currentAudit.documents.map((d, index) => {
          // Use the admin-scoped download route: /admin/orgs/:id/documents/:index
          // This does not require knowing the audit id — super admin looks it up by org.
          return `<li style="display:flex; align-items:center; gap:8px;">
            <a href="#"
               class="admin-dl-doc-btn"
               data-path="/admin/orgs/${org._id}/documents/${index}"
               data-filename="${PC.esc(d.name)}"
               style="font-weight:600; color:var(--green-700); text-decoration:none">
              ⬇ ${PC.esc(d.name)}
            </a>
            <span class="muted" style="font-size:0.75rem">(${new Date(d.uploadedAt).toLocaleDateString()})</span>
            <button class="btn btn-ghost btn-sm admin-view-doc-btn" 
                    data-path="/admin/orgs/${org._id}/documents/${index}" 
                    style="padding: 2px 6px; font-size: 0.75rem; border: 1px solid var(--line); margin-left: 8px;">
              👀 View doc
            </button>
          </li>`;
        }).join("");

        evidencePackHtml =
          '<div class="mt-2" style="background:var(--surface); border:1px solid var(--line); border-radius:6px; padding:10px;">' +
          '<h4 class="small" style="margin:0; font-weight:700; color:var(--green-900)">📁 Evidence Pack Documents:</h4>' +
          `<ul style="margin:6px 0 0; padding-left:20px; font-size:0.85rem; display:flex; flex-direction:column; gap:4px; list-style-type:disc">${docItems}</ul>` +
          '</div>';
      } else if (complianceStatus !== "not_started") {
        evidencePackHtml = '<p class="small muted mt-1"><em>No evidence files uploaded yet.</em></p>';
      }

      // ── NCW checklist verification — super admin ticks items; the HR audit
      //    page mirrors these as green ✓ Verified / red ✕ Not verified ──
      let checklistHtml = "";
      if (org.currentAudit && org.currentAudit.checklist && org.currentAudit.checklist.length) {
        const auditId = org.currentAudit.id;
        const okCount = org.currentAudit.checklist.filter(c => c.status === "ok").length;
        const rows = org.currentAudit.checklist.map((c, i) => `
          <li style="display:flex; align-items:center; gap:10px;">
            <input type="checkbox" class="admin-check-item" style="width:16px; height:16px; cursor:pointer; flex:0 0 auto"
                   data-audit-id="${auditId}" data-index="${i}" ${c.status === "ok" ? "checked" : ""}>
            <span style="flex:1">${PC.esc(c.item)}</span>
            ${c.status === "ok"
              ? '<span class="badge badge-good">✓ Verified</span>'
              : '<span class="badge badge-serious">✕ Not verified</span>'}
          </li>`).join("");
        checklistHtml = `
          <div class="mt-2" style="background:var(--surface); border:1px solid var(--line); border-radius:6px; padding:10px;">
            <div class="flex spread" style="align-items:center; flex-wrap:wrap; gap:8px">
              <h4 class="small" style="margin:0; font-weight:700; color:var(--green-900)">🛡 NCW Checklist Verification (${okCount}/${org.currentAudit.checklist.length})</h4>
              <div class="flex" style="gap:6px">
                <button class="btn btn-sm btn-green admin-checklist-all" data-audit-id="${auditId}" data-status="ok">✓ Verify all</button>
                <button class="btn btn-sm btn-ghost admin-checklist-all" data-audit-id="${auditId}" data-status="issue" style="color:#dc2626; border-color:#dc2626">✕ Disapprove all</button>
              </div>
            </div>
            <ul style="list-style:none; margin:8px 0 0; padding:0; display:flex; flex-direction:column; gap:6px; font-size:0.85rem">${rows}</ul>
          </div>`;
      }

      // ── Review panel — only shown when audit is pending (requested / scheduled / in_review) ──
      let reviewPanelHtml = "";
      const isPendingReview = org.currentAudit &&
        ['requested', 'scheduled', 'in_review'].includes(complianceStatus);

      if (isPendingReview) {
        const auditId = org.currentAudit.id;
        const orgId = org._id;

        reviewPanelHtml = `
          <div class="mt-2" style="border:1px dashed var(--orange-700); border-radius:6px; padding:12px; background:#fffbfb;" id="review-panel-${orgId}">
            <h4 class="small" style="margin:0 0 8px; font-weight:700; color:var(--orange-700)">🛡️ Compliance Audit Verification Panel</h4>

            <div class="field" style="margin-bottom:10px">
              <label class="small" style="font-weight:600">Findings / Remarks <span class="muted">(will be emailed to HR and shown on their dashboard)</span></label>
              <textarea id="findings-${orgId}" rows="3" style="width:100%; font-size:0.85rem; margin-top:4px; box-sizing:border-box;"
                placeholder="e.g. Please sign the IC resolution page and resubmit. The POSH policy document is missing the effective date."></textarea>
            </div>

            <!-- Step 1: Decision buttons -->
            <div class="flex" id="review-step1-${orgId}" style="gap:8px; flex-wrap:wrap; align-items:center">
              <button class="btn btn-sm btn-orange btn-approve" data-org-id="${orgId}">✓ Approve Evidence</button>
              <button class="btn btn-sm btn-ghost btn-decline" data-audit-id="${auditId}" data-org-id="${orgId}" style="color:var(--orange-700); border-color:var(--orange-700)">⚠️ Decline & Request Changes</button>
            </div>

            <!-- Step 2: Upload compliance cert (shown after clicking Approve) -->
            <div id="review-step2-${orgId}" style="display:none; margin-top:12px; border-top:1px solid var(--line); padding-top:12px;">
              <p class="small" style="margin:0 0 8px; font-weight:600; color:#0e7a3d">✓ Evidence approved! Now upload the compliance certificate to complete:</p>
              <div class="flex" style="gap:8px; align-items:center; flex-wrap:wrap">
                <label class="btn btn-sm btn-green" style="cursor:pointer; margin:0" id="cert-label-${orgId}">
                  📄 Choose Certificate (PDF / Image)
                  <input type="file" accept="application/pdf,image/*" style="display:none"
                    class="file-cert-upload" data-audit-id="${auditId}" data-org-id="${orgId}">
                </label>
                <span id="cert-file-name-${orgId}" class="small muted">No file chosen</span>
                <button class="btn btn-sm btn-ghost btn-cancel-approve" data-org-id="${orgId}" style="margin-left:auto">Cancel</button>
              </div>
            </div>
          </div>
        `;
      }

      let attachedCertLink = "";
      if (org.compliance.customCertificateFilename) {
        // Use a server-side download route for the cert — avoids embedding large base64 in DOM
        attachedCertLink = `<p class="small mt-1" style="color:#0e7a3d; font-weight:600">
          ✓ Compliance Cert:
          <a href="#"
             class="admin-dl-doc-btn"
             data-path="/admin/orgs/${org._id}/certificate"
             data-filename="${PC.esc(org.compliance.customCertificateFilename)}"
             style="color:#0e7a3d">
            ${PC.esc(org.compliance.customCertificateFilename)}
          </a>
          ${org.compliance.validTill ? `<span class="muted">(valid till ${new Date(org.compliance.validTill).toLocaleDateString('en-IN')})</span>` : ""}
        </p>`;
      }

      // ── Status badge ──
      const statusColors = {
        not_started: "#aaa",
        requested: "#d97706",
        scheduled: "#2563eb",
        in_review: "#7c3aed",
        changes_requested: "#dc2626",
        passed: "#059669",
        failed: "#dc2626",
        certificate_issued: "#059669"
      };
      const statusColor = statusColors[complianceStatus] || "#aaa";
      const statusBadge = `<span style="display:inline-block; padding:2px 8px; border-radius:12px; font-size:0.78rem; font-weight:700; background:${statusColor}1a; color:${statusColor}; border:1px solid ${statusColor}40">${complianceStatus.replace(/_/g, " ").toUpperCase()}</span>`;

      return `
        <div class="card" style="padding:16px; border-left:3px solid ${statusColor}40">
          <div class="flex spread" style="flex-wrap:wrap; gap:10px; align-items:flex-start">
            <div style="flex:1; min-width:280px;">
              <div class="flex" style="align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:4px">
                <h3 class="h-sm" style="margin:0">${PC.esc(org.name)} <span class="mono small muted">(${org.orgCode})</span></h3>
                ${statusBadge}
              </div>
              <p class="small muted" style="margin:2px 0 6px">
                Headcount: ${org.headcount} &nbsp;·&nbsp; Enrolled: <strong>${org.enrolledCount ?? 0}</strong> &nbsp;·&nbsp; Seats: ${seatBadge}
                ${org.registeredEmail ? `&nbsp;·&nbsp; HR Email: <strong>${PC.esc(org.registeredEmail)}</strong>` : ""}
              </p>
              ${attachedCertLink}
              ${evidencePackHtml}
              ${checklistHtml}
              ${reviewPanelHtml}
              <div id="invite-status-${org._id}"></div>
            </div>
            <div class="flex" style="gap:8px; align-items:center; flex-shrink:0">
              <button class="btn btn-ghost btn-sm admin-invite-status" data-org-id="${org._id}">📶 Invite status</button>
              <a href="#" class="btn btn-ghost btn-sm admin-dl-doc-btn"
                 data-path="/admin/orgs/${org._id}/employees/export"
                 data-filename="${PC.esc(org.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "organisation")}-employees.csv">⬇ Employees (CSV)</a>
              <button class="btn btn-ghost btn-sm btn-toggle-seats" data-org-id="${org._id}" data-seats-active="${org.seatsActive}">${seatBtnText}</button>
            </div>
          </div>
        </div>
      `;
    }).join("");

    // Attach event listeners dynamically
    document.querySelectorAll(".btn-approve").forEach(btn => {
      btn.addEventListener("click", () => PC.showUploadCertStep(btn.dataset.orgId));
    });
    document.querySelectorAll(".btn-decline").forEach(btn => {
      btn.addEventListener("click", () => PC.handleDecline(btn.dataset.auditId, btn.dataset.orgId));
    });
    document.querySelectorAll(".file-cert-upload").forEach(input => {
      input.addEventListener("change", (e) => PC.handleApproveWithCert(e, input.dataset.auditId, input.dataset.orgId));
    });
    document.querySelectorAll(".btn-cancel-approve").forEach(btn => {
      btn.addEventListener("click", () => PC.hideUploadCertStep(btn.dataset.orgId));
    });
    document.querySelectorAll(".btn-toggle-seats").forEach(btn => {
      btn.addEventListener("click", () => PC.toggleOrgSeats(btn.dataset.orgId, btn.dataset.seatsActive === "true"));
    });

    // NCW checklist: per-item checkbox + verify/disapprove all
    document.querySelectorAll(".admin-check-item").forEach(cb => {
      cb.addEventListener("change", async () => {
        cb.disabled = true;
        try {
          await PC.api(`/audits/${cb.dataset.auditId}/checklist`, {
            method: "PATCH",
            body: { index: Number(cb.dataset.index), status: cb.checked ? "ok" : "issue" },
          });
          loadOrgs();
        } catch (ex) {
          alert("Failed to update checklist: " + ex.message);
          cb.checked = !cb.checked;
          cb.disabled = false;
        }
      });
    });
    document.querySelectorAll(".admin-checklist-all").forEach(btn => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        try {
          await PC.api(`/audits/${btn.dataset.auditId}/checklist`, {
            method: "PATCH",
            body: { all: btn.dataset.status },
          });
          loadOrgs();
        } catch (ex) {
          alert("Failed to update checklist: " + ex.message);
          btn.disabled = false;
        }
      });
    });
    
    // Attach listeners for view and download buttons
    document.querySelectorAll(".admin-view-doc-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const originalText = btn.innerHTML;
        btn.innerHTML = "⏳ Opening...";
        btn.disabled = true;
        try {
          PC.viewFile(btn.dataset.path);
        } finally {
          setTimeout(() => {
            btn.innerHTML = originalText;
            btn.disabled = false;
          }, 1000);
        }
      });
    });

    document.querySelectorAll(".admin-dl-doc-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        PC.downloadFile(btn.dataset.path, btn.dataset.filename);
      });
    });

    document.querySelectorAll(".admin-invite-status").forEach(btn => {
      btn.addEventListener("click", () => loadInviteStatus(btn.dataset.orgId));
    });
  }

  /* ── Invite delivery panel: who activated, who completed the test, and who
     is stuck on a dead link ("Invite link is invalid or has expired") — with
     org-scoped batched resend so no other organisation is ever touched. ── */
  async function loadInviteStatus(orgId) {
    const box = document.getElementById("invite-status-" + orgId);
    if (!box) return;
    box.innerHTML = '<p class="small muted mt-2">Loading invite status…</p>';
    let d;
    try {
      d = await PC.api("/admin/orgs/" + orgId + "/invite-status");
    } catch (e) {
      box.innerHTML = '<p class="small mt-2" style="color:#dc2626">' + PC.esc(e.message) + "</p>";
      return;
    }
    const stat = (num, lbl) =>
      '<div class="fbadmin-tile"><div class="num">' + num + '</div><div class="lbl">' + lbl + "</div></div>";
    const reasons = Object.entries(d.failureReasons || {});
    // Everyone whose email no provider confirmed accepting = rejected + those
    // invited before delivery tracking existed. They auto-retry nightly.
    const undelivered = (d.emailFailed ?? 0) + (d.emailUnknown ?? 0);
    box.innerHTML =
      '<div class="mt-2" style="background:var(--surface); border:1px solid var(--line); border-radius:6px; padding:12px;">' +
      '<h4 class="small" style="margin:0 0 8px; font-weight:700; color:var(--green-900)">📶 Invite delivery & progress</h4>' +
      '<div class="fbadmin-stats" style="margin-bottom:10px">' +
      stat(d.enrolled, "Enrolled") +
      stat(d.activated, "Activated account") +
      stat(d.completedTest, "Completed the test") +
      stat(d.certified, "Certified") +
      stat(d.pendingLive, "Pending — link OK") +
      stat(d.pendingExpired, "Pending — link expired") +
      "</div>" +
      '<h4 class="small" style="margin:10px 0 6px; font-weight:700; color:var(--green-900)">✉ Email delivery (pending employees)</h4>' +
      '<div class="fbadmin-stats" style="margin-bottom:10px">' +
      stat(d.emailSent ?? 0, "Accepted by mail provider") +
      stat(d.emailFailed ?? 0, "Rejected / failed") +
      stat(d.emailUnknown ?? 0, "No record (older invite)") +
      "</div>" +
      (reasons.length
        ? '<p class="small" style="margin:0 0 8px; color:#dc2626">Failure reasons: ' +
          reasons.map(function (r) { return PC.esc(r[0]) + " × " + r[1]; }).join(" · ") + "</p>"
        : "") +
      (undelivered > 0
        ? '<p class="small muted" style="margin:0 0 8px">' + undelivered +
          " employee" + (undelivered === 1 ? "" : "s") + " have no confirmed email delivery yet. " +
          "They are retried <strong>automatically every night</strong> until each one is accepted — " +
          "you can also send now with the button below.</p>"
        : "") +
      (d.pendingExpired > 0
        ? '<p class="small muted" style="margin:0 0 8px">The ' + d.pendingExpired +
          ' employee' + (d.pendingExpired === 1 ? "" : "s") + ' under “link expired” see ' +
          '<em>“Invite link is invalid or has expired”</em> — resend below to give them working links.</p>'
        : "") +
      '<div class="flex" style="gap:8px; flex-wrap:wrap; align-items:center">' +
      '<button class="btn btn-sm btn-orange adm-resend" data-org-id="' + orgId + '" data-scope="failed"' +
      (undelivered === 0 ? " disabled" : "") + ">↻ Resend undelivered (" + undelivered + ")</button>" +
      '<button class="btn btn-sm btn-ghost adm-resend" data-org-id="' + orgId + '" data-scope="expired"' +
      (d.pendingExpired === 0 ? " disabled" : "") + ">↻ Resend expired links (" + d.pendingExpired + ")</button>" +
      '<button class="btn btn-sm btn-ghost adm-resend" data-org-id="' + orgId + '" data-scope="all_pending"' +
      (d.pendingTotal === 0 ? " disabled" : "") + ">↻ Resend ALL pending (" + d.pendingTotal + ")</button>" +
      '<span class="small muted" id="adm-resend-prog-' + orgId + '"></span>' +
      "</div></div>";

    box.querySelectorAll(".adm-resend").forEach(btn => {
      btn.addEventListener("click", () => adminResendInvites(btn.dataset.orgId, btn.dataset.scope));
    });
  }

  async function adminResendInvites(orgId, scope) {
    const what = scope === "expired"
      ? "the employees whose invite link has expired"
      : scope === "failed"
        ? "the employees whose invite email the mail provider rejected"
        : "EVERY employee of this organisation who hasn't activated yet";
    const ok = await PC.confirmModal(
      "Resend invite emails",
      "Send to <strong>" + what + "</strong>.<br><br>Each gets an additional fresh link — links already in their inbox keep working until they expire. Only this organisation is affected, and it is safe to run again.",
      "Send invites",
    );
    if (!ok) return;

    const prog = document.getElementById("adm-resend-prog-" + orgId);
    const box = document.getElementById("invite-status-" + orgId);
    box.querySelectorAll(".adm-resend").forEach(b => { b.disabled = true; });
    let skip = 0;
    let delivered = 0;
    let failed = 0;
    let samples = [];
    let stoppedBy = null;
    try {
      for (;;) {
        // A batch can fail transiently (cold start, slow mail provider). Retry
        // it a couple of times before giving up so one blip doesn't abort a
        // 300-employee run half-way through.
        let r = null;
        let lastErr = null;
        for (let attempt = 0; attempt < 3 && !r; attempt++) {
          try {
            r = await PC.api("/admin/orgs/" + orgId + "/resend-invites", {
              method: "POST",
              body: scope === "all_pending" ? { scope: scope, skip: skip } : { scope: scope },
            });
          } catch (ex) {
            lastErr = ex;
            await new Promise(function (res) { setTimeout(res, 1200 * (attempt + 1)); });
          }
        }
        if (!r) throw lastErr;

        delivered += r.resentCount;
        failed += r.failedCount || 0;
        if (r.failureSamples && r.failureSamples.length && samples.length < 3) {
          samples = samples.concat(r.failureSamples).slice(0, 3);
        }
        skip += r.batchCount;
        if (prog) prog.textContent = "Sent " + delivered + (failed ? " · " + failed + " failed" : "") +
          " of " + r.totalTargets + "…";
        if (r.remaining <= 0 || r.batchCount === 0) break;
        // Every send in a 'failed'/'expired' run that still fails keeps the
        // target in the same bucket, so the set would never drain — stop once
        // a full batch produced no successful delivery.
        if (scope !== "all_pending" && r.resentCount === 0) { stoppedBy = "no_progress"; break; }
      }
      if (prog) prog.textContent = "";
      PC.alertModal("Resend finished",
        "<strong>" + delivered + "</strong> invite email" + (delivered === 1 ? "" : "s") +
        " accepted by the mail provider." +
        (failed ? "<br><strong style=\"color:#dc2626\">" + failed + " rejected</strong>" +
          (samples.length ? " — " + PC.esc(samples[0]) : "") +
          "<br><span class=\"small muted\">Rejections are usually the mail plan's daily quota. Re-run later; the panel tracks who still needs an email.</span>" : "") +
        (stoppedBy === "no_progress" ? "<br><span class=\"small muted\">Stopped early because no email in the last batch was accepted.</span>" : ""));
    } catch (e) {
      PC.alertModal("Resend stopped", PC.esc(e.message) +
        (delivered ? "<br>" + delivered + " emails were already sent — running it again continues safely." : ""));
    }
    loadInviteStatus(orgId);
  }

  /* ---------------- PC API handlers (attached to window.PC) ---------------- */

  window.PC = window.PC || {};

  PC.toggleOrgSeats = async function (id, currentVal) {
    try {
      await PC.api(`/admin/orgs/${id}`, { method: "PATCH", body: { seatsActive: !currentVal } });
      loadOrgs();
    } catch (ex) {
      alert("Failed to toggle seats: " + ex.message);
    }
  };

  /**
   * Step 1 → Step 2: hide the Approve/Decline buttons, show the cert upload area.
   */
  PC.showUploadCertStep = function (orgId) {
    const step1 = document.getElementById(`review-step1-${orgId}`);
    const step2 = document.getElementById(`review-step2-${orgId}`);
    if (step1) step1.style.display = "none";
    if (step2) step2.style.display = "block";
  };

  /**
   * Cancel cert upload — go back to Step 1.
   */
  PC.hideUploadCertStep = function (orgId) {
    const step1 = document.getElementById(`review-step1-${orgId}`);
    const step2 = document.getElementById(`review-step2-${orgId}`);
    if (step1) step1.style.display = "flex";
    if (step2) step2.style.display = "none";
  };

  /**
   * Handle APPROVE: triggered by the file input onchange after cert is chosen.
   * Reads the cert file, sends to /audits/:auditId/decision with decision=passed.
   * The backend creates the ComplianceCertificate record, saves the cert data on
   * the org, and sends the acceptance email with the cert attached.
   */
  PC.handleApproveWithCert = async function (event, auditId, orgId) {
    const file = event.target.files[0];
    const fileNameEl = document.getElementById(`cert-file-name-${orgId}`);

    if (!file) {
      if (fileNameEl) fileNameEl.textContent = "No file chosen";
      return;
    }

    if (fileNameEl) fileNameEl.textContent = file.name;

    const findings = (document.getElementById(`findings-${orgId}`) || {}).value || "";

    const label = document.getElementById(`cert-label-${orgId}`);
    if (label) { label.style.opacity = "0.6"; label.style.pointerEvents = "none"; }

    const reader = new FileReader();
    reader.onload = async function () {
      const base64Data = reader.result.split(",")[1];
      try {
        await PC.api(`/audits/${auditId}/decision`, {
          method: "POST",
          body: {
            decision: "passed",
            findings: findings,
            filename: file.name,
            base64Data: base64Data
          }
        });
        alert(`✓ Evidence approved & compliance certificate sent to the organisation!`);
        loadOrgs();
      } catch (ex) {
        alert("Approval failed: " + ex.message);
        if (label) { label.style.opacity = ""; label.style.pointerEvents = ""; }
      }
    };
    reader.onerror = function () {
      alert("Failed to read the certificate file. Please try again.");
      if (label) { label.style.opacity = ""; label.style.pointerEvents = ""; }
    };
    reader.readAsDataURL(file);
  };

  /**
   * Handle DECLINE: validates that findings are provided, confirms, then POSTs
   * to /audits/:auditId/decision with decision=changes_requested.
   * Backend saves findings on audit, updates org status, sends decline email.
   */
  PC.handleDecline = async function (auditId, orgId) {
    const findingsEl = document.getElementById(`findings-${orgId}`);
    const findings = findingsEl ? findingsEl.value.trim() : "";

    if (!findings) {
      // Highlight the textarea
      if (findingsEl) {
        findingsEl.style.borderColor = "var(--orange-700)";
        findingsEl.focus();
        findingsEl.placeholder = "⚠️ Findings are required before declining.";
        setTimeout(() => {
          if (findingsEl) { findingsEl.style.borderColor = ""; findingsEl.placeholder = ""; }
        }, 3000);
      }
      alert("Please enter findings / remarks explaining why the evidence pack is being declined. These will be emailed to the organisation's HR.");
      return;
    }

    if (!confirm(`Decline this evidence pack?\n\nFindings to be sent:\n"${findings}"\n\nThis will email the organisation's HR with the above remarks.`)) {
      return;
    }

    const declineBtn = document.querySelector(`#review-step1-${orgId} .btn-ghost`);
    if (declineBtn) { declineBtn.disabled = true; declineBtn.textContent = "Sending..."; }

    try {
      await PC.api(`/audits/${auditId}/decision`, {
        method: "POST",
        body: {
          decision: "changes_requested",
          findings: findings
        }
      });
      PC.alertModal("Evidence Declined", "HR has been notified to make changes.", [{ label: "OK", href: "javascript:window.location.reload()" }]);
    } catch (e) {
      PC.alertModal("Error", PC.esc(e.message));
    }  if (declineBtn) { declineBtn.disabled = false; declineBtn.textContent = "⚠️ Decline & Request Changes"; }
  };

  /**
   * Download the compliance certificate for an org via the admin API.
   * Uses PC.downloadFile which attaches the Bearer token automatically.
   */
  PC.downloadOrgCert = function (orgId, filename) {
    PC.downloadFile(`/admin/orgs/${orgId}/certificate`, filename);
  };

  /* ---------------- Danger zone: wipe all organisations ---------------- */

  const WIPE_CONFIRM_PHRASE = "DELETE ALL ORGANISATIONS";

  async function openWipeOrgsModal() {
    const modal = document.getElementById("wipe-orgs-modal");
    const input = document.getElementById("wipe-orgs-confirm-input");
    const confirmBtn = document.getElementById("wipe-orgs-confirm-btn");
    const errEl = document.getElementById("wipe-orgs-error");
    const countsEl = document.getElementById("wipe-orgs-counts");

    input.value = "";
    confirmBtn.disabled = true;
    confirmBtn.style.opacity = "0.5";
    errEl.classList.add("hidden");
    countsEl.textContent = "Loading current counts…";
    modal.classList.add("open");

    try {
      const counts = await PC.api("/admin/organisations/wipe-preview");
      countsEl.innerHTML =
        "This will permanently delete <strong>" + counts.organisations + "</strong> organisation(s), " +
        "<strong>" + counts.users + "</strong> HR/employee account(s), " +
        "<strong>" + counts.attempts + "</strong> assessment attempt(s), " +
        "<strong>" + counts.certificates + "</strong> certificate(s), " +
        "<strong>" + counts.audits + "</strong> audit(s), " +
        "<strong>" + counts.payments + "</strong> payment record(s), and " +
        "<strong>" + counts.invites + "</strong> pending invite(s).";
    } catch (ex) {
      countsEl.innerHTML = '<span style="color:#dc2626">Could not load counts: ' + PC.esc(ex.message) + "</span>";
    }
  }

  function closeWipeOrgsModal() {
    document.getElementById("wipe-orgs-modal").classList.remove("open");
  }

  function handleWipeConfirmInput(e) {
    const confirmBtn = document.getElementById("wipe-orgs-confirm-btn");
    const matches = e.target.value === WIPE_CONFIRM_PHRASE;
    confirmBtn.disabled = !matches;
    confirmBtn.style.opacity = matches ? "1" : "0.5";
  }

  function downloadJson(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }

  async function handleWipeConfirm() {
    const input = document.getElementById("wipe-orgs-confirm-input");
    const confirmBtn = document.getElementById("wipe-orgs-confirm-btn");
    const errEl = document.getElementById("wipe-orgs-error");

    if (input.value !== WIPE_CONFIRM_PHRASE) return;

    confirmBtn.disabled = true;
    confirmBtn.textContent = "Deleting…";
    errEl.classList.add("hidden");

    try {
      const result = await PC.api("/admin/organisations/wipe", {
        method: "POST",
        body: { confirm: WIPE_CONFIRM_PHRASE },
      });

      // Local safety copy — in addition to the durable copy kept server-side
      // (OrgWipeBackup, retrievable by backupId if this download is lost).
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      downloadJson(result.backup, `org-wipe-backup-${stamp}.json`);

      closeWipeOrgsModal();
      PC.alertModal(
        "Organisations wiped",
        "Deleted " + result.counts.organisations + " organisation(s) and everything tied to them. " +
        "A backup was downloaded to your device and also stored server-side (backup id: " +
        PC.esc(result.backupId) + ").",
      );
      loadOrgs();
    } catch (ex) {
      errEl.textContent = ex.message;
      errEl.classList.remove("hidden");
    } finally {
      confirmBtn.textContent = "Permanently Delete Everything";
      confirmBtn.disabled = input.value !== WIPE_CONFIRM_PHRASE;
    }
  }

})();
