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
    ["questions", "orgs"].forEach(t => {
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
                Headcount: ${org.headcount} &nbsp;·&nbsp; Seats: ${seatBadge}
                ${org.registeredEmail ? `&nbsp;·&nbsp; HR Email: <strong>${PC.esc(org.registeredEmail)}</strong>` : ""}
              </p>
              ${attachedCertLink}
              ${evidencePackHtml}
              ${reviewPanelHtml}
            </div>
            <div class="flex" style="gap:8px; align-items:center; flex-shrink:0">
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
