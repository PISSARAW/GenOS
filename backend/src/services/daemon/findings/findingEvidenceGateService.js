'use strict';

const REPLICATION_TYPES = ['replicated', 'causal'];
const SUPPORTED_TYPES = ['observational', 'experimental', 'formal', 'replicated', 'causal', 'adversarial'];

async function evidenceFor(db, findingId, types) {
  const marks = types.map(() => '?').join(',');
  return db.all(
    `SELECT evidence_type, provenance_record_id, metadata_json
     FROM daemon_finding_evidence
     WHERE finding_id = ? AND side = 'supporting'
       AND evidence_type IN (${marks}) ORDER BY id DESC`,
    findingId,
    ...types
  );
}

function parseMetadata(row) {
  try {
    const value = JSON.parse(row.metadata_json || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch (_) {
    return {};
  }
}

function hasIndependentReplication(rows) {
  return rows.some((row) => row.evidence_type === 'replicated'
    && parseMetadata(row).occurrences >= 2
    && Boolean(row.provenance_record_id));
}

function causalControlsOf(row) {
  const metadata = parseMetadata(row);
  return metadata.causalControls || {};
}

function validCausalControls(controls) {
  return Boolean(controls.baselineSnapshotId && controls.interventionSnapshotId
    && controls.baselineSnapshotId !== controls.interventionSnapshotId
    && /^[a-f0-9]{64}$/i.test(controls.initialStateHash || '')
    && controls.interventionApplied === true
    && controls.sameEnvironment === true
    && Number.isInteger(controls.replicationCount) && controls.replicationCount >= 2
    && controls.outcomeChanged === true);
}

function hasSupportingEvidence(rows) {
  return rows.some((row) => Boolean(row.provenance_record_id));
}

async function snapshotsMatchWorkspace(db, findingId, controls) {
  try {
    const finding = await db.get('SELECT territory_id FROM daemon_findings WHERE id = ?', findingId);
    if (!finding) return false;
    const territory = await db.get('SELECT workspace_id FROM daemon_territories WHERE id = ?', finding.territory_id);
    if (!territory || !territory.workspace_id) return false;
    const rows = await db.all(
      'SELECT id, workspace_id, snapshot_hash FROM workspace_snapshots WHERE id IN (?, ?)',
      controls.baselineSnapshotId,
      controls.interventionSnapshotId
    );
    return rows.length === 2 && rows.every((row) => row.workspace_id === territory.workspace_id
      && /^[a-f0-9]{64}$/i.test(row.snapshot_hash || ''));
  } catch (_) {
    return false;
  }
}

async function causalEvidenceExists(db, findingId) {
  const rows = await evidenceFor(db, findingId, ['causal']);
  for (const row of rows) {
    const controls = causalControlsOf(row);
    if (row.provenance_record_id && validCausalControls(controls)
      && await snapshotsMatchWorkspace(db, findingId, controls)) return true;
  }
  return false;
}

async function supportedEvidenceExists(db, findingId) {
  return hasSupportingEvidence(await evidenceFor(db, findingId, SUPPORTED_TYPES));
}

async function transitionError(db, change) {
  if (change.toStatus === 'SUPPORTED') {
    return await supportedEvidenceExists(db, change.id) ? null : 'supporting-evidence-required';
  }
  if (change.toStatus === 'REPRODUCED') {
    return hasIndependentReplication(await evidenceFor(db, change.id, REPLICATION_TYPES))
      ? null : 'replication-evidence-required';
  }
  if (change.toStatus === 'CAUSALLY_SUPPORTED' || change.toStatus === 'REPAIRABLE') {
    return await causalEvidenceExists(db, change.id) ? null : 'controlled-causal-evidence-required';
  }
  return null;
}

module.exports = { transitionError };
