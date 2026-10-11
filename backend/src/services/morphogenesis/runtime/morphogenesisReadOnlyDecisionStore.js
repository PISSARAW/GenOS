'use strict';

const crypto = require('node:crypto');
const { requestFor, verifyResponse } = require('./morphogenesisRustReadOnlyBridge');

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function ensureTable(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS morphogenesis_read_only_decisions (
    id TEXT PRIMARY KEY, mission_id TEXT NOT NULL, graph_id TEXT NOT NULL,
    graph_version INTEGER NOT NULL, snapshot_sha256 TEXT NOT NULL,
    proposal_id TEXT NOT NULL, request_sha256 TEXT NOT NULL,
    response_json TEXT NOT NULL, response_sha256 TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TRIGGER IF NOT EXISTS morphogenesis_read_only_decisions_no_update
    BEFORE UPDATE ON morphogenesis_read_only_decisions
    BEGIN SELECT RAISE(ABORT, 'read-only morphogenesis decision is immutable'); END;
  CREATE TRIGGER IF NOT EXISTS morphogenesis_read_only_decisions_no_delete
    BEFORE DELETE ON morphogenesis_read_only_decisions
    BEGIN SELECT RAISE(ABORT, 'read-only morphogenesis decision is immutable'); END;`);
}

function payloadFor(input) {
  return JSON.stringify(requestFor(input.morphology, input.missionId,
    { ...input.record, snapshotRef: input.snapshotRef }));
}

async function recordReadOnlyDecision(input) {
  const { db, missionId, snapshotRef, record, decision } = input;
  if (!db || !record?.id || snapshotRef?.missionId !== missionId || decision?.available !== true) {
    throw new Error('Persisted proposal, snapshot and Rust decision are required');
  }
  const payload = payloadFor(input);
  verifyResponse(decision, payload);
  await ensureTable(db);
  const id = crypto.randomUUID();
  const responseJson = JSON.stringify(decision);
  await db.run(`INSERT INTO morphogenesis_read_only_decisions
    (id, mission_id, graph_id, graph_version, snapshot_sha256, proposal_id,
      request_sha256, response_json, response_sha256, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, missionId, snapshotRef.graphId,
  snapshotRef.graphVersion, snapshotRef.snapshotSha256, record.id,
  decision.requestSha256, responseJson, digest(responseJson), new Date().toISOString());
  const stored = await readReadOnlyDecision({ ...input, id });
  if (!stored) throw new Error('Rust decision receipt could not be verified after persistence');
  return stored;
}

async function readReadOnlyDecision(input) {
  const { db, id, missionId, morphology, snapshotRef } = input;
  if (!db || !id || snapshotRef?.missionId !== missionId) return null;
  const row = await db.get(`SELECT * FROM morphogenesis_read_only_decisions
    WHERE id = ? AND mission_id = ? AND graph_id = ? AND graph_version = ? AND snapshot_sha256 = ?`,
  id, missionId, snapshotRef.graphId, snapshotRef.graphVersion, snapshotRef.snapshotSha256);
  if (!row || row.response_sha256 !== digest(row.response_json)) return null;
  const source = require('./morphogenesisPersistedReadOnlyService');
  const record = await source.readPersistedProposals(db, snapshotRef, row.proposal_id);
  if (!record || !await source.readBoundSnapshot(db, snapshotRef, morphology)) return null;
  try {
    const response = JSON.parse(row.response_json);
    const verified = verifyResponse(response, payloadFor({ missionId, morphology,
      snapshotRef, record }));
    if (verified.requestSha256 !== row.request_sha256) return null;
    return { id: row.id, proposalRecordId: row.proposal_id, decision: verified.decision,
      requestSha256: row.request_sha256, responseSha256: row.response_sha256,
      committed: false, commitAuthorized: false };
  } catch (_) {
    return null;
  }
}

module.exports = { recordReadOnlyDecision, readReadOnlyDecision };
