/* POSH Compass backend — HTTP server.
   Serves the static site AND the JSON API from one process, zero npm
   dependencies. Run:  node server/server.js   →  http://localhost:3000

   API surface
   ───────────
   POST /api/auth/register-org   {orgName, employees, name, email, password}
   POST /api/auth/join           {orgCode, name, email, password}
   POST /api/auth/login          {email, password}
   POST /api/auth/logout
   GET  /api/auth/me
   GET  /api/formats
   GET  /api/questions?format=mcq          (402 until the org has paid)
   POST /api/attempts            {format, answers[], durationSeconds, trace[]}
   GET  /api/attempts/mine
   GET  /api/org/summary                    (admin)
   GET  /api/org/employees                  (admin)
   POST /api/payments/order                 (admin)
   POST /api/payments/verify     {orderId, paymentId?, signature?}
   GET  /api/health
*/
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const auth = require("./auth");
const questions = require("./questions");
const payments = require("./payments");
const summary = require("./summary");

const PORT = parseInt(process.env.PORT, 10) || 3000;
const STATIC_ROOT = path.join(__dirname, "..");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".ico": "image/x-icon",
};

/* ---------- helpers ---------- */
function sendJson(res, status, data, extraHeaders) {
  const body = JSON.stringify(data);
  res.writeHead(status, Object.assign({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  }, extraHeaders || {}));
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > 256 * 1024) { reject(auth.httpError(413, "Request too large.")); req.destroy(); }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); }
      catch (e) { reject(auth.httpError(400, "Invalid JSON body.")); }
    });
  });
}

function requireUser(req) {
  const user = auth.sessionUser(req);
  if (!user) throw auth.httpError(401, "Sign in to continue.");
  return user;
}
function requireAdmin(req) {
  const user = requireUser(req);
  if (user.role !== "admin") throw auth.httpError(403, "Organisation admin access required.");
  return user;
}

/* ---------- API router ---------- */
async function handleApi(req, res, urlPath, query) {
  const route = req.method + " " + urlPath;

  switch (route) {
    case "GET /api/health":
      return sendJson(res, 200, { ok: true, gateway: payments.config().live ? "razorpay" : "test-mode" });

    /* ----- auth ----- */
    case "POST /api/auth/register-org": {
      const body = await readBody(req);
      const { user, org } = auth.registerOrg(body);
      const token = auth.createSession(user.id);
      return sendJson(res, 201, { user: auth.publicUser(user), org: auth.publicOrg(org) },
        { "Set-Cookie": auth.sessionCookie(token) });
    }
    case "POST /api/auth/join": {
      const body = await readBody(req);
      const { user, org } = auth.joinOrg(body);
      const token = auth.createSession(user.id);
      return sendJson(res, 201, { user: auth.publicUser(user), org: auth.publicOrg(org) },
        { "Set-Cookie": auth.sessionCookie(token) });
    }
    case "POST /api/auth/login": {
      const body = await readBody(req);
      const { user, org } = auth.login(body);
      const token = auth.createSession(user.id);
      return sendJson(res, 200, { user: auth.publicUser(user), org: auth.publicOrg(org) },
        { "Set-Cookie": auth.sessionCookie(token) });
    }
    case "POST /api/auth/logout": {
      const cookies = (req.headers.cookie || "").match(/pcsid=([a-f0-9]+)/);
      if (cookies) auth.destroySession(cookies[1]);
      return sendJson(res, 200, { ok: true }, { "Set-Cookie": auth.clearCookie() });
    }
    case "GET /api/auth/me": {
      const user = requireUser(req);
      return sendJson(res, 200, { user: auth.publicUser(user), org: auth.publicOrg(auth.orgOf(user)) });
    }

    /* ----- formats & questions ----- */
    case "GET /api/formats":
      return sendJson(res, 200, { formats: questions.listFormats() });

    case "GET /api/questions": {
      const user = requireUser(req);
      const org = auth.orgOf(user);
      const format = query.get("format") || "mcq";
      const fmt = questions.listFormats().find((f) => f.id === format);
      if (fmt && fmt.status !== "live")
        return sendJson(res, 200, questions.publicQuestions(format));
      if (!org || !org.paid)
        throw auth.httpError(402, user.role === "admin"
          ? "Payment required — complete your organisation's payment to unlock assessments."
          : "Payment pending — ask your organisation admin to complete the payment.");
      return sendJson(res, 200, questions.publicQuestions(format));
    }

    /* ----- attempts ----- */
    case "POST /api/attempts": {
      const user = requireUser(req);
      const org = auth.orgOf(user);
      if (!org || !org.paid) throw auth.httpError(402, "Payment required before submitting attempts.");
      const body = await readBody(req);
      return sendJson(res, 201, questions.scoreAttempt(user, body));
    }
    case "GET /api/attempts/mine": {
      const user = requireUser(req);
      const org = auth.orgOf(user);
      return sendJson(res, 200, summary.employeeSummary(user, org));
    }

    /* ----- org / dashboards ----- */
    case "GET /api/org/summary": {
      const user = requireAdmin(req);
      return sendJson(res, 200, summary.orgSummary(auth.orgOf(user)));
    }
    case "GET /api/org/employees": {
      const user = requireAdmin(req);
      return sendJson(res, 200, { employees: summary.orgEmployees(auth.orgOf(user)) });
    }

    /* ----- payments ----- */
    case "POST /api/payments/order": {
      const user = requireAdmin(req);
      const org = auth.orgOf(user);
      return sendJson(res, 201, await payments.createOrder(user, org));
    }
    case "POST /api/payments/verify": {
      const user = requireUser(req);
      const org = auth.orgOf(user);
      const body = await readBody(req);
      return sendJson(res, 200, payments.verifyPayment(user, org, body));
    }

    default:
      throw auth.httpError(404, "No such API endpoint.");
  }
}

/* ---------- static files ---------- */
function serveStatic(req, res, urlPath) {
  if (urlPath.endsWith("/")) urlPath += "index.html";
  const file = path.normalize(path.join(STATIC_ROOT, urlPath));
  if (!file.startsWith(path.normalize(STATIC_ROOT)) ||
      file.includes(path.sep + "server" + path.sep) ||
      file.includes(path.sep + "data" + path.sep)) {
    res.writeHead(403); res.end("Forbidden"); return;
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain" }); res.end("404 Not Found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" });
    res.end(data);
  });
}

/* ---------- server ---------- */
http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  const urlPath = decodeURIComponent(u.pathname);
  try {
    if (urlPath.startsWith("/api/")) await handleApi(req, res, urlPath, u.searchParams);
    else serveStatic(req, res, urlPath);
  } catch (e) {
    sendJson(res, e.status || 500, { error: e.message || "Server error." });
    if (!e.status) console.error(e);
  }
}).listen(PORT, () => {
  const gw = payments.config().live ? "Razorpay (live keys configured)" : "TEST MODE (no gateway keys)";
  console.log("POSH Compass backend on http://localhost:" + PORT + "  ·  payments: " + gw);
});
