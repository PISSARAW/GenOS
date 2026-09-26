'use strict';

async function createRuntimeDb() {
  try {
    return await openNative();
  } catch (_) {
    return openShim();
  }
}

async function openNative() {
  const sqlite3 = require('sqlite3').verbose();
  const { open } = require('sqlite');
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  return { db, driver: 'sqlite3', close: closeDb(db) };
}

function openShim() {
  const { DatabaseSync } = require('node:sqlite');
  const native = new DatabaseSync(':memory:');
  const db = {
    get: (sql, ...rest) => native.prepare(sql).get(...spreadParams(rest)),
    all: (sql, ...rest) => native.prepare(sql).all(...spreadParams(rest)),
    run: (sql, ...rest) => toRunResult(native.prepare(sql).run(...spreadParams(rest))),
    exec: (sql) => native.exec(sql)
  };
  return { db, driver: 'node-sqlite-shim', close: closeNative(native) };
}

function spreadParams(rest) {
  if (rest.length === 1 && Array.isArray(rest[0])) return rest[0];
  return rest;
}

function toRunResult(raw) {
  return { lastID: toNumber(raw.lastInsertRowid), changes: toNumber(raw.changes) };
}

function toNumber(value) {
  return typeof value === 'bigint' ? Number(value) : value;
}

function closeDb(db) {
  return async () => { await db.close(); };
}

function closeNative(native) {
  return async () => { native.close(); };
}

module.exports = { createRuntimeDb };
