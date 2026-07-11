/* POSH Compass — assessment engine, wired to the real API.
   One blended paper per attempt (MCQ + fill-in-the-blanks + case studies +
   simulations), assembled and scored SERVER-side:
     POST  /assessments/attempts            → start (rotated paper, no answer keys)
     GET   /assessments/attempts/current    → resume (server-authoritative timer)
     PATCH /assessments/attempts/:id/answers→ autosave
     POST  /assessments/attempts/:id/submit → score + maybe certificate
     GET   /assessments/attempts/:id/review → post-scoring answer review */
(function () {
  "use strict";

  const PC = window.PC;
  const root = document.getElementById("engine-root");
  if (!root) return;

  const TYPE_LABEL = {
    mcq: "MCQ · Knowledge",
    fib: "Fill in the Blanks · Recall",
    case_study: "Case Study · Judgment",
    simulation: "Simulation · Decisions",
  };

  let state = null; // running attempt

  /* ================= entry ================= */
  document.addEventListener("DOMContentLoaded", async function () {
    let user;
    try {
      user = await PC.me();
    } catch (e) {
      return renderBackendDown();
    }
    if (!user) {
      const up = await fetch("/health").then(r => r.ok).catch(() => false);
      if (!up) return renderBackendDown();
      return renderSignedOut();
    }
    if (user.role !== "employee") return renderNotEmployee(user);
    await renderEntry();
  });

  function renderBackendDown() {
    root.innerHTML =
      '<div class="card center" style="border-color:var(--status-warning)">' +
      '<h3 class="h-md">Backend not running</h3>' +
      '<p class="small muted mt-1">The assessment engine needs the POSH Compass API.<br>Start it with <span class="mono">npm run dev</span> and open <span class="mono">http://localhost:3000/assessment.html</span></p></div>';
  }

  function renderSignedOut() {
    root.innerHTML =
      '<div class="card center" style="padding:44px">' +
      '<h3 class="h-md">Sign in to take your assessment</h3>' +
      '<p class="small muted mt-1 mb-2">Enrolled by your organisation? Use the invite link from your email — or paste the invite token.</p>' +
      '<div class="flex" style="justify-content:center">' +
      '<button class="btn btn-orange" data-login>Login</button>' +
      '<button class="btn btn-ghost" data-invite>Accept Invite</button></div></div>';
  }

  function renderNotEmployee(user) {
    root.innerHTML =
      '<div class="card center" style="padding:44px">' +
      '<h3 class="h-md">Assessments are taken by employees</h3>' +
      '<p class="small muted mt-1 mb-2">You are signed in as ' + PC.esc(user.name) + " (" +
      (user.role === "hr_admin" ? "HR Admin" : user.role) + "). Enrol employees from the dashboard — each receives a personal invite link.</p>" +
      '<a class="btn btn-orange" href="dashboard.html">Open Dashboard</a></div>';
  }

  function renderSeatsInactive() {
    root.innerHTML =
      '<div class="card center" style="padding:44px; border-color: var(--orange-600);">' +
      '<span class="badge badge-warning" style="margin-bottom:12px">◷ Payment Pending</span>' +
      '<h3 class="h-md">Assessment is Locked</h3>' +
      '<p class="small muted mt-1">Your organisation has not completed its enrollment payment yet. Please contact your HR administrator to activate employee assessment seats.</p>' +
      '</div>';
  }

  async function renderEntry() {
    const me = await PC.me();
    if (me && me.org && !me.org.seatsActive) {
      return renderSeatsInactive();
    }

    // Resume an in-progress attempt if the server has one.
    try {
      const current = await PC.api("/assessments/attempts/current");
      if (current.autoSubmitted) return renderResult(current.result, true);
      return runEngine(current, true);
    } catch (e) {
      if (PC.backendDown(e)) return renderBackendDown();
      if (e.status !== 404) return stageMessage("Something went wrong", PC.esc(e.message));
    }

    let history = null;
    try { history = await PC.api("/assessments/attempts"); } catch (e) { /* non-fatal */ }

    const used = history ? history.attempts.filter(a => a.cycle === history.cycle).length : 0;
    const max = history ? history.maxAttemptsPerCycle : 3;
    const threshold = history ? history.threshold : 80;

    root.innerHTML =
      '<div class="engine-shell">' +
      '<div class="engine-top"><span class="q-count">POSH Assessment · ' + (history ? history.cycle : "") + "</span>" +
      '<div class="engine-progress"><div class="bar" style="width:0%"></div></div>' +
      '<span class="engine-timer">—:—</span></div>' +
      '<div class="engine-body">' +
      '<div class="q-meta">' +
      '<span class="badge badge-neutral">Standard MCQ assessment paper</span>' +
      '<span class="badge badge-good">Pass mark · ' + threshold + "%</span>" +
      '<span class="badge badge-neutral">Attempt ' + Math.min(used + 1, max) + " of " + max + " this cycle</span>" +
      '<span class="badge badge-neutral">Scored server-side</span>' +
      "</div>" +
      '<h3 class="q-text">Before you begin</h3>' +
      '<p class="small muted">The paper is assembled fresh for every attempt from a rotated question bank. The timer is enforced by the <strong>server</strong> — it keeps running if you close the tab, and the attempt auto-submits when it expires. Answers save automatically as you go; you can resume an interrupted attempt from any device.</p>' +
      "</div>" +
      '<div class="engine-foot"><span class="small muted">Evidence: every answer is timestamped and audit-logged</span>' +
      '<button class="btn btn-orange" id="btn-start">Begin Assessment</button></div>' +
      "</div>" +
      '<div id="engine-stage"></div>';

    document.getElementById("btn-start").addEventListener("click", startAttempt);
  }

  async function startAttempt() {
    const btn = document.getElementById("btn-start");
    if (btn) { btn.disabled = true; btn.textContent = "Assembling your paper…"; }
    let attempt;
    try {
      attempt = await PC.api("/assessments/attempts", { method: "POST", body: {} });
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = "Begin Assessment"; }
      if (e.code === "QUESTION_BANK_EMPTY")
        return stageMessage("Question bank is empty",
          'No active questions on the server yet. Seed it with <span class="mono">npx tsx scripts/seed-questions.ts</span> (from the backend folder).');
      if (e.status === 409) return renderEntry(); // attempt already in progress → resume
      return stageMessage("Could not start", PC.esc(e.message));
    }
    runEngine(attempt, false);
  }

  function stage() { return document.getElementById("engine-stage") || root; }

  function stageMessage(title, html) {
    stage().innerHTML =
      '<div class="card center mt-2"><h3 class="h-md">' + title + '</h3><p class="small muted mt-1">' + html + "</p></div>";
    stage().scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /* ================= engine ================= */
  function runEngine(attempt, resumed) {
    const answers = {};
    (attempt.savedAnswers || []).forEach(function (a) { answers[a.questionId] = a.response; });

    state = {
      attemptId: attempt.attemptId,
      questions: attempt.paper,
      expiresAt: new Date(attempt.expiresAt).getTime(),
      idx: 0,
      answers: answers,   // questionId → response
      dirty: {},          // questionId → response (pending autosave)
      simUi: {},          // questionId → {steps:[], nodeId}
      saveTimer: null,
      timerId: null,
      submitting: false,
    };
    // Rebuild simulation walkers from saved answers.
    state.questions.forEach(function (q) {
      if (q.type === "simulation") {
        const steps = Array.isArray(answers[q.questionId]) ? answers[q.questionId] : [];
        state.simUi[q.questionId] = { steps: steps.slice() };
      }
    });

    state.timerId = setInterval(tick, 1000);
    renderQuestion();
    if (resumed && Object.keys(answers).length) {
      // Jump to the first unanswered question on resume.
      const i = state.questions.findIndex(function (q) { return answers[q.questionId] === undefined; });
      if (i > 0) { state.idx = i; renderQuestion(); }
    }
  }

  function remainingSec() {
    return Math.max(0, Math.floor((state.expiresAt - Date.now()) / 1000));
  }

  function fmtTime(s) {
    s = Math.max(0, s);
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  function tick() {
    const left = remainingSec();
    const el = root.querySelector(".engine-timer");
    if (el) {
      el.textContent = fmtTime(left);
      el.classList.toggle("low", left <= 120);
    }
    if (left <= 0) submit(true);
  }

  /* ---------------- autosave ---------------- */
  function queueSave(questionId, response) {
    state.answers[questionId] = response;
    state.dirty[questionId] = response;
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(flushSaves, 900);
    const el = document.getElementById("save-state");
    if (el) el.textContent = "Saving…";
  }

  async function flushSaves() {
    const ids = Object.keys(state.dirty);
    if (!ids.length || state.submitting) return;
    const payload = ids.map(function (id) { return { questionId: id, response: state.dirty[id] }; });
    ids.forEach(function (id) { delete state.dirty[id]; });
    try {
      await PC.api("/assessments/attempts/" + state.attemptId + "/answers", {
        method: "PATCH",
        body: { answers: payload },
      });
      const el = document.getElementById("save-state");
      if (el) el.textContent = "All answers saved";
    } catch (e) {
      if (e.code === "ATTEMPT_EXPIRED" && e.extra && e.extra.result) {
        clearInterval(state.timerId);
        return renderResult(e.extra.result, true);
      }
      // put back and retry on next change
      payload.forEach(function (p) { if (!(p.questionId in state.dirty)) state.dirty[p.questionId] = p.response; });
      const el = document.getElementById("save-state");
      if (el) el.textContent = "Autosave failed — will retry";
    }
  }

  /* ---------------- question rendering ---------------- */
  function renderQuestion() {
    const q = state.questions[state.idx];
    const progress = (state.idx / state.questions.length) * 100;
    const answered = state.questions.filter(function (x) { return state.answers[x.questionId] !== undefined; }).length;

    let bodyHtml = "";
    if (q.type === "mcq" || q.type === "case_study") bodyHtml = renderOptions(q);
    else if (q.type === "fib") bodyHtml = renderFib(q);
    else if (q.type === "simulation") bodyHtml = renderSim(q);

    stage().innerHTML = "";
    root.innerHTML =
      '<div class="engine-shell">' +
      '<div class="engine-top">' +
      '<span class="q-count">Question ' + (state.idx + 1) + " of " + state.questions.length + "</span>" +
      '<div class="engine-progress"><div class="bar" style="width:' + progress + '%"></div></div>' +
      '<span class="engine-timer' + (remainingSec() <= 120 ? " low" : "") + '">' + fmtTime(remainingSec()) + "</span>" +
      "</div>" +
      '<div class="engine-body">' +
      '<div class="q-meta">' +
      '<span class="badge badge-neutral">' + TYPE_LABEL[q.type] + "</span>" +
      '<span class="badge badge-neutral">' + answered + " of " + state.questions.length + " answered</span>" +
      '<span class="badge badge-neutral" id="save-state">Autosave on</span>' +
      "</div>" +
      '<div class="q-text">' + PC.esc(q.body) + "</div>" +
      bodyHtml +
      "</div>" +
      '<div class="engine-foot">' +
      '<button class="btn btn-ghost" id="btn-prev"' + (state.idx === 0 ? " disabled" : "") + ">← Previous</button>" +
      '<span class="flex">' +
      '<button class="btn btn-green" id="btn-next">' + (state.idx === state.questions.length - 1 ? "Submit Assessment" : "Next →") + "</button>" +
      "</span></div></div>";

    bindQuestion(q);
    document.getElementById("btn-prev").addEventListener("click", function () {
      if (state.idx > 0) { state.idx--; renderQuestion(); }
    });
    document.getElementById("btn-next").addEventListener("click", function () {
      if (state.idx < state.questions.length - 1) { state.idx++; renderQuestion(); }
      else confirmSubmit();
    });
  }

  function renderOptions(q) {
    const chosen = state.answers[q.questionId];
    let html = '<div class="options" role="listbox">';
    q.options.forEach(function (o, i) {
      html +=
        '<button type="button" class="option' + (chosen === i ? " selected" : "") + '" data-opt="' + i + '">' +
        '<span class="dot"></span><span>' + PC.esc(o) + "</span></button>";
    });
    return html + "</div>";
  }

  function renderFib(q) {
    const saved = Array.isArray(state.answers[q.questionId]) ? state.answers[q.questionId] : [];
    let html = '<div class="options" style="gap:12px">';
    for (let i = 0; i < q.blanks; i++) {
      html +=
        '<div class="field" style="margin:0"><label>Blank ' + (i + 1) + "</label>" +
        '<input type="text" data-blank="' + i + '" value="' + PC.esc(saved[i] || "") + '" placeholder="Type the missing value" autocomplete="off"></div>';
    }
    return html + '</div><p class="small muted mt-1">Matched case- and whitespace-insensitively against the statutory value.</p>';
  }

  function renderSim(q) {
    const ui = state.simUi[q.questionId] || (state.simUi[q.questionId] = { steps: [] });
    const nodesById = {};
    q.nodes.forEach(function (n) { nodesById[n.nodeId] = n; });

    let html = "";
    // Path taken so far
    if (ui.steps.length) {
      html += '<div class="evidence mt-1"><h3>Your decisions so far</h3><div class="rows">';
      ui.steps.forEach(function (s, i) {
        const node = nodesById[s.nodeId];
        const choice = node && node.choices.find(function (c) { return c.choiceId === s.choiceId; });
        html += '<div class="row"><span class="k">Step ' + (i + 1) + '</span><span class="v">' +
          PC.esc(choice ? choice.text : "") + "</span></div>";
      });
      html += "</div></div>";
    }

    // Next node = follow the recorded path, else first node.
    let nextNode = q.nodes[0];
    if (ui.steps.length) {
      const last = ui.steps[ui.steps.length - 1];
      const lastNode = nodesById[last.nodeId];
      const lastChoice = lastNode && lastNode.choices.find(function (c) { return c.choiceId === last.choiceId; });
      nextNode = lastChoice && lastChoice.nextNodeId ? nodesById[lastChoice.nextNodeId] : null;
    }

    if (nextNode) {
      html +=
        '<h3 class="h-sm mt-2 mb-1">' + PC.esc(nextNode.prompt) + '</h3>' +
        '<div class="options" role="listbox">';
      nextNode.choices.forEach(function (c) {
        html +=
          '<button type="button" class="option" data-sim-choice="' + c.choiceId + '" data-sim-node="' + nextNode.nodeId + '">' +
          '<span class="dot"></span><span>' + PC.esc(c.text) + "</span></button>";
      });
      html += "</div>";
    } else {
      html += '<p class="small mt-2"><span class="badge badge-good">✓ Scenario complete</span> — decision path recorded.</p>';
    }
    if (ui.steps.length) {
      html += '<div class="mt-2"><button type="button" class="btn btn-ghost btn-sm" data-sim-restart>↺ Restart scenario</button></div>';
    }
    return html;
  }

  function bindQuestion(q) {
    if (q.type === "mcq" || q.type === "case_study") {
      root.querySelectorAll(".option[data-opt]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          queueSave(q.questionId, parseInt(btn.dataset.opt, 10));
          root.querySelectorAll(".option[data-opt]").forEach(function (b) { b.classList.remove("selected"); });
          btn.classList.add("selected");
        });
      });
    } else if (q.type === "fib") {
      const inputs = root.querySelectorAll("input[data-blank]");
      inputs.forEach(function (inp) {
        inp.addEventListener("input", function () {
          const arr = [];
          inputs.forEach(function (x) { arr[parseInt(x.dataset.blank, 10)] = x.value; });
          queueSave(q.questionId, arr);
        });
      });
    } else if (q.type === "simulation") {
      root.querySelectorAll(".option[data-sim-choice]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          const ui = state.simUi[q.questionId];
          ui.steps.push({ nodeId: btn.dataset.simNode, choiceId: btn.dataset.simChoice });
          queueSave(q.questionId, ui.steps.slice());
          renderQuestion();
        });
      });
      const restart = root.querySelector("[data-sim-restart]");
      if (restart) restart.addEventListener("click", function () {
        state.simUi[q.questionId].steps = [];
        queueSave(q.questionId, []);
        renderQuestion();
      });
    }
  }

  function confirmSubmit() {
    const unanswered = state.questions.filter(function (q) {
      const a = state.answers[q.questionId];
      return a === undefined || (Array.isArray(a) && a.length === 0);
    }).length;
    if (unanswered > 0 &&
        !confirm(unanswered + " question" + (unanswered === 1 ? " is" : "s are") + " unanswered and will score 0. Submit anyway?")) {
      return;
    }
    submit(false);
  }

  /* ================= submit → server scores ================= */
  async function submit(auto) {
    if (!state || state.submitting) return;
    state.submitting = false; // allow flush first
    clearTimeout(state.saveTimer);
    await flushSaves();
    state.submitting = true;
    clearInterval(state.timerId);

    let result;
    try {
      result = await PC.api("/assessments/attempts/" + state.attemptId + "/submit", { method: "POST", body: {} });
    } catch (e) {
      // The server may have auto-submitted at expiry a heartbeat earlier.
      try {
        const current = await PC.api("/assessments/attempts/current");
        if (current.autoSubmitted) return renderResult(current.result, true);
      } catch (e2) { /* fall through */ }
      state.submitting = false;
      return stageMessage("Submission failed", PC.esc(e.message));
    }
    renderResult(result, auto);
  }

  function scoreRing(pct, passed) {
    const r = 62, c = 2 * Math.PI * r;
    const off = c * (1 - Math.min(100, pct) / 100);
    const col = passed ? "var(--chart-green)" : "var(--status-warning)";
    return (
      '<svg width="170" height="170" viewBox="0 0 170 170" role="img" aria-label="Score ' + pct + ' percent">' +
      '<circle cx="85" cy="85" r="' + r + '" fill="none" stroke="var(--green-100)" stroke-width="13"/>' +
      '<circle cx="85" cy="85" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="13" stroke-linecap="round" ' +
      'stroke-dasharray="' + c + '" stroke-dashoffset="' + off + '" transform="rotate(-90 85 85)"/>' +
      '<text x="85" y="82" text-anchor="middle" font-size="32" font-weight="700" fill="var(--ink)">' + pct + "%</text>" +
      '<text x="85" y="104" text-anchor="middle" font-size="11" fill="var(--muted)">server-scored</text>' +
      "</svg>"
    );
  }

  async function renderResult(rs, auto) {
    const passed = rs.state === "certified";
    const b = rs.breakdown || { correct: 0, incorrect: 0, total: 0, threshold: 80 };

    root.innerHTML =
      '<div class="engine-shell"><div class="engine-body">' +
      '<div class="result-state">' +
      (passed
        ? '<span class="badge badge-good">✓ Threshold met — ' + b.threshold + '%+</span><div class="verdict">Certified Individual</div>'
        : '<span class="badge badge-critical">✕ Below the ' + b.threshold + '% threshold</span><div class="verdict">Not Certified</div>') +
      '<div class="score-ring-wrap">' + scoreRing(rs.score, passed) + "</div>" +
      '<p class="small muted">' +
      (auto ? "Auto-submitted when the server timer expired. " : "") +
      b.correct + " of " + b.total + " fully correct · performance level: <strong>" + PC.esc(rs.performanceLevel || "—") + "</strong>" +
      (passed
        ? (rs.certificate ? " · certificate <span class='mono'>" + PC.esc(rs.certificate.certId) + "</span> issued — see your dashboard." : "")
        : " · review the answers below; re-attempts rotate the paper.") +
      "</p></div>" +
      '<div id="review-slot"><p class="small muted center" style="padding:20px">Loading answer review…</p></div>' +
      "</div>" +
      '<div class="engine-foot">' +
      '<button class="btn btn-ghost" id="btn-retake">Take Another Attempt</button>' +
      '<a class="btn btn-orange" href="employee.html">My Dashboard →</a>' +
      "</div></div>";

    document.getElementById("btn-retake").addEventListener("click", function () {
      state = null;
      renderEntry();
      window.scrollTo({ top: root.getBoundingClientRect().top + window.scrollY - 90, behavior: "smooth" });
    });

    // Post-scoring review (owner-only endpoint)
    try {
      const review = await PC.api("/assessments/attempts/" + rs.attemptId + "/review");
      document.getElementById("review-slot").innerHTML = renderReview(review);
    } catch (e) {
      document.getElementById("review-slot").innerHTML =
        '<p class="small muted center" style="padding:20px">Answer review unavailable: ' + PC.esc(e.message) + "</p>";
    }
    root.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderReview(review) {
    let rows = "";
    review.questions.forEach(function (r) {
      if (r.type === "simulation") {
        let path = (r.yourPath || []).map(function (s) { return PC.esc(s.choice); }).join(" → ") || "—";
        let rec = (r.recommendedPath || []).map(function (s) { return PC.esc(s.choice); }).join(" → ");
        rows +=
          "<tr><td>" + r.order + "</td><td>" + TYPE_LABEL[r.type] + "</td>" +
          "<td>" + PC.esc(truncate(r.question, 90)) + '<br><span class="small muted">Your path: ' + path +
          '</span><br><span class="small muted">Recommended: ' + rec + "</span></td>" +
          '<td><span class="badge badge-neutral">Impact-rated</span></td></tr>';
        return;
      }
      const badge =
        r.result === "correct" ? '<span class="badge badge-good">✓ Correct</span>' :
        r.result === "partial" ? '<span class="badge badge-warning">◐ Partial credit</span>' :
        r.result === "see_blanks" ? '<span class="badge badge-neutral">Per-blank</span>' :
        '<span class="badge badge-critical">✕ Incorrect</span>';
      rows +=
        "<tr><td>" + r.order + "</td><td>" + TYPE_LABEL[r.type] + "</td>" +
        "<td>" + PC.esc(truncate(r.question, 90)) +
        '<br><span class="small muted">You: ' + PC.esc(r.yourAnswer || "—") +
        " · Correct: " + PC.esc(r.correctAnswer || "—") + "</span></td>" +
        "<td>" + badge + "</td></tr>";
    });
    return (
      '<h3 class="h-sm mt-3 mb-2">Answer review</h3>' +
      '<p class="small muted mb-2">Correct answers are revealed only after scoring — which is why every re-attempt draws a rotated paper.</p>' +
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>#</th><th>Format</th><th>Question &amp; answers</th><th>Result</th></tr></thead><tbody>' +
      rows + "</tbody></table></div>"
    );
  }

  function truncate(s, n) {
    s = String(s || "");
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }
})();
