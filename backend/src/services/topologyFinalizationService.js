'use strict';

const { randomUUID } = require('crypto');

async function persistFinalization(db, record) {
  if (!db) return false;
  await db.run(`CREATE TABLE IF NOT EXISTS topology_finalizations (
    session_id TEXT PRIMARY KEY, mode TEXT NOT NULL, decision TEXT NOT NULL,
    state_version INTEGER NOT NULL, result_json TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await db.run(`INSERT INTO topology_finalizations (session_id, mode, decision, state_version, result_json)
    VALUES (?, ?, ?, 1, ?)
    ON CONFLICT(session_id) DO UPDATE SET mode = excluded.mode, decision = excluded.decision,
    state_version = topology_finalizations.state_version + 1, result_json = excluded.result_json,
    updated_at = CURRENT_TIMESTAMP`, record.sessionId, record.mode, record.decision, JSON.stringify({ ...record, stateVersion: undefined }));
  const row = await db.get('SELECT state_version FROM topology_finalizations WHERE session_id = ?', record.sessionId);
  return Number(row?.state_version) || 1;
}

async function finalizeTopology(input = {}) {
  const sessionId = input.sessionId || `topology-${randomUUID()}`;
  const audit = resolvedAudit(input);
  const decision = resolvedDecision(input, audit);
  const record = buildRecord(input, sessionId, { decision, audit });
  record.stateVersion = await persistFinalization(input.db, record);
  return record;
}

function resolvedAudit(input) {
  return input.capabilityAudit || { declared: [], realized: [], missing: [] };
}

function resolvedDecision(input, audit) {
  const requested = input.decision || 'blocked';
  if (audit.missing.length) return 'blocked';
  return requested;
}

function buildRecord(input, sessionId, outcome) {
  const { decision, audit } = outcome;
  const reason = missingCapabilityReason(input, decision, audit);
  return {
    mode: String(input.mode || 'unknown'),
    sessionId,
    members: listValue(input.members),
    proofs: { accepted: listValue(input.acceptedProofs), refused: listValue(input.refusedProofs) },
    mechanismsExecuted: listValue(input.mechanismsExecuted),
    decision,
    reason,
    provenance: objectValue(input.provenance),
    capabilityAudit: audit,
    finalizedAt: new Date().toISOString()
  };
}

function missingCapabilityReason(input, decision, audit) {
  if (input.decision === 'completed' && decision === 'blocked' && audit.missing.length) return 'declared_capability_not_realized';
  return input.reason || 'topology_decision_not_supplied';
}

function listValue(value) { return Array.isArray(value) ? value : []; }
function objectValue(value) { return value && typeof value === 'object' ? value : {}; }

module.exports = { finalizeTopology };
