/* POSH Compass — frontend API client + auth & payment UI.
   Talks to the POSH Compass API (/api/v1): every response is an envelope
   {success,data} or {success:false,error:{code,message,fields}}. Auth is a
   short-lived Bearer access token (kept in localStorage) plus a rotating
   HttpOnly refresh cookie scoped to /api/v1/auth — the site must be served
   from the SAME origin as the API. Load AFTER main.js. */
(function () {
  "use strict";

  const PC = (window.PC = window.PC || {});
  const API = "/api/v1";
  const TOKEN_KEY = "pc.accessToken";
  const SESSION_FLAG = "pc.hasSession";

  /* ---------------- token store ---------------- */
  function getToken() { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } }
  function setToken(t) {
    try {
      localStorage.setItem(TOKEN_KEY, t);
      localStorage.setItem(SESSION_FLAG, "1");
    } catch (e) {}
  }
  function clearToken() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(SESSION_FLAG);
    } catch (e) {}
  }
  function hasSession() { try { return localStorage.getItem(SESSION_FLAG) === "1"; } catch (e) { return false; } }

  /* ---------------- API wrapper ---------------- */
  function apiError(res, payload) {
    const e = (payload && payload.error) || {};
    const err = new Error(e.message || "Request failed (" + res.status + ")");
    err.status = res.status;
    err.code = e.code || null;
    if (e.fields) {
      err.fields = e.fields;
      const parts = [];
      Object.keys(e.fields).forEach(function (k) { parts.push(k + ": " + e.fields[k].join(", ")); });
      if (parts.length) err.message = parts.join(" · ");
    }
    // Some domain errors ship data inside the error (e.g. ATTEMPT_EXPIRED carries the result)
    err.extra = e;
    return err;
  }

  async function rawFetch(path, options) {
    options = options || {};
    const headers = Object.assign({}, options.headers || {});
    const token = getToken();
    if (token) headers["Authorization"] = "Bearer " + token;
    let body;
    if (options.rawBody !== undefined) {
      body = options.rawBody; // e.g. CSV import — caller sets Content-Type
    } else if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }
    return fetch(API + path, {
      method: options.method || (body !== undefined ? "POST" : "GET"),
      headers: headers,
      body: body,
      credentials: "same-origin", // refresh cookie rides only on /api/v1/auth
    });
  }

  let refreshing = null; // dedupe concurrent refreshes
  function refreshAccessToken() {
    if (!refreshing) {
      refreshing = fetch(API + "/auth/refresh", { method: "POST", credentials: "same-origin" })
        .then(async function (res) {
          const payload = await res.json().catch(function () { return {}; });
          if (!res.ok || !payload.success) { clearToken(); return null; }
          setToken(payload.data.accessToken);
          return payload.data.accessToken;
        })
        .catch(function () { return null; })
        .finally(function () { refreshing = null; });
    }
    return refreshing;
  }

  /* PC.api("/users/me") → unwrapped data. Retries once through the refresh
     rotation on an expired/missing access token. */
  PC.api = async function (path, options) {
    let res = await rawFetch(path, options);
    if (res.status === 401 && hasSession()) {
      const renewed = await refreshAccessToken();
      if (renewed) res = await rawFetch(path, options);
    }
    let payload = {};
    try { payload = await res.json(); } catch (e) { /* empty body */ }
    if (!res.ok || payload.success === false) throw apiError(res, payload);
    // Envelope: {success, data, pagination?}
    if (payload.pagination) return { data: payload.data, pagination: payload.pagination };
    return payload.data;
  };

  PC.backendDown = function (e) {
    return e instanceof TypeError; // fetch network failure — backend not running
  };

  /* ---------------- session ---------------- */
  let meCache; // per-page-load
  PC.me = function (force) {
    if (!force && meCache !== undefined) return Promise.resolve(meCache);
    if (!getToken() && !hasSession()) { meCache = null; return Promise.resolve(null); }
    return PC.api("/users/me")
      .then(function (user) { meCache = user; return user; })
      .catch(function () { meCache = null; return null; });
  };

  PC.roleHome = function (role) {
    return role === "employee" ? "employee.html" : "dashboard.html";
  };

  PC.logout = async function () {
    try { await PC.api("/auth/logout", { method: "POST", body: {} }); } catch (e) {}
    clearToken();
    window.location.href = "index.html";
  };

  /* ---------------- auth modal ---------------- */
  let authModal = null;
  let onAuthSuccess = null;

  function buildAuthModal() {
    if (authModal) return authModal;
    authModal = document.createElement("div");
    authModal.className = "modal-overlay";
    authModal.id = "auth-modal";
    authModal.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true">' +
      '<button class="close" data-close-auth aria-label="Close">✕</button>' +
      '<div class="flex" style="gap:8px;margin-bottom:18px" id="auth-tabs">' +
      '<button class="btn btn-sm btn-green" data-tab="login">Login</button>' +
      '<button class="btn btn-sm btn-ghost" data-tab="register">Register Organisation</button>' +
      '<button class="btn btn-sm btn-ghost" data-tab="invite">Accept Invite</button>' +
      "</div>" +
      '<div id="auth-error" class="hidden" style="background:var(--status-critical-bg);color:var(--status-critical);border:1px solid #eccccc;border-radius:8px;padding:10px 14px;font-size:0.85rem;margin-bottom:14px"></div>' +

      '<form id="auth-login">' +
      '<h2>Welcome back</h2><p class="small muted mb-2">Sign in to your POSH Compass account.</p>' +
      '<div class="field"><label>Work email</label><input type="email" name="email" required autocomplete="email"></div>' +
      '<div class="field"><label>Password</label><input type="password" name="password" required autocomplete="current-password"></div>' +
      '<button class="btn btn-orange btn-lg" style="width:100%;justify-content:center">Sign In</button>' +
      "</form>" +

      '<form id="auth-register" class="hidden">' +
      '<h2>Register your organisation</h2><p class="small muted mb-2">Creates the organisation record and your HR admin account.</p>' +
      '<div class="field"><label>Organisation name</label><input name="orgName" required minlength="2" placeholder="e.g. ABC Pvt. Ltd."></div>' +
      '<div class="field"><label>Number of employees</label><input type="number" name="headcount" min="1" max="1000000" required placeholder="e.g. 120"><div class="hint" id="reg-price-hint">Pricing scales with headcount — no hidden charges.</div></div>' +
      '<div class="field"><label>Your name (HR admin)</label><input name="adminName" required minlength="2"></div>' +
      '<div class="field"><label>Admin work email</label><input type="email" name="email" required autocomplete="email"></div>' +
      '<div class="field"><label>WhatsApp number <span class="muted">(optional)</span></label><input name="adminWhatsapp" inputmode="tel" maxlength="20" placeholder="e.g. 7355364902"><div class="hint">Used for enrolment and result notifications.</div></div>' +
      '<div class="field"><label>Password (min 10 characters)</label><input type="password" name="password" minlength="10" required autocomplete="new-password"></div>' +
      '<button class="btn btn-orange btn-lg" style="width:100%;justify-content:center">Create Organisation</button>' +
      "</form>" +

      '<form id="auth-invite" class="hidden">' +
      '<h2>Accept your invite</h2><p class="small muted mb-2">Your organisation enrols you by email — the invite link contains a one-time token. Paste it below if you are not coming from the link.</p>' +
      '<div class="field"><label>Invite token</label><input name="token" required minlength="64" maxlength="64" class="mono" placeholder="64-character token from your invite link"></div>' +
      '<div class="field"><label>Set a password (min 10 characters)</label><input type="password" name="password" minlength="10" required autocomplete="new-password"></div>' +
      '<label class="small" style="display:flex;gap:9px;align-items:flex-start;cursor:pointer;margin-bottom:14px">' +
      '<input type="checkbox" name="consent" required style="margin-top:3px">' +
      "<span>I consent to the processing of my assessment data for POSH compliance purposes (DPDP Act, 2023).</span></label>" +
      '<button class="btn btn-orange btn-lg" style="width:100%;justify-content:center">Activate Account</button>' +
      "</form>" +
      "</div>";
    document.body.appendChild(authModal);

    authModal.addEventListener("click", function (e) {
      if (e.target === authModal || e.target.closest("[data-close-auth]")) authModal.classList.remove("open");
      const tab = e.target.closest("[data-tab]");
      if (tab) showTab(tab.dataset.tab);
    });

    const regEmp = authModal.querySelector('#auth-register [name="headcount"]');
    regEmp.addEventListener("input", function () {
      const n = parseInt(regEmp.value, 10) || 0;
      if (n > 0 && PC.rateFor) {
        document.getElementById("reg-price-hint").textContent =
          "₹" + PC.rateFor(n) + " per employee × " + n.toLocaleString("en-IN") +
          " = " + PC.inr(PC.rateFor(n) * n) + " for the full cycle.";
      }
    });

    wireForm("auth-login", "/auth/login", function (f) {
      return { email: f.email.value, password: f.password.value };
    });
    wireForm("auth-register", "/auth/register-org", function (f) {
      var body = {
        orgName: f.orgName.value,
        headcount: parseInt(f.headcount.value, 10),
        adminName: f.adminName.value,
        email: f.email.value,
        password: f.password.value,
      };
      if (f.adminWhatsapp && f.adminWhatsapp.value.trim()) body.adminWhatsapp = f.adminWhatsapp.value.trim();
      return body;
    });
    wireForm("auth-invite", "/auth/invite/accept", function (f) {
      return { token: f.token.value.trim(), password: f.password.value, consent: f.consent.checked };
    });
    return authModal;
  }

  function wireForm(formId, endpoint, toBody) {
    const form = document.getElementById(formId);
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      const err = document.getElementById("auth-error");
      err.classList.add("hidden");
      const btn = form.querySelector("button[class*='btn-orange']");
      btn.disabled = true;
      try {
        const data = await PC.api(endpoint, { body: toBody(form) });
        setToken(data.accessToken);
        meCache = undefined;
        authModal.classList.remove("open");
        renderSessionUi(data.user);
        if (onAuthSuccess) { const cb = onAuthSuccess; onAuthSuccess = null; cb(data); }
        else window.location.reload();
      } catch (ex) {
        err.textContent = PC.backendDown(ex)
          ? "Cannot reach the server. Start the backend with:  npm run dev  (from the project root)"
          : ex.message;
        err.classList.remove("hidden");
      } finally {
        btn.disabled = false;
      }
    });
  }

  function showTab(tab) {
    ["login", "register", "invite"].forEach(function (t) {
      document.getElementById("auth-" + t).classList.toggle("hidden", t !== tab);
      const btn = authModal.querySelector('[data-tab="' + t + '"]');
      btn.className = "btn btn-sm " + (t === tab ? "btn-green" : "btn-ghost");
    });
    document.getElementById("auth-error").classList.add("hidden");
  }

  PC.openAuth = function (tab, callback) {
    buildAuthModal();
    onAuthSuccess = callback || null;
    showTab(tab || "login");
    authModal.classList.add("open");
  };

  /* Require a signed-in user; opens the auth modal if needed. Resolves with
     the /users/me shape: {id,email,name,role,employeeCode,org}. */
  PC.requireAuth = function (tab) {
    return new Promise(function (resolve) {
      PC.me().then(function (user) {
        if (user) return resolve(user);
        PC.openAuth(tab || "login", function () {
          PC.me(true).then(resolve);
        });
      });
    });
  };

  /* ---------------- Shopify checkout (redirect out to Shopify to pay) ---------------- */
  PC.startShopifyCheckout = async function () {
    const data = await PC.api("/payments/shopify/checkout", { method: "POST", body: {} });
    window.location.href = data.url; // seats flip via the Shopify order webhook
  };

  /* ---------------- payment flow (Razorpay orders + webhook) ---------------- */
  PC.startPayment = async function (onPaid) {
    let order;
    try {
      order = await PC.api("/payments/orders", { body: { type: "seats" } });
    } catch (e) {
      if (e.code === "PAYMENTS_NOT_CONFIGURED") return showPaymentsNotConfigured(onPaid);
      return alertModal("Payment failed", escapeH(e.message));
    }
    try {
      await loadScript("https://checkout.razorpay.com/v1/checkout.js");
    } catch (e) {
      return alertModal("Payment failed", "Could not load the Razorpay checkout script.");
    }
    const me = await PC.me();
    const rzp = new window.Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amountPaise,
      currency: order.currency,
      name: "POSH Compass",
      description: (me && me.org ? me.org.name + " · " : "") + "assessment seats",
      theme: { color: "#0e3626" },
      handler: function () { awaitSeatActivation(onPaid); },
    });
    rzp.open();
  };

  /* Seats flip on the server only after Razorpay's webhook is verified —
     poll the org record until it lands. */
  function awaitSeatActivation(onPaid) {
    const m = document.createElement("div");
    m.className = "modal-overlay open";
    m.innerHTML =
      '<div class="modal"><span class="badge badge-good">✓ Payment received</span>' +
      '<h2 class="mt-2">Activating your seats…</h2>' +
      '<p class="small muted" id="pay-wait-msg">Waiting for the payment gateway to confirm (webhook verification). This usually takes a few seconds.</p></div>';
    document.body.appendChild(m);
    let tries = 0;
    const timer = setInterval(async function () {
      tries++;
      try {
        const org = await PC.api("/orgs/me");
        if (org.seatsActive) {
          clearInterval(timer);
          m.remove();
          alertModal("✓ Assessments unlocked",
            "Payment verified — every enrolled employee can now take the assessment.",
            [{ label: "Open Dashboard", href: "dashboard.html" }]);
          if (onPaid) onPaid();
          return;
        }
      } catch (e) { /* keep polling */ }
      if (tries >= 15) {
        clearInterval(timer);
        m.remove();
        alertModal("Payment received — confirmation pending",
          "The gateway has not confirmed yet. Seats activate automatically as soon as the webhook lands; check the dashboard in a minute.");
      }
    }, 2500);
  }

  PC.simulatePaymentUnlock = async function (onPaid, skipAlert) {
    try {
      await PC.api("/payments/mock-activate", { method: "POST" });
      if (!skipAlert) {
        alertModal("✓ Mock Payment Successful",
          "A simulated payment has been registered. Your organization's seats are now activated!",
          [{ label: "Reload Page", href: "javascript:window.location.reload()" }]);
      }
      if (onPaid) onPaid();
    } catch (e) {
      if (!skipAlert) {
        alertModal("Simulation failed", escapeH(e.message));
      }
      throw e;
    }
  };

  async function showPaymentsNotConfigured(onPaid) {
    let org;
    try {
      org = await PC.api("/orgs/me");
    } catch (e) {
      return alertModal("Failed to load organization", "Could not fetch organization details.");
    }

    const headcount = org.headcount || 0;
    const rate = PC.rateFor(headcount);
    const subtotal = headcount * rate;
    const gst = Math.round(subtotal * 0.18);
    const total = subtotal + gst;

    const m = document.createElement("div");
    m.className = "modal-overlay open";
    m.id = "sim-payment-overlay";

    m.innerHTML = 
      '<div class="modal wide" style="position: relative; overflow: hidden;">' +
        '<button class="close" id="sim-pay-close-btn" aria-label="Close">✕</button>' +
        '<span class="sim-pay-badge-sandbox">⚡ SANDBOX PREVIEW GATEWAY</span>' +
        '<h2 class="sim-pay-title">Secure Seat Licensing Checkout</h2>' +
        '<p class="muted small" style="margin-top: 4px;">Since Razorpay keys are not set, you can interact with this beautiful simulated secure sandbox to unlock your assessment seats.</p>' +
        '<div class="sim-pay-grid">' +
          '<div class="sim-pay-summary">' +
            '<h3 style="font-size: 1.05rem; font-weight: 600; color: var(--green-900); margin-bottom: 8px;">Order Details</h3>' +
            '<div class="sim-pay-row">' +
              '<span>Organisation</span>' +
              '<span style="font-weight: 600;">' + escapeH(org.name) + '</span>' +
            '</div>' +
            '<div class="sim-pay-row">' +
              '<span>Declared Seats</span>' +
              '<span>' + headcount.toLocaleString("en-IN") + ' employees</span>' +
            '</div>' +
            '<div class="sim-pay-row">' +
              '<span>Price Tier</span>' +
              '<span>₹' + rate + ' / seat</span>' +
            '</div>' +
            '<div class="sim-pay-row">' +
              '<span>Seat Licensing Subtotal</span>' +
              '<span>₹' + subtotal.toLocaleString("en-IN") + '</span>' +
            '</div>' +
            '<div class="sim-pay-row">' +
              '<span>GST / Taxes (18%)</span>' +
              '<span>₹' + gst.toLocaleString("en-IN") + '</span>' +
            '</div>' +
            '<div class="sim-pay-row total">' +
              '<span>Grand Total</span>' +
              '<span>₹' + total.toLocaleString("en-IN") + '</span>' +
            '</div>' +
            '<div style="background: #f4f8f6; border-radius: 8px; padding: 10px; margin-top: auto; border: 1px solid #dbeae2; display: flex; gap: 8px; align-items: flex-start;">' +
              '<span style="color: var(--green-800); font-weight: bold; font-size: 1.1rem; line-height: 1;">🛡️</span>' +
              '<p style="font-size: 0.74rem; color: #385d49; margin: 0; line-height: 1.3;">Fully compliant SSL connection. The transaction is completely safe and operates inside the sandbox environment.</p>' +
            '</div>' +
          '</div>' +
          '<div class="sim-pay-form-container">' +
            '<div class="sim-pay-tabs">' +
              '<div class="sim-pay-tab-btn active" id="tab-card">💳 Card Payment</div>' +
              '<div class="sim-pay-tab-btn" id="tab-upi">📱 UPI QR Code</div>' +
            '</div>' +
            '<div class="sim-pay-fields" id="form-card-panel">' +
              '<div class="field">' +
                '<label>Card Number</label>' +
                '<input type="text" id="sim-card-num" placeholder="4111 2222 3333 4444" maxlength="19" required>' +
              '</div>' +
              '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">' +
                '<div class="field">' +
                  '<label>Expiry Date</label>' +
                  '<input type="text" id="sim-card-expiry" placeholder="MM/YY" maxlength="5" required>' +
                '</div>' +
                '<div class="field">' +
                  '<label>CVV</label>' +
                  '<input type="password" id="sim-card-cvv" placeholder="•••" maxlength="3" required>' +
                '</div>' +
              '</div>' +
              '<div class="field">' +
                '<label>Cardholder Name</label>' +
                '<input type="text" id="sim-card-name" placeholder="eg. Jane Doe" required>' +
              '</div>' +
            '</div>' +
            '<div class="sim-pay-fields hidden" id="form-upi-panel">' +
              '<div class="sim-pay-qr-box">' +
                '<svg width="110" height="110" viewBox="0 0 100 100" style="background:#fff; padding:6px; border:1px solid #ddd; border-radius:4px;">' +
                  '<rect x="0" y="0" width="22" height="22" fill="#071f16" />' +
                  '<rect x="2" y="2" width="18" height="18" fill="#fff" />' +
                  '<rect x="6" y="6" width="10" height="10" fill="#071f16" />' +
                  '<rect x="78" y="0" width="22" height="22" fill="#071f16" />' +
                  '<rect x="80" y="2" width="18" height="18" fill="#fff" />' +
                  '<rect x="84" y="6" width="10" height="10" fill="#071f16" />' +
                  '<rect x="0" y="78" width="22" height="22" fill="#071f16" />' +
                  '<rect x="2" y="78" width="18" height="18" fill="#fff" />' +
                  '<rect x="6" y="82" width="10" height="10" fill="#071f16" />' +
                  '<rect x="30" y="10" width="6" height="12" fill="#071f16" />' +
                  '<rect x="45" y="15" width="12" height="6" fill="#071f16" />' +
                  '<rect x="30" y="35" width="18" height="18" fill="#071f16" />' +
                  '<rect x="60" y="45" width="24" height="12" fill="#071f16" />' +
                  '<rect x="15" y="60" width="12" height="12" fill="#071f16" />' +
                  '<rect x="50" y="75" width="18" height="18" fill="#071f16" />' +
                  '<rect x="80" y="40" width="12" height="24" fill="#071f16" />' +
                  '<rect x="40" y="60" width="12" height="6" fill="#071f16" />' +
                  '<rect x="75" y="80" width="15" height="15" fill="#071f16" />' +
                '</svg>' +
                '<p class="small muted mt-1" style="font-size:0.72rem;">Scan with BHIM, GPay, PhonePe, or Paytm</p>' +
              '</div>' +
              '<div class="field">' +
                '<label>Or enter UPI ID</label>' +
                '<input type="text" id="sim-upi-id" placeholder="username@upi">' +
              '</div>' +
            '</div>' +
            '<div style="display: flex; flex-direction: column; gap: 8px; margin-top: 12px;">' +
              '<button class="btn btn-orange" id="btn-sim-pay-success" style="padding: 12px; font-weight: 600; font-size: 1rem;">' +
                '🔒 Pay ₹' + total.toLocaleString("en-IN") + ' Securely' +
              '</button>' +
              '<button class="btn btn-sm" id="btn-sim-pay-fail" style="border: 1px solid #d4cdbf; background: transparent; color: #8c7f69; padding: 6px;">' +
                '⚠️ Simulate Transaction Failure' +
              '</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(m);

    const closeBtn = m.querySelector("#sim-pay-close-btn");
    const tabCard = m.querySelector("#tab-card");
    const tabUpi = m.querySelector("#tab-upi");
    const panelCard = m.querySelector("#form-card-panel");
    const panelUpi = m.querySelector("#form-upi-panel");
    const paySuccessBtn = m.querySelector("#btn-sim-pay-success");
    const payFailBtn = m.querySelector("#btn-sim-pay-fail");
    const cardNum = m.querySelector("#sim-card-num");
    const cardExpiry = m.querySelector("#sim-card-expiry");
    const cardCvv = m.querySelector("#sim-card-cvv");

    closeBtn.addEventListener("click", function () { m.remove(); });

    tabCard.addEventListener("click", function () {
      tabCard.classList.add("active");
      tabUpi.classList.remove("active");
      panelCard.classList.remove("hidden");
      panelUpi.classList.add("hidden");
    });
    tabUpi.addEventListener("click", function () {
      tabUpi.classList.add("active");
      tabCard.classList.remove("active");
      panelUpi.classList.remove("hidden");
      panelCard.classList.add("hidden");
    });

    cardNum.addEventListener("input", function (e) {
      let v = e.target.value.replace(/\D/g, "");
      let matches = v.match(/\d{4,16}/g);
      let match = (matches && matches[0]) || "";
      let parts = [];
      for (let i = 0, len = match.length; i < len; i += 4) {
        parts.push(match.substring(i, i + 4));
      }
      if (parts.length > 0) {
        e.target.value = parts.join(" ");
      } else {
        e.target.value = v;
      }
    });

    cardExpiry.addEventListener("input", function (e) {
      let v = e.target.value.replace(/\D/g, "");
      if (v.length >= 2) {
        e.target.value = v.substring(0, 2) + "/" + v.substring(2, 4);
      } else {
        e.target.value = v;
      }
    });

    cardCvv.addEventListener("input", function (e) {
      e.target.value = e.target.value.replace(/\D/g, "");
    });

    function showLoader(messages, onDone) {
      const modalBody = m.querySelector(".modal");
      const loader = document.createElement("div");
      loader.className = "sim-pay-loader-overlay";
      loader.innerHTML =
        '<div class="sim-pay-spinner"></div>' +
        '<h3 id="sim-loader-title" style="font-weight: 600; font-size: 1.15rem; color: var(--green-900);">Processing Payment...</h3>' +
        '<p id="sim-loader-msg" class="muted small" style="margin-top: 4px;"></p>';
      modalBody.appendChild(loader);

      const titleEl = loader.querySelector("#sim-loader-title");
      const msgEl = loader.querySelector("#sim-loader-msg");

      let currentStep = 0;
      function nextStep() {
        if (currentStep < messages.length) {
          const step = messages[currentStep];
          if (step.isError) {
            titleEl.innerHTML = "❌ Payment Failed";
            titleEl.style.color = "var(--orange-700)";
            msgEl.innerHTML = step.text;
            
            const retryBtn = document.createElement("button");
            retryBtn.className = "btn btn-orange mt-3";
            retryBtn.textContent = "Try Payment Again";
            retryBtn.addEventListener("click", function () {
              loader.remove();
            });
            loader.appendChild(retryBtn);
          } else {
            titleEl.innerHTML = "Processing Securely...";
            msgEl.innerHTML = step.text;
            currentStep++;
            setTimeout(nextStep, step.delay || 1200);
          }
        } else {
          onDone(loader);
        }
      }
      nextStep();
    }

    paySuccessBtn.addEventListener("click", function () {
      if (tabCard.classList.contains("active")) {
        if (cardNum.value.replace(/\s/g, "").length < 16) {
          return alertModal("Form Validation", "Please enter a valid 16-digit card number.");
        }
        if (cardExpiry.value.length < 5) {
          return alertModal("Form Validation", "Please enter expiry date MM/YY.");
        }
        if (cardCvv.value.length < 3) {
          return alertModal("Form Validation", "Please enter CVV.");
        }
      } else {
        const upiEl = m.querySelector("#sim-upi-id");
        if (upiEl && !upiEl.value.includes("@")) {
          return alertModal("Form Validation", "Please enter a valid UPI ID (e.g., jane@upi).");
        }
      }

      showLoader([
        { text: "Contacting POSH Compass secure payment server...", delay: 1000 },
        { text: "Verifying sandbox gateway transaction authorization...", delay: 1000 },
        { text: "Acquiring seat licensing package and credentials...", delay: 1000 }
      ], async function (loader) {
        try {
          await PC.simulatePaymentUnlock(null, true);
          
          loader.innerHTML =
            '<div style="font-size: 3.5rem; line-height: 1; margin-bottom: 8px;">🎉</div>' +
            '<h3 style="font-weight: 700; font-size: 1.4rem; color: var(--green-900);">✓ Order Fully Paid!</h3>' +
            '<p class="muted small" style="margin-top: 4px; max-width: 38ch; margin-left: auto; margin-right: auto;">' +
              'Your test payment has completed successfully. All <b>' + headcount.toLocaleString("en-IN") + '</b> assessment seats are unlocked and activated for this compliance cycle!' +
            '</p>' +
            '<button class="btn btn-green mt-3" id="sim-pay-success-done" style="padding: 10px 24px; font-weight: 600;">' +
              'Go to Dashboard' +
            '</button>';
          
          loader.querySelector("#sim-pay-success-done").addEventListener("click", function () {
            m.remove();
            if (onPaid) onPaid();
            window.location.reload();
          });
        } catch (err) {
          loader.innerHTML =
            '<div style="font-size: 3rem; line-height: 1; margin-bottom: 8px;">❌</div>' +
            '<h3 style="font-weight: 700; font-size: 1.25rem; color: var(--orange-700);">Activation Failed</h3>' +
            '<p class="muted small" style="margin-top: 4px;">' + escapeH(err.message) + '</p>' +
            '<button class="btn btn-orange mt-3" id="sim-pay-err-close">Close</button>';
          loader.querySelector("#sim-pay-err-close").addEventListener("click", function () {
            m.remove();
          });
        }
      });
    });

    payFailBtn.addEventListener("click", function () {
      showLoader([
        { text: "Connecting to bank processor...", delay: 1000 },
        { text: "Payment rejected: Insufficient credit balance or sandbox simulation rule triggered.", isError: true }
      ], function () {});
    });
  }


  function alertModal(title, html, actions) {
    const m = document.createElement("div");
    m.className = "modal-overlay open";
    let btns = "";
    (actions || []).forEach(function (a) {
      btns += '<a class="btn btn-orange" href="' + a.href + '">' + a.label + "</a>";
    });
    m.innerHTML =
      '<div class="modal"><button class="close" data-x aria-label="Close">✕</button>' +
      '<h2>' + title + '</h2><p class="small muted mt-1">' + html + "</p>" +
      (btns ? '<div class="flex mt-3">' + btns + "</div>" : "") +
      "</div>";
    document.body.appendChild(m);
    m.addEventListener("click", function (e) {
      if (e.target === m || e.target.closest("[data-x]")) m.remove();
    });
  }
  PC.alertModal = alertModal;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[src="' + src + '"]')) return resolve();
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error("Could not load " + src)); };
      document.head.appendChild(s);
    });
  }

  function escapeH(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  }
  PC.esc = escapeH;

  /* ---------------- session-aware nav ---------------- */
  function renderSessionUi(user) {
    const cta = document.querySelector(".nav-cta");
    if (!cta || !user) return;
    const roleLabel =
      user.role === "hr_admin" ? "Admin" :
      user.role === "super_admin" ? "Super Admin" :
      user.role === "auditor" ? "Auditor" : "Employee";
    cta.innerHTML =
      '<span class="small" style="color:var(--ink-2);white-space:nowrap">' +
      escapeH(user.name.split(" ")[0]) + " · " + roleLabel + "</span>" +
      '<a class="btn btn-ghost btn-sm" href="' + PC.roleHome(user.role) + '">My Dashboard</a>' +
      '<button class="btn btn-orange btn-sm" data-logout>Logout</button>';
  }
  PC.renderSessionUi = renderSessionUi;

  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-logout]")) { e.preventDefault(); PC.logout(); }
    if (e.target.closest("[data-login]")) { e.preventDefault(); PC.openAuth("login"); }
    if (e.target.closest("[data-register]")) { e.preventDefault(); PC.openAuth("register"); }
  });

  document.addEventListener("DOMContentLoaded", function () {
    PC.me().then(renderSessionUi);
  });
})();
