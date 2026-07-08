/* POSH Compass backend — accounts & sessions.
   Passwords: scrypt + per-user salt. Sessions: random token in an
   httpOnly cookie (pcsid), 30-day expiry. */
"use strict";

const crypto = require("crypto");
const { load, save, id, now } = require("./db");

const SESSION_DAYS = 30;

/* ---------- password hashing ---------- */
function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return { salt, hash };
}
function checkPassword(password, salt, hash) {
  const candidate = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(hash));
}

/* ---------- org code ---------- */
function makeOrgCode() {
  return "PC-" + crypto.randomBytes(3).toString("hex").toUpperCase();
}

/* ---------- sessions ---------- */
function createSession(userId) {
  const db = load();
  const token = crypto.randomBytes(32).toString("hex");
  db.sessions.push({
    token,
    userId,
    createdAt: now(),
    expiresAt: new Date(Date.now() + SESSION_DAYS * 864e5).toISOString(),
  });
  save();
  return token;
}

function destroySession(token) {
  const db = load();
  db.sessions = db.sessions.filter((s) => s.token !== token);
  save();
}

function sessionUser(req) {
  const cookies = parseCookies(req);
  const token = cookies.pcsid;
  if (!token) return null;
  const db = load();
  const sess = db.sessions.find((s) => s.token === token);
  if (!sess) return null;
  if (new Date(sess.expiresAt) < new Date()) {
    destroySession(token);
    return null;
  }
  return db.users.find((u) => u.id === sess.userId) || null;
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || "";
  raw.split(";").forEach((pair) => {
    const i = pair.indexOf("=");
    if (i > -1) out[pair.slice(0, i).trim()] = decodeURIComponent(pair.slice(i + 1).trim());
  });
  return out;
}

function sessionCookie(token) {
  return (
    "pcsid=" + token + "; HttpOnly; Path=/; SameSite=Lax; Max-Age=" + SESSION_DAYS * 86400
  );
}
function clearCookie() {
  return "pcsid=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0";
}

/* ---------- public shapes (never expose hashes) ---------- */
function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, orgId: u.orgId };
}
function publicOrg(o) {
  if (!o) return null;
  return {
    id: o.id, name: o.name, employees: o.employees, orgCode: o.orgCode,
    paid: !!o.paid, paidAt: o.paidAt || null, createdAt: o.createdAt,
  };
}

/* ---------- handlers ---------- */
function registerOrg(body) {
  const db = load();
  const { orgName, employees, name, email, password } = body || {};
  if (!orgName || !name || !email || !password) throw httpError(400, "All fields are required.");
  if (String(password).length < 6) throw httpError(400, "Password must be at least 6 characters.");
  const headcount = Math.max(1, Math.min(100000, parseInt(employees, 10) || 0));
  if (!headcount) throw httpError(400, "Employee count is required.");
  if (db.users.some((u) => u.email.toLowerCase() === String(email).toLowerCase()))
    throw httpError(409, "An account with this email already exists.");

  const org = {
    id: id("org"), name: String(orgName).trim(), employees: headcount,
    orgCode: makeOrgCode(), paid: false, createdAt: now(),
  };
  const { salt, hash } = hashPassword(password);
  const user = {
    id: id("usr"), orgId: org.id, name: String(name).trim(),
    email: String(email).trim(), passSalt: salt, passHash: hash,
    role: "admin", createdAt: now(),
  };
  org.adminUserId = user.id;
  db.orgs.push(org);
  db.users.push(user);
  save();
  return { user, org };
}

function joinOrg(body) {
  const db = load();
  const { orgCode, name, email, password } = body || {};
  if (!orgCode || !name || !email || !password) throw httpError(400, "All fields are required.");
  if (String(password).length < 6) throw httpError(400, "Password must be at least 6 characters.");
  const org = db.orgs.find((o) => o.orgCode.toUpperCase() === String(orgCode).trim().toUpperCase());
  if (!org) throw httpError(404, "No organisation found for that code.");
  if (db.users.some((u) => u.email.toLowerCase() === String(email).toLowerCase()))
    throw httpError(409, "An account with this email already exists.");
  const { salt, hash } = hashPassword(password);
  const user = {
    id: id("usr"), orgId: org.id, name: String(name).trim(),
    email: String(email).trim(), passSalt: salt, passHash: hash,
    role: "employee", createdAt: now(),
  };
  db.users.push(user);
  save();
  return { user, org };
}

function login(body) {
  const db = load();
  const { email, password } = body || {};
  const user = db.users.find((u) => u.email.toLowerCase() === String(email || "").toLowerCase());
  if (!user || !checkPassword(password || "", user.passSalt, user.passHash))
    throw httpError(401, "Invalid email or password.");
  const org = db.orgs.find((o) => o.id === user.orgId);
  return { user, org };
}

function orgOf(user) {
  const db = load();
  return db.orgs.find((o) => o.id === user.orgId) || null;
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

module.exports = {
  registerOrg, joinOrg, login, orgOf,
  createSession, destroySession, sessionUser,
  sessionCookie, clearCookie, publicUser, publicOrg, httpError,
};
