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

    // Wire up question creation
    document.getElementById("btn-add-question").addEventListener("click", () => openQuestionModal());
    document.getElementById("question-modal-close").addEventListener("click", closeQuestionModal);
    document.getElementById("btn-add-option-row").addEventListener("click", () => addOptionRow("", 0));
    document.getElementById("btn-add-blank-row").addEventListener("click", () => addBlankRow([]));
    document.getElementById("q-field-type").addEventListener("change", handleTypeChange);
    document.getElementById("question-form").addEventListener("submit", handleQuestionSave);

    // Wire up certificate verification
    document.getElementById("btn-verify-search").addEventListener("click", handleCertSearch);

    // Load initial tab
    switchTab("questions");
  }

  function switchTab(tab) {
    currentTab = tab;
    ["questions", "verify", "orgs"].forEach(t => {
      document.getElementById("tab-" + t).classList.toggle("hidden", t !== tab);
    });
    if (tab === "questions") loadQuestions();
    if (tab === "orgs") loadOrgs();
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
      const editBtn = `<button class="btn btn-ghost btn-sm" onclick="PC.openEditQuestion('${q._id}')">Edit</button>`;
      return `
        <div class="card question-list-item" style="padding:16px;">
          <div class="flex spread">
            <div>
              <span class="badge" style="background:#eef6f2; color:var(--green-900); font-weight:600">${q.type.toUpperCase()} (v${q.version})</span>
              <span class="small muted" style="margin-left:8px">${PC.esc(q.actReference)}</span>
            </div>
            ${editBtn}
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
    document.getElementById("q-field-type").disabled = !!q; // type cannot be changed
    document.getElementById("q-field-ref").value = q ? q.actReference || "" : "";
    document.getElementById("q-field-diff").value = q ? q.difficulty || "medium" : "medium";
    document.getElementById("q-field-body").value = q ? q.body : "";

    document.getElementById("q-options-list").innerHTML = "";
    document.getElementById("q-blanks-list").innerHTML = "";

    handleTypeChange();

    if (q) {
      if (q.options) q.options.forEach(o => addOptionRow(o.text, o.weight));
      if (q.blanks) q.blanks.forEach(b => addBlankRow(b.acceptedAnswers));
    } else {
      // Defaults
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

  function closeQuestionModal() {
    document.getElementById("question-modal").classList.remove("open");
  }

  function handleTypeChange() {
    const type = document.getElementById("q-field-type").value;
    document.getElementById("q-block-options").classList.toggle("hidden", type === "fib");
    document.getElementById("q-block-blanks").classList.toggle("hidden", type !== "fib");
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
      <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('q-opt-row-${id}').remove()" style="color:var(--orange-700)">✕</button>
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
      <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('q-blank-row-${id}').remove()" style="color:var(--orange-700)">✕</button>
    `;
    list.appendChild(row);
  }

  async function handleQuestionSave(e) {
    e.preventDefault();
    const errEl = document.getElementById("q-form-error");
    errEl.classList.add("hidden");

    const id = document.getElementById("q-field-id").value;
    const type = document.getElementById("q-field-type").value;
    const actReference = document.getElementById("q-field-ref").value;
    const difficulty = document.getElementById("q-field-diff").value;
    const body = document.getElementById("q-field-body").value;

    const payload = { type, actReference, difficulty, body };

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

  /* ---------------- Certificate Verification & Revocation ---------------- */
  async function handleCertSearch() {
    const input = document.getElementById("verify-search-input").value.trim();
    const resultEl = document.getElementById("verify-search-result");
    if (!input) return;

    resultEl.innerHTML = '<p class="small muted">Searching...</p>';

    try {
      const d = await PC.api("/public/verify/" + encodeURIComponent(input));
      const revokeBtnText = d.revoked ? "Restore Certificate" : "Revoke Certificate";
      const badgeStyle = d.status === "valid" ? "background:#dbeae2; color:var(--green-900)" : "background:#fbeee9; color:var(--orange-700)";
      
      resultEl.innerHTML = `
        <div class="card mt-2" style="border-left:4px solid var(--green-900); padding:16px;">
          <h3 class="h-sm">${d.type === "compliance" ? "Organisational Compliance" : "Individual Assessment"}</h3>
          <div class="rows mt-1">
            <div class="row"><span class="k">ID</span><span class="v mono">${PC.esc(d.certId)}</span></div>
            <div class="row"><span class="k">Holder</span><span class="v">${PC.esc(d.holderName || "N/A")}</span></div>
            <div class="row"><span class="k">Organisation</span><span class="v">${PC.esc(d.organisation)}</span></div>
            <div class="row"><span class="k">Status</span><span class="v"><span class="badge" style="${badgeStyle}; font-weight:600">${PC.esc(d.status.toUpperCase())}</span></span></div>
            <div class="row"><span class="k">Issued</span><span class="v">${PC.esc(d.issuedAt)}</span></div>
          </div>
          <!-- Revocation controls can be added via backend update patch route if required -->
        </div>
      `;
    } catch (e) {
      resultEl.innerHTML = '<p style="color:var(--orange-700)">Certificate not found or invalid format.</p>';
    }
  }

  /* ---------------- Organisations & Custom Cert Upload ---------------- */
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
      const seatBadge = org.seatsActive ? '<span class="badge badge-good">Active</span>' : '<span class="badge badge-warning">Pending Payment</span>';
      
      return `
        <div class="card" style="padding:16px;">
          <div class="flex spread" style="flex-wrap:wrap; gap:10px;">
            <div>
              <h3 class="h-sm" style="margin:0">${PC.esc(org.name)} <span class="mono small muted">(${org.orgCode})</span></h3>
              <p class="small muted mt-1">Headcount: ${org.headcount} · Seats: ${seatBadge} · Compliance: <span class="badge">${org.compliance.status.replace(/_/g, " ")}</span></p>
              ${org.compliance.customCertificateFilename ? `<p class="small text-green mt-1">✓ Attached Cert: <a href="/api/v1/orgs/me/custom-certificate" style="font-weight:600">${PC.esc(org.compliance.customCertificateFilename)}</a></p>` : ""}
            </div>
            <div class="flex" style="gap:8px; align-items:center;">
              <button class="btn btn-ghost btn-sm" onclick="PC.toggleOrgSeats('${org._id}', ${org.seatsActive})">${seatBtnText}</button>
              
              <!-- File Upload Form -->
              <div style="border-left: 1px solid var(--line); padding-left: 10px;">
                <label class="btn btn-sm btn-ghost" style="cursor:pointer; margin:0">
                  📁 Upload Custom Cert
                  <input type="file" accept="application/pdf" style="display:none" onchange="PC.handleCustomCertUpload(event, '${org._id}')">
                </label>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  window.PC = window.PC || {};
  PC.toggleOrgSeats = async function (id, currentVal) {
    try {
      await PC.api(`/admin/orgs/${id}`, { method: "PATCH", body: { seatsActive: !currentVal } });
      loadOrgs();
    } catch (ex) {
      alert("Failed to toggle seats: " + ex.message);
    }
  };

  PC.handleCustomCertUpload = function (event, orgId) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      alert("Please upload a valid PDF document.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async function () {
      const base64Data = reader.result.split(",")[1];
      try {
        await PC.api(`/admin/orgs/${orgId}/upload-certificate`, {
          method: "POST",
          body: { filename: file.name, base64Data: base64Data }
        });
        alert(`✓ Successfully uploaded compliance certificate: ${file.name}`);
        loadOrgs();
      } catch (ex) {
        alert("Upload failed: " + ex.message);
      }
    };
    reader.readAsDataURL(file);
  };

})();
