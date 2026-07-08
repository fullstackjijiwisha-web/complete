/* POSH Compass — shared behaviour: nav, footer, modal, counters, reveal */
(function () {
  "use strict";

  const PC = (window.PC = window.PC || {});
  // When POSH Compass is served from inside the main website (a /posh-compass/
  // folder in its docroot), "back to Jijiwisha Society" must return to THAT
  // site's homepage. Only the standalone deployment links out to the live site.
  const UNDER_MAIN_SITE = /\/posh-compass\//i.test(window.location.pathname);
  const MAIN_SITE_URL = UNDER_MAIN_SITE ? "../" : "https://www.jijiwishasociety.org/";
  const MAIN_SITE_TARGET = UNDER_MAIN_SITE ? "" : ' target="_blank" rel="noopener noreferrer"';

  /* ---------- Brand mark ---------- */
  PC.logoMark = function (size) {
    size = size || 34;
    return (
      '<svg class="mark" width="' + size + '" height="' + size + '" viewBox="0 0 40 40" aria-hidden="true">' +
      '<circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" stroke-width="2.4"/>' +
      '<path d="M20 3.5 L23.8 16.2 L36.5 20 L23.8 23.8 L20 36.5 L16.2 23.8 L3.5 20 L16.2 16.2 Z" fill="#e8720c"/>' +
      '<circle cx="20" cy="20" r="2.6" fill="currentColor"/>' +
      "</svg>"
    );
  };

  PC.brand = function (href, onDark) {
    return (
      '<a class="brand" href="' + (href || "index.html") + '" style="color:' +
      (onDark ? "#ffffff" : "var(--green-900)") + '">' +
      PC.logoMark(36) +
      '<span><span class="wordmark"' + (onDark ? ' style="color:#fff"' : "") + '>posh <em>c</em>ompass</span>' +
      '<span class="tag">Assess · Prove · Get Certified</span></span></a>'
    );
  };

  /* ---------- Icons (inline SVG, stroke = currentColor) ---------- */
  const IC = {
    shield: '<path d="M12 2l8 3v6c0 5-3.4 8.6-8 11-4.6-2.4-8-6-8-11V5z"/>',
    check: '<path d="M4 12l5 5L20 6"/>',
    shieldCheck: '<path d="M12 2l8 3v6c0 5-3.4 8.6-8 11-4.6-2.4-8-6-8-11V5z"/><path d="M8.5 12l2.5 2.5L15.5 9.5"/>',
    doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 13h6M10 17h6"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20c.5-3.5 2.8-5.5 5.5-5.5S14 16.5 14.5 20"/><circle cx="17" cy="9" r="2.4"/><path d="M15.8 14.7c2.4.2 4.2 2 4.7 4.8"/>',
    building: '<path d="M4 21V5l7-2.5V21M11 21h9V9l-5-1.8"/><path d="M6.7 8h1.6M6.7 12h1.6M6.7 16h1.6M14.5 12h1.6M14.5 16h1.6"/>',
    ribbon: '<circle cx="12" cy="9" r="5.5"/><path d="M8.5 13.5L7 21l5-2.6L17 21l-1.5-7.5"/>',
    calendar: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>',
    gauge: '<path d="M4 18a8.5 8.5 0 1 1 16 0"/><path d="M12 15l4-5.5"/><circle cx="12" cy="15" r="1.6"/>',
    scale: '<path d="M12 4v16M6 20h12"/><path d="M12 6l-6 2 6 2M12 6l6 2-6 2" fill="none"/><path d="M3.5 13a2.6 2.6 0 0 0 5 0L6 8zM15.5 13a2.6 2.6 0 0 0 5 0L18 8z"/>',
    lock: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    warn: '<path d="M12 3.5L22 20H2z"/><path d="M12 10v4.5M12 17.4v.2"/>',
    trend: '<path d="M3.5 17.5l5-5 3.5 3.5 8-8.5"/><path d="M15 7.5h5v5"/>',
    compassPts: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2.2 5-5 2.2 2.2-5z"/>',
    download: '<path d="M12 4v11M7.5 11l4.5 4.5L16.5 11"/><path d="M4.5 19.5h15"/>',
    clipboard: '<rect x="5.5" y="4.5" width="13" height="17" rx="2"/><path d="M9 4.5a3 3 0 0 1 6 0"/><path d="M9 11h6M9 15h6"/>',
    play: '<circle cx="12" cy="12" r="9"/><path d="M10 8.7l5 3.3-5 3.3z"/>',
    arrow: '<path d="M4.5 12h15M13.5 6l6 6-6 6"/>',
  };
  PC.icon = function (name, size, color) {
    return (
      '<svg width="' + (size || 22) + '" height="' + (size || 22) + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="' + (color || "currentColor") + '" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (IC[name] || IC.shield) + "</svg>"
    );
  };

  /* ---------- Top navigation ---------- */
  const NAV_LINKS = [
    ["index.html", "Home"],
    ["how-it-works.html", "How It Works"],
    ["assessment.html", "Assessment"],
    ["pricing.html", "Pricing"],
    ["audit.html", "Audit"],
  ];

  function renderNav() {
    const host = document.getElementById("topnav");
    if (!host) return;
    const page = document.body.dataset.page || "";
    let links = "";
    NAV_LINKS.forEach(function (l) {
      links +=
        '<a href="' + l[0] + '"' + (page === l[0] ? ' class="active" aria-current="page"' : "") + ">" + l[1] + "</a>";
    });
    links +=
      '<div class="nav-dropdown"><a href="dashboard.html">Dashboards</a>' +
      '<div class="nav-dropdown-menu">' +
      '<a href="dashboard.html"><strong>Organisation Admin</strong><span>Readiness, risk &amp; audit status</span></a>' +
      '<a href="employee.html"><strong>Employee View</strong><span>Scores, history &amp; certificate</span></a>' +
      "</div></div>";

    host.className = "topnav";
    host.innerHTML =
      '<div class="container topnav-inner">' +
      PC.brand() +
      '<button class="nav-toggle" aria-label="Toggle menu">☰ Menu</button>' +
      '<nav class="nav-links" aria-label="Main">' +
      '<a href="' + MAIN_SITE_URL + '"' + MAIN_SITE_TARGET + '>Jijiwisha Society</a>' +
      links + "</nav>" +
      '<div class="nav-cta">' +
      '<a class="btn btn-ghost btn-sm" href="' + MAIN_SITE_URL + '"' + MAIN_SITE_TARGET + '>Main Website</a>' +
      '<button class="btn btn-ghost btn-sm" data-login>Login</button>' +
      '<button class="btn btn-orange btn-sm" data-register>Register Organisation</button>' +
      "</div></div>";

    host.querySelector(".nav-toggle").addEventListener("click", function () {
      host.classList.toggle("open");
    });
  }

  /* ---------- Footer ---------- */
  function renderFooter() {
    const host = document.getElementById("footer");
    if (!host) return;
    host.className = "site-footer";
    host.innerHTML =
      '<div class="container">' +
      '<div class="footer-grid">' +
      "<div>" + PC.brand("index.html", true) +
      '<p class="small mt-2" style="max-width:34ch">A digital platform that assesses real understanding of the POSH Act — and generates the audit-ready evidence the NCW expects.</p></div>' +
      "<div><h4>Platform</h4><ul>" +
      '<li><a href="how-it-works.html">How It Works</a></li>' +
      '<li><a href="assessment.html">Assessment Engine</a></li>' +
      '<li><a href="pricing.html">Pricing</a></li>' +
      '<li><a href="audit.html">Audit &amp; Compliance</a></li>' +
      "</ul></div>" +
      "<div><h4>Dashboards</h4><ul>" +
      '<li><a href="dashboard.html">Organisation Admin</a></li>' +
      '<li><a href="employee.html">Employee View</a></li>' +
      "</ul></div>" +
      "<div><h4>Compliance</h4><ul>" +
      "<li>POSH Act, 2013</li>" +
      "<li>NCW Guidelines</li>" +
      '<li>Audits by <a href="' + MAIN_SITE_URL + '"' + MAIN_SITE_TARGET + ">Jijiwisha Society</a></li>" +
      "</ul></div>" +
      "</div>" +
      '<div class="footer-note"><span>© ' + new Date().getFullYear() +
      " POSH Compass · Audits conducted with Jijiwisha Society</span>" +
      "<span>Every submission is timestamped and audit-logged.</span></div>" +
      "</div>";
  }

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    document.querySelectorAll(".modal-overlay.open").forEach(function (m) { m.classList.remove("open"); });
  });

  /* ---------- Pricing logic (single source of truth) ---------- */
  PC.TIERS = [
    { max: 30, rate: 48, label: "Up to 30 employees" },
    { max: 100, rate: 36, label: "31 – 100 employees" },
    { max: 200, rate: 24, label: "101 – 200 employees" },
    { max: Infinity, rate: 12, label: "201+ employees" },
  ];
  PC.rateFor = function (n) {
    for (let i = 0; i < PC.TIERS.length; i++) if (n <= PC.TIERS[i].max) return PC.TIERS[i].rate;
    return 12;
  };
  PC.inr = function (n) { return "₹" + n.toLocaleString("en-IN"); };

  /* ---------- Deterministic short hash for evidence refs ---------- */
  function hash(str) {
    let h = 5381;
    str = String(str);
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return h.toString(16).toUpperCase().slice(0, 8);
  }
  PC.hash = hash;

  /* ---------- Count-up ---------- */
  function countUp(el) {
    const target = parseFloat(el.dataset.count);
    const suffix = el.dataset.suffix || "";
    const decimals = el.dataset.count.indexOf(".") > -1 ? 1 : 0;
    const dur = 1200;
    const t0 = performance.now();
    function frame(t) {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = (target * eased).toLocaleString("en-IN", { maximumFractionDigits: decimals, minimumFractionDigits: decimals }) + suffix;
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ---------- Init ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    renderNav();
    renderFooter();

    document.querySelectorAll("[data-icon]").forEach(function (el) {
      el.innerHTML = PC.icon(el.dataset.icon, el.dataset.size || 22, el.dataset.color || "currentColor");
    });

    const io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          en.target.classList.add("in");
          if (en.target.dataset.count) countUp(en.target);
          io.unobserve(en.target);
        });
      },
      { threshold: 0.25 }
    );
    document.querySelectorAll(".reveal, [data-count]").forEach(function (el) { io.observe(el); });
  });

  /* ---------- Shared chart helpers (SVG, no libraries) ---------- */
  PC.tooltip = (function () {
    let tip = null;
    function ensure(host) {
      if (!tip || !host.contains(tip)) {
        tip = document.createElement("div");
        tip.className = "viz-tooltip";
        host.appendChild(tip);
      }
      return tip;
    }
    return {
      show: function (host, html, x, y) {
        const t = ensure(host);
        t.innerHTML = html;
        t.style.opacity = "1";
        const hw = host.getBoundingClientRect().width;
        const tw = t.offsetWidth;
        let left = x + 14;
        if (left + tw > hw - 4) left = x - tw - 14;
        t.style.left = Math.max(4, left) + "px";
        t.style.top = Math.max(0, y - t.offsetHeight - 10) + "px";
      },
      hide: function () { if (tip) tip.style.opacity = "0"; },
    };
  })();
})();
