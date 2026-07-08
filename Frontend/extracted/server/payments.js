/* POSH Compass backend — payment gateway.
   Razorpay when API keys are configured (server/config.json or env vars
   RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET); otherwise a clearly-labelled
   TEST MODE that exercises the identical order→verify flow so the whole
   product works end-to-end before keys exist.

   The amount is always computed server-side from the org's headcount —
   the client never chooses what it pays. */
"use strict";

const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { load, save, id, now } = require("./db");
const { httpError } = require("./auth");

/* Pricing tiers — single source of truth for what an org pays */
const TIERS = [
  { max: 30, rate: 48 },
  { max: 100, rate: 36 },
  { max: 200, rate: 24 },
  { max: Infinity, rate: 12 },
];
function rateFor(n) {
  for (const t of TIERS) if (n <= t.max) return t.rate;
  return 12;
}
function amountFor(org) {
  return rateFor(org.employees) * org.employees; // INR
}

function config() {
  let cfg = {};
  try {
    cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
  } catch (e) { /* no config file — env vars or test mode */ }
  const keyId = process.env.RAZORPAY_KEY_ID || cfg.razorpayKeyId || "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET || cfg.razorpayKeySecret || "";
  return { keyId, keySecret, live: !!(keyId && keySecret) };
}

/* ---------- Razorpay REST (no SDK needed) ---------- */
function razorpayCreateOrder(keyId, keySecret, amountPaise, receipt) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      amount: amountPaise, currency: "INR", receipt, payment_capture: 1,
    });
    const req = https.request(
      {
        hostname: "api.razorpay.com",
        path: "/v1/orders",
        method: "POST",
        auth: keyId + ":" + keySecret,
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            const json = JSON.parse(body);
            if (res.statusCode >= 200 && res.statusCode < 300) resolve(json);
            else reject(httpError(502, "Razorpay: " + (json.error ? json.error.description : body)));
          } catch (e) { reject(httpError(502, "Razorpay returned an unreadable response.")); }
        });
      }
    );
    req.on("error", (e) => reject(httpError(502, "Could not reach Razorpay: " + e.message)));
    req.write(payload);
    req.end();
  });
}

/* ---------- handlers ---------- */
async function createOrder(user, org) {
  if (user.role !== "admin") throw httpError(403, "Only the organisation admin can make the payment.");
  if (org.paid) throw httpError(409, "This organisation has already paid.");

  const amount = amountFor(org);
  const cfg = config();
  const db = load();

  if (cfg.live) {
    const rzpOrder = await razorpayCreateOrder(cfg.keyId, cfg.keySecret, amount * 100, org.id);
    const payment = {
      id: id("pay"), orgId: org.id, mode: "razorpay",
      orderId: rzpOrder.id, amount, currency: "INR",
      rate: rateFor(org.employees), employees: org.employees,
      status: "created", createdAt: now(),
    };
    db.payments.push(payment);
    save();
    return {
      mode: "razorpay", keyId: cfg.keyId,
      order: { id: rzpOrder.id, amount: amount * 100, currency: "INR" },
      display: { amount, rate: rateFor(org.employees), employees: org.employees, orgName: org.name },
    };
  }

  // TEST MODE — no gateway keys configured
  const payment = {
    id: id("pay"), orgId: org.id, mode: "test",
    orderId: "test_order_" + crypto.randomBytes(8).toString("hex"),
    amount, currency: "INR",
    rate: rateFor(org.employees), employees: org.employees,
    status: "created", createdAt: now(),
  };
  db.payments.push(payment);
  save();
  return {
    mode: "test",
    order: { id: payment.orderId, amount: amount * 100, currency: "INR" },
    display: { amount, rate: rateFor(org.employees), employees: org.employees, orgName: org.name },
  };
}

function verifyPayment(user, org, body) {
  const db = load();
  const { orderId, paymentId, signature } = body || {};
  const payment = db.payments.find((p) => p.orderId === orderId && p.orgId === org.id);
  if (!payment) throw httpError(404, "Order not found.");
  if (payment.status === "paid") return { paid: true, alreadyVerified: true };

  if (payment.mode === "razorpay") {
    const cfg = config();
    if (!cfg.live) throw httpError(500, "Gateway keys are no longer configured.");
    const expected = crypto
      .createHmac("sha256", cfg.keySecret)
      .update(orderId + "|" + paymentId)
      .digest("hex");
    if (expected !== signature) throw httpError(400, "Payment signature verification failed.");
    payment.paymentId = paymentId;
  } else {
    // TEST MODE: mark the simulated payment as captured
    payment.paymentId = "test_pay_" + crypto.randomBytes(8).toString("hex");
  }

  payment.status = "paid";
  payment.paidAt = now();
  const theOrg = db.orgs.find((o) => o.id === org.id);
  theOrg.paid = true;
  theOrg.paidAt = payment.paidAt;
  theOrg.paymentRef = payment.paymentId;
  save();
  return {
    paid: true,
    mode: payment.mode,
    receipt: {
      orgName: theOrg.name,
      amount: payment.amount,
      rate: payment.rate,
      employees: payment.employees,
      paymentId: payment.paymentId,
      paidAt: payment.paidAt,
      auditLogRef: "AUD-LOG-" + payment.paidAt.slice(0, 4) + "-" +
        crypto.createHash("sha256").update(payment.paymentId).digest("hex").slice(0, 8).toUpperCase(),
    },
  };
}

module.exports = { createOrder, verifyPayment, amountFor, rateFor, config };
