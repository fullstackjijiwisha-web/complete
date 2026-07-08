/* POSH Compass backend — JSON-file data store.
   Zero dependencies: the whole DB lives in data/db.json and is written
   atomically on every change. Swap this module for Postgres/Mongo later
   without touching the route handlers. */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "..", "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

const EMPTY = { orgs: [], users: [], sessions: [], attempts: [], payments: [] };

let db = null;

function load() {
  if (db) return db;
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    for (const k of Object.keys(EMPTY)) if (!Array.isArray(db[k])) db[k] = [];
  } catch (e) {
    db = JSON.parse(JSON.stringify(EMPTY));
  }
  return db;
}

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

function id(prefix) {
  return prefix + "_" + crypto.randomBytes(8).toString("hex");
}

function now() {
  return new Date().toISOString();
}

module.exports = { load, save, id, now };
