'use strict';

const crypto = require('node:crypto');
const { validateSpec } = require('./specValidator');

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function buildSnapshotReceipt(snapshot, run, scope = {}) {
  const validation = validateSpec('snapshot.schema.json', snapshot);
  if (!run.ok || run.exitCode !== 0 || !validation.valid) {
    return { eligible: false, validation, receipt: null };
  }
  const payload = { apiVersion: 'genos.rust-bridge-snapshot/v1', operation: 'snapshot_create',
    source: 'genos-cli', exitCode: run.exitCode,
    organizationId: scope.organizationId, projectId: scope.projectId, snapshot };
  const payloadJson = JSON.stringify(payload);
  const payloadHash = digest(payloadJson);
  return { eligible: true, validation, receipt: {
    id: `rust-snapshot-${payloadHash}`, subjectType: 'rust_bridge_snapshot',
    subjectId: String(snapshot.snapshot_id), payloadHash, payloadJson,
    organizationId: scope.organizationId, projectId: scope.projectId
  } };
}

async function persistSnapshotReceipt(db, result) {
  if (!result.eligible || !result.receipt) return result;
  const receipt = result.receipt;
  await db.run(`INSERT OR IGNORE INTO provenance_records
    (id, subject_type, subject_id, payload_hash, payload_json, organization_id, project_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, receipt.id, receipt.subjectType,
  receipt.subjectId, receipt.payloadHash, receipt.payloadJson,
  receipt.organizationId, receipt.projectId);
  return { eligible: true, validation: result.validation,
    receipt: { apiVersion: 'genos.rust-bridge-snapshot/v1', id: receipt.id,
      payloadHash: receipt.payloadHash, source: 'genos-cli' } };
}

module.exports = { buildSnapshotReceipt, persistSnapshotReceipt };
