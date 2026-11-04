'use strict';

const { digest } = require('../../relationalPhysiology');
const integrity = require('../../qualityElevation/qualityReceiptIntegrity');
const { fail } = require('./teamRelationalPolicy');

async function ensure(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS ateam_relational_admissions (
    receipt_id TEXT PRIMARY KEY, team_run_id TEXT NOT NULL, handoff_id TEXT NOT NULL,
    handoff_digest TEXT NOT NULL, dispatch_epoch TEXT NOT NULL, body_json TEXT NOT NULL,
    UNIQUE(team_run_id,handoff_id,handoff_digest,dispatch_epoch));
    CREATE TABLE IF NOT EXISTS ateam_relational_consumptions (
    receipt_id TEXT PRIMARY KEY, consumer_run_id TEXT NOT NULL, body_json TEXT NOT NULL);`);
}

function verified(body) {
  if (!integrity.authenticated(body) || body.schema !== 'genos.ateam-rpe-admission/v1') {
    throw fail('ATEAM_RPE_RECEIPT_INVALID');
  }
  return body;
}

async function read(db, identity) {
  await ensure(db);
  const row = await db.get(`SELECT body_json FROM ateam_relational_admissions
    WHERE team_run_id=? AND handoff_id=? AND handoff_digest=? AND dispatch_epoch=?`,
  identity.teamRunId, identity.handoffId, identity.handoffDigest, identity.dispatchEpoch);
  return row ? verified(JSON.parse(row.body_json)) : null;
}

async function put(db, body) {
  await ensure(db);
  const signed = integrity.sign(body);
  await db.run(`INSERT OR IGNORE INTO ateam_relational_admissions
    (receipt_id,team_run_id,handoff_id,handoff_digest,dispatch_epoch,body_json) VALUES(?,?,?,?,?,?)`,
  body.receiptId, body.teamRunId, body.handoffId, body.handoffDigest, body.dispatchEpoch, JSON.stringify(signed));
  const stored = await read(db, body);
  if (!stored || digest(stored) !== digest(signed)) throw fail('ATEAM_RPE_RECEIPT_CONFLICT');
  return stored;
}

async function readRef(db, receiptId) {
  await ensure(db);
  const row = await db.get('SELECT body_json FROM ateam_relational_admissions WHERE receipt_id=?', receiptId);
  if (!row) throw fail('ATEAM_RPE_RECEIPT_MISSING');
  return verified(JSON.parse(row.body_json));
}

async function consume(db, body) {
  await ensure(db);
  const prior = await db.get('SELECT body_json FROM ateam_relational_consumptions WHERE receipt_id=?', body.receiptId);
  if (prior) {
    const value = JSON.parse(prior.body_json);
    if (!integrity.authenticated(value) || value.consumerRunId !== body.consumerRunId
      || value.messageDigest !== body.messageDigest) throw fail('ATEAM_RPE_RECEIPT_REPLAY');
    return value;
  }
  const signed = integrity.sign({ schema: 'genos.ateam-rpe-consumption/v1', ...body });
  await db.run('INSERT INTO ateam_relational_consumptions(receipt_id,consumer_run_id,body_json) VALUES(?,?,?)',
    body.receiptId, body.consumerRunId, JSON.stringify(signed));
  return signed;
}

module.exports = { ensure, read, readRef, put, consume, verified };
