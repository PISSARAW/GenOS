'use strict';

const crypto = require('node:crypto');

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function successfulPair(run) {
  return Number.isInteger(run?.baseline?.exitCode) && run.baseline.exitCode > 0
    && run.intervention?.exitCode === 0
    && run.baseline.truncated === false && run.intervention.truncated === false
    && /^[a-f0-9]{64}$/.test(run.baseline.outputHash || '')
    && /^[a-f0-9]{64}$/.test(run.intervention.outputHash || '');
}

function matchesEvidence(payload, query) {
  const { findingId, controls, workspaceId } = query;
  return payload.apiVersion === 'genos.daemon-controlled-run/v1'
    && payload.findingId === findingId
    && payload.workspaceId === workspaceId
    && matchesSnapshots(payload, controls)
    && matchesRuns(payload, controls);
}

function matchesSnapshots(payload, controls) {
  return payload.baselineSnapshotId === controls.baselineSnapshotId
    && payload.interventionSnapshotId === controls.interventionSnapshotId
    && payload.initialStateHash === controls.initialStateHash
    && payload.interventionSnapshotHash === controls.interventionSnapshotHash;
}

function matchesRuns(payload, controls) {
  return typeof payload.command === 'string' && payload.command.length > 0
    && Array.isArray(payload.runs) && payload.runs.length >= 2
    && payload.runs.every(successfulPair)
    && controls.replicationCount === payload.runs.length;
}

async function hasVerifiedReceipt(db, query) {
  try {
    const row = await db.get(`SELECT subject_type, subject_id, payload_hash, payload_json
      FROM provenance_records WHERE id = ?`, query.evidence.provenance_record_id);
    if (!row || row.subject_type !== 'daemon_causal_run' || row.subject_id !== query.findingId) return false;
    if (digest(row.payload_json) !== row.payload_hash) return false;
    return matchesEvidence(JSON.parse(row.payload_json), query);
  } catch (_) {
    return false;
  }
}

module.exports = { hasVerifiedReceipt };
