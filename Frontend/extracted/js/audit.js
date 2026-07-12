/* POSH Compass — audit module, wired to the real API (hr_admin view).
     GET  /orgs/me/dashboard   → readiness gate + compliance status
     GET  /audits/slots        → open Jijiwisha Society slots
     POST /audits              → book (requires POSH Ready)
     GET  /audits/current      → this organisation's latest audit
     POST /audits/:id/documents→ document metadata (storage: PRD §16 open item)
     GET  /audits/:id/pack     → sealed evidence pack (JSON download)
   Checklist verification and the final decision are AUDITOR actions — this
   page renders their server-side state read-only. */
(function () {
  "use strict";

  const PC = window.PC;
  const root = document.getElementById("audit-flow-root");
  if (!root) return;

  let dash = null;   // /orgs/me/dashboard
  let audit = null;  // /audits/current (or null)

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    const user = await PC.me();
    if (!user) {
      root.innerHTML =
        '<div class="chart-card center" style="padding:48px"><h2 class="h-md">Sign in required</h2>' +
        '<p class="small muted mt-1 mb-2">The audit module works on your organisation\'s live compliance record.</p>' +
        '<div class="flex" style="justify-content:center"><button class="btn btn-orange" data-login>Login</button>' +
        '<button class="btn btn-ghost" data-register>Register Organisation</button></div></div>';
      return;
    }
    if (user.role !== "hr_admin" && user.role !== "super_admin") {
      root.innerHTML =
        '<div class="chart-card center" style="padding:48px"><h2 class="h-md">Admin access required</h2>' +
        '<p class="small muted mt-1">Audits are managed by the organisation\'s HR admin.</p></div>';
      return;
    }
    await refresh();
  }

  // CSP blocks inline onclick attributes (script-src-attr 'none') — delegate
  // from root once, since render() replaces root's children but not root itself.
  root.addEventListener("click", function (e) {
    const dlBtn = e.target.closest(".audit-dl-doc-btn");
    if (dlBtn) {
      e.preventDefault();
      PC.downloadFile(dlBtn.dataset.path, dlBtn.dataset.filename);
      return;
    }
    const printBtn = e.target.closest(".audit-print-cert-btn");
    if (printBtn) {
      PC.printCertificate(orgCertData());
      return;
    }
  });

  // Data for the branded org compliance certificate — one source for both the
  // on-screen render (stage 5) and printing, so they can never drift apart.
  function orgCertData() {
    const comp = dash.compliance;
    return {
      title: "POSH Compliance Certificate",
      name: PC.esc(dash.org.name),
      bodyHtml:
        "has been audited and found compliant with the requirements of the<br>" +
        "Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act, 2013",
      refLine:
        PC.esc(comp.certificateId || "") +
        " · Valid till " + (comp.validTill ? fmtDate(comp.validTill) : "—"),
    };
  }

  async function refresh() {
    try {
      dash = await PC.api("/orgs/me/dashboard");
    } catch (e) {
      root.innerHTML = '<div class="chart-card center" style="padding:40px"><h2 class="h-md">Could not load</h2><p class="small muted mt-1">' + PC.esc(e.message) + "</p></div>";
      return;
    }
    audit = null;
    try {
      audit = await PC.api("/audits/current");
    } catch (e) { /* 404 = no audit yet */ }
    render();
  }

  /* ---------------- stage status ---------------- */
  function stageStatus() {
    const booked = !!audit;
    const docsDone = booked && audit.documents.length >= 1;
    const checklistDone = booked && audit.checklist.length > 0 && audit.checklist.every(c => c.status === "ok");
    const decided = booked && ["passed", "failed", "certificate_issued", "changes_requested"].indexOf(audit.status) >= 0;
    const certified = booked && audit.status === "certificate_issued";
    const s1 = booked ? "done" : "current";
    const s2 = !booked ? "locked" : docsDone ? "done" : "current";
    const s3 = !booked ? "locked" : checklistDone ? "done" : docsDone ? "current" : "locked";
    const s4 = !booked ? "locked" : "current"; // pack can be exported any time after booking
    const s5 = !booked ? "locked" : certified ? "done" : decided ? "current" : "locked";
    return [s1, s2, s3, booked ? (docsDone ? "done" : s4) : "locked", s5];
  }

  function fmtDate(d) {
    return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }
  function fmtDateTime(d) {
    return new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  }

  /* ---------------- render ---------------- */
  function render() {
    const st = stageStatus();
    const doneCount = st.filter(s => s === "done").length;
    const lbl = document.getElementById("audit-progress-label");
    if (lbl) lbl.textContent = audit && audit.status === "certificate_issued"
      ? "Complete — certificate issued"
      : "Stage " + Math.min(5, doneCount + 1) + " of 5";

    root.innerHTML = "";
    root.appendChild(stage1(st[0]));
    root.appendChild(stage2(st[1]));
    root.appendChild(stage3(st[2]));
    root.appendChild(stage4(st[3]));
    root.appendChild(stage5(st[4]));
    bind();
  }

  function shell(n, status, title, badge, bodyHtml) {
    const el = document.createElement("div");
    el.className = "audit-stage " + (status === "done" ? "done" : status === "current" ? "current" : "");
    el.innerHTML =
      '<div class="stage-node">' + (status === "done" ? "✓" : n) + "</div>" +
      '<div class="stage-card"' + (status === "locked" ? ' style="opacity:.55"' : "") + ">" +
      '<div class="s-head"><h2 class="h-md">' + title + "</h2>" + badge + "</div>" +
      bodyHtml + "</div>";
    return el;
  }

  function evRow(k, v) {
    return '<div class="row"><span class="k">' + k + '</span><span class="v">' + v + "</span></div>";
  }

  /* ── Stage 1: book ── */
  function stage1(status) {
    let body;
    if (audit) {
      body =
        '<p class="small muted">Audit request submitted to Jijiwisha Society. This booking is recorded and referenced in every later stage.</p>' +
        '<div class="evidence mt-2"><h3>Booking record</h3><div class="rows">' +
        evRow("Audit ID", '<span class="mono">' + PC.esc(audit._id || audit.id) + "</span>") +
        evRow("Submitted", fmtDateTime(audit.createdAt)) +
        evRow("Status", '<span class="badge badge-neutral">' + PC.esc(audit.status.replace(/_/g, " ")) + "</span>") +
        evRow("Auditor", "Jijiwisha Society · empanelled") +
        "</div></div>";
    } else if (!dash.readiness.auditUnlocked) {
      body =
        '<p class="small muted">Audit booking unlocks when your organisation is <strong>POSH Ready</strong> — ' +
        dash.readiness.threshold + "% of enrolled employees certified in the current cycle.</p>" +
        '<div class="meter mt-2"><div class="fill warn" style="width:' + Math.min(100, dash.readiness.score) + '%"></div>' +
        '<div class="threshold" style="left:' + dash.readiness.threshold + '%" data-label="' + dash.readiness.threshold + '% = POSH Ready"></div></div>' +
        '<p class="small mt-2"><span class="badge badge-warning">▲ ' + dash.readiness.score + "% now — " +
        dash.readiness.certificationsNeeded.toLocaleString("en-IN") + " more certification" + (dash.readiness.certificationsNeeded === 1 ? "" : "s") + " needed</span></p>" +
        '<div class="mt-2"><a class="btn btn-ghost btn-sm" href="dashboard.html">Track readiness on the dashboard →</a></div>';
    } else {
      body =
        '<p class="small muted">Your organisation is POSH Ready — submit your compliance records for verification by Jijiwisha Society. The scope declaration is a formal undertaking recorded with the booking.</p>' +
        '<label class="small" style="display:flex;gap:9px;align-items:flex-start;cursor:pointer;margin-top:12px">' +
        '<input type="checkbox" id="a-scope" style="margin-top:3px">' +
        "<span>I declare on behalf of the organisation that the records submitted for this audit are complete and accurate, and I consent to verification of the Internal Committee's constitution and process. <em>(recorded with the booking)</em></span></label>" +
        '<div class="mt-2"><button class="btn btn-orange" id="a-book">Submit Audit to Jijiwisha Society</button></div>' +
        '<div id="a-book-msg" class="small mt-1" style="color:var(--orange-700)"></div>';
    }
    return shell(1, status, "Request Audit & Compliance Verification",
      audit ? '<span class="badge badge-good">✓ Requested</span>' : '<span class="badge badge-neutral">POSH Ready required</span>', body);
  }

  /* ── Stage 2: documents ── */
  function stage2(status) {
    let body;
    if (!audit) {
      body = '<p class="small muted">Unlocks after the audit is booked. Required records: POSH policy, IC constitution order, Section 21 annual report, and the platform\'s training/assessment evidence.</p>';
    } else {
      let rows = "";
      audit.documents.forEach(function (d, i) {
        rows +=
          "<li><span data-icon='doc' data-size='17' data-color='#0e7a3d'></span>" +
          "<span><strong>" + PC.esc(d.name) + "</strong><br><span class='small muted'>" + fmtDateTime(d.uploadedAt) + "</span></span>" +
          `<span class="ref"><a class="badge badge-good audit-dl-doc-btn" href="#" data-path="/audits/${audit._id || audit.id}/documents/${i}" data-filename="${PC.esc(d.name)}">✓ download</a></span></li>`;
      });
      let declineNote = "";
      if (audit.status === "changes_requested" && audit.findings) {
        declineNote = '<div style="margin-top:10px; padding:12px; background:#fffbfb; border:1px dashed var(--orange-700); border-radius:6px;">' +
          '<h4 class="small" style="color:var(--orange-700); font-weight:700; margin:0 0 4px;">⚠️ Evidence Pack Declined (Changes Requested)</h4>' +
          '<p class="small" style="margin:0; font-weight:500;">' + PC.esc(audit.findings) + '</p>' +
          '</div>';
      }

      body =
        '<p class="small muted">Register and upload your POSH compliance records. <strong>Please combine all required files into one single PDF document before uploading.</strong> Each uploaded file is securely saved in the evidence pack.</p>' +
        declineNote +
        (rows ? '<ul class="doc-list mt-2">' + rows + "</ul>" : '<p class="small muted mt-2">No documents registered yet.</p>') +
        (status !== "locked"
          ? '<form class="flex mt-2" id="doc-form" style="flex-wrap:wrap;gap:10px;align-items:center">' +
            '<input name="name" id="doc-upload-name" required placeholder="Document name (e.g. POSH Policy 2026)" style="flex:1.2;min-width:200px">' +
            '<label class="btn btn-ghost" style="cursor:pointer; margin:0">' +
              '📁 Choose File' +
              '<input type="file" id="doc-upload-file" required style="display:none">' +
            '</label>' +
            '<span id="doc-file-label" class="small muted">No file chosen</span>' +
            '<button class="btn btn-green" type="submit">+ Upload document</button></form>' +
            '<div id="doc-msg" class="small mt-1" style="color:var(--orange-700)"></div>'
          : "");
    }
    const n = audit ? audit.documents.length : 0;
    return shell(2, status, "Upload Documentation",
      n ? '<span class="badge badge-good">✓ ' + n + " uploaded</span>" : '<span class="badge badge-neutral">Document registry</span>',
      body);
  }

  /* ── Stage 3: NCW checklist (auditor-verified) ── */
  function stage3(status) {
    let body;
    if (!audit) {
      body = '<p class="small muted">Jijiwisha Society verifies your Internal Committee and records against the NCW-aligned checklist. This is an external check — the organisation cannot self-attest it.</p>';
    } else {
      let checks = "";
      audit.checklist.forEach(function (c) {
        const badge =
          c.status === "ok" ? '<span class="badge badge-good">✓ Verified</span>' :
          c.status === "issue" ? '<span class="badge badge-serious">⚑ Issue</span>' :
          '<span class="badge badge-neutral">◷ Pending</span>';
        checks +=
          "<li><span data-icon='" + (c.status === "ok" ? "check" : "scale") + "' data-size='16' data-color='" + (c.status === "ok" ? "#0e7a3d" : "#75827a") + "'></span>" +
          "<span>" + PC.esc(c.item) + (c.note ? "<br><span class='small muted'>Auditor note: " + PC.esc(c.note) + "</span>" : "") + "</span>" +
          '<span class="ref">' + badge + "</span></li>";
      });
      const okCount = audit.checklist.filter(c => c.status === "ok").length;
      body =
        '<p class="small muted">The NCW-aligned checklist is worked through by the Jijiwisha Society auditor — ' +
        okCount + " of " + audit.checklist.length + " items verified so far. This page reflects the live server record.</p>" +
        '<ul class="doc-list mt-2">' + checks + "</ul>" +
        '<div class="mt-2"><button class="btn btn-ghost btn-sm" id="a-refresh">↻ Refresh status</button></div>';
    }
    return shell(3, status, "NCW Checklist Verification",
      audit && audit.checklist.every(c => c.status === "ok") && audit.checklist.length
        ? '<span class="badge badge-good">✓ Compliant</span>'
        : '<span class="badge badge-neutral">Verified by Jijiwisha Society</span>',
      body);
  }

  /* ── Stage 4: evidence pack ── */
  function stage4(status) {
    let body;
    if (!audit) {
      body = '<p class="small muted">Unlocks after booking. Compiles the booking record, document registry, checklist state, readiness snapshot and per-employee certification list (name + status + score band only) into one export.</p>';
    } else {
      if (audit.status === "changes_requested") {
        body = '<p class="small muted">The evidence pack was reviewed by Jijiwisha Society and changes were requested. Please update your documents in Stage 2.</p>';
      } else {
        body = '<p class="small muted">The compiled evidence pack (including readiness snapshot, document registry, and certifications) has been successfully submitted to Jijiwisha Society for verification.</p>';
      }
    }
    return shell(4, status, "Evidence Pack",
      audit ? (audit.status === "changes_requested" ? '<span class="badge badge-serious">Changes Requested</span>' : '<span class="badge badge-good">Submitted</span>') : '<span class="badge badge-neutral">Automatic compilation</span>', body);
  }

  /* ── Stage 5: decision / compliance certificate ── */
  function stage5(status) {
    let body;
    const comp = dash.compliance;
    if (audit && audit.status === "certificate_issued") {
      body =
        '<div class="evidence mt-1"><h3>Final compliance decision</h3><div class="rows">' +
        evRow("Decision", '<span class="ok">PASSED — CERTIFICATE ISSUED</span>') +
        evRow("Certificate ID", '<span class="mono">' + PC.esc(comp.certificateId || "") + "</span>") +
        evRow("Valid till", comp.validTill ? fmtDate(comp.validTill) : "—") +
        (audit.decisionAt ? evRow("Decided", fmtDateTime(audit.decisionAt)) : "") +
        (audit.findings ? evRow("Findings", PC.esc(audit.findings)) : "") +
        "</div></div>" +
        '<div class="mt-3">' + PC.buildCertificateHtml(orgCertData()) + "</div>" +
        '<div class="flex mt-2 no-print"><button class="btn btn-orange audit-print-cert-btn">Print / Save Certificate</button>' +
        '<a class="btn btn-ghost" href="/verify/' + PC.esc(comp.certificateId || "") + '" target="_blank" rel="noopener">Public verification ↗</a></div>';
    } else if (audit && (audit.status === "failed" || audit.status === "changes_requested")) {
      body =
        '<div class="evidence mt-1"><h3>Auditor determination</h3><div class="rows">' +
        evRow("Decision", '<span class="badge badge-serious">' + PC.esc(audit.status.replace(/_/g, " ").toUpperCase()) + "</span>") +
        (audit.findings ? evRow("Findings", PC.esc(audit.findings)) : "") +
        (audit.decisionAt ? evRow("Decided", fmtDateTime(audit.decisionAt)) : "") +
        "</div></div>" +
        '<p class="small muted mt-2">Address the findings and coordinate with Jijiwisha Society for re-review.</p>';
    } else if (audit) {
      body = '<p class="small muted">Jijiwisha Society reviews the evidence and issues its determination — a positive finding results in the POSH Compliance Certificate (12-month validity). Current status: <span class="badge badge-neutral">' + PC.esc(audit.status.replace(/_/g, " ")) + "</span></p>";
    } else {
      body = '<p class="small muted">Unlocks after the audit is underway. The certificate is issued only on a positive determination by Jijiwisha Society.</p>';
    }
    return shell(5, status, "Final Compliance Report",
      audit && audit.status === "certificate_issued"
        ? '<span class="badge badge-good">★ Certified</span>'
        : '<span class="badge badge-neutral">Issued by Jijiwisha Society</span>', body);
  }

  /* ---------------- events ---------------- */
  function bind() {
    root.querySelectorAll("[data-icon]").forEach(function (el) {
      el.innerHTML = PC.icon(el.dataset.icon, el.dataset.size || 22, el.dataset.color || "currentColor");
    });

    // Stage 1: slots + booking
    // Stage 1: slots + booking
    const bookBtn = document.getElementById("a-book");
    if (bookBtn) {
      bookBtn.addEventListener("click", async function () {
        const msg = document.getElementById("a-book-msg");
        if (!document.getElementById("a-scope").checked) {
          msg.textContent = "The scope declaration must be accepted — it is recorded with the booking.";
          return;
        }
        this.disabled = true;
        try {
          await PC.api("/audits", { method: "POST", body: {} });
          refresh();
        } catch (e) {
          msg.textContent = e.message;
          this.disabled = false;
        }
      });
    }

    // Stage 2: file upload
    const fileInput = document.getElementById("doc-upload-file");
    if (fileInput) {
      fileInput.addEventListener("change", function () {
        const label = document.getElementById("doc-file-label");
        if (label) label.textContent = this.files[0] ? this.files[0].name : "No file chosen";
      });
    }

    const docForm = document.getElementById("doc-form");
    if (docForm) docForm.addEventListener("submit", function (e) {
      e.preventDefault();
      const msg = document.getElementById("doc-msg");
      const btn = docForm.querySelector("button[type='submit']");
      const fileInput = document.getElementById("doc-upload-file");
      const nameInput = document.getElementById("doc-upload-name");

      if (!fileInput || !fileInput.files[0]) {
        if (msg) msg.textContent = "Please select a file to upload.";
        return;
      }

      btn.disabled = true;
      const file = fileInput.files[0];
      const origName = file.name;
      const extMatch = origName.match(/\.[0-9a-z]+$/i);
      const ext = extMatch ? extMatch[0] : '';
      let finalName = nameInput.value.trim();
      if (ext && !finalName.toLowerCase().includes('.')) {
        finalName += ext;
      }
      
      const reader = new FileReader();

      reader.onload = async function () {
        const base64Data = reader.result.split(",")[1];
        try {
          await PC.api("/audits/" + (audit._id || audit.id) + "/documents", {
            method: "POST",
            body: { name: finalName, base64Data: base64Data },
          });
          refresh();
        } catch (ex) {
          if (msg) msg.textContent = ex.message;
          btn.disabled = false;
        }
      };
      reader.readAsDataURL(file);
    });

    // Stage 3: refresh
    const refreshBtn = document.getElementById("a-refresh");
    if (refreshBtn) refreshBtn.addEventListener("click", refresh);

  }

  // The old localStorage demo had a reset button — hide it, state is server-side now.
  const reset = document.getElementById("btn-audit-reset");
  if (reset) reset.style.display = "none";
})();
