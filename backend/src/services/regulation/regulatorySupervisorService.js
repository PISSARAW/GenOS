'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { withTransaction } = require('../../db');
const regulatory = require('./regulatoryStateService');
const bridge = require('./regulatoryBridgeService');
const persistence = require('./regulatoryPersistenceService');

function refusal(code, message) {
  return Object.assign(new Error(message), { code });
}

function validReference(reference) {
  return reference?.checkpointId && reference.recoveryAgentId
    && reference.recoveryRunId && reference.path;
}

async function recoveryReference(db, mission) {
  const row = await db.get('SELECT parent_agent_id, execution_mode, metadata_json FROM agents WHERE id=?', mission.agentId);
  let persisted;
  try { persisted = JSON.parse(row?.metadata_json || '{}'); } catch (_) { persisted = {}; }
  const reference = persisted.workerContract?.mission?.regulatoryRecovery;
  if (!row || row.execution_mode !== 'worker' || row.parent_agent_id !== mission.orchestratorAgentId
    || persisted.workerKind !== mission.workerKind || !validReference(reference)
    || !isDeepStrictEqual(reference, mission.workerContract?.mission?.regulatoryRecovery)) {
    throw refusal('REGULATORY_RECOVERY_REQUIRED', 'Out-of-range worker requires a persisted recovery reference.');
  }
  return reference;
}

function checkCheckpoint(row, agentId) {
  if (!row || row.agent_id !== agentId || persistence.digest(row.snapshot_json) !== row.digest) {
    throw refusal('REGULATORY_CHECKPOINT_INVALID', 'Functional checkpoint is missing or modified.');
  }
  const snapshot = JSON.parse(row.snapshot_json);
  if (snapshot.agentId !== agentId || !bridge.functional(snapshot)) {
    throw refusal('REGULATORY_CHECKPOINT_INVALID', 'Checkpoint state is not functional.');
  }
  return snapshot;
}

function validRecoveryAgent(input) {
  const { row, target, mission, metadata } = input;
  return row && row.status === 'completed' && row.run_status === 'completed'
    && row.execution_mode === 'worker' && row.workspace_id === target?.workspace_id
    && row.parent_agent_id === mission.orchestratorAgentId
    && metadata.workerKind === 'recovery_worker'
    && metadata.workerContract?.identity?.workerKind === 'recovery_worker';
}

function validRecoveryMethod(contract, reference, checkpoint) {
  const method = contract?.mission?.methodContract;
  return contract?.mission?.recoveryLease?.action === 'restore_checkpoint'
    && contract.mission.recoveryLease.path === reference.path
    && method?.methodId === 'restore_checkpoint' && method.parameters?.path === reference.path
    && persistence.digest(method.parameters.content || '') === checkpoint.digest
    && method.parameters.checkpointDigest === checkpoint.digest;
}

async function recoveryAgent(db, input) {
  const { mission, reference, checkpoint } = input;
  const row = await db.get(`SELECT a.id, a.status, a.execution_mode, a.workspace_id,
    a.parent_agent_id, a.metadata_json, r.status AS run_status
    FROM agents a JOIN strategy_execution_runs r ON r.agent_id=a.id
    WHERE a.id=? AND r.id=?`, reference.recoveryAgentId, reference.recoveryRunId);
  const target = await db.get('SELECT workspace_id FROM agents WHERE id=?', mission.agentId);
  let metadata;
  try { metadata = JSON.parse(row?.metadata_json || '{}'); } catch (_) { metadata = {}; }
  if (!validRecoveryAgent({ row, target, mission, metadata })
    || !validRecoveryMethod(metadata.workerContract, reference, checkpoint)) {
    throw refusal('REGULATORY_RECOVERY_UNVERIFIED', 'Recovery worker contract or completed run does not match the checkpoint.');
  }
  return row;
}

async function evidence(db, reference, checkpoint) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await hasEvidence(db, reference, checkpoint)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw refusal('REGULATORY_RECOVERY_UNVERIFIED', 'Native recovery evidence does not prove the checkpoint restoration.');
}

async function hasEvidence(db, reference, checkpoint) {
  const rows = await db.all(`SELECT payload_json FROM telemetry_events
    WHERE agent_id=? AND event_type='EVIDENCE_REPORT' ORDER BY id DESC LIMIT 20`, reference.recoveryAgentId);
  const payload = rows.map((row) => {
    try { return JSON.parse(row.payload_json); } catch (_) { return null; }
  }).find((item) => item?.executionRunId === reference.recoveryRunId);
  const content = payload?.evidenceReport?.workerArtifact?.content;
  const receipt = content?.checkpointReceipt;
  return payload?.evidenceReport?.outcome === 'success'
    && content?.recoveryReceipt?.action === 'restore_checkpoint'
    && content.recoveryReceipt.restoredState === `sha256:${checkpoint.digest}`
    && receipt?.result?.path === reference.path
    && receipt.result.restoredDigest === checkpoint.digest
    && content.recoveryReceipt.receiptId === receipt.id;
}

async function restoredFile(db, input) {
  const { mission, reference, checkpoint } = input;
  const workspace = await db.get(`SELECT w.path FROM workspaces w JOIN agents a ON a.workspace_id=w.id
    WHERE a.id=?`, mission.agentId);
  const root = await fs.realpath(workspace?.path || '');
  const target = path.resolve(root, reference.path);
  const relative = path.relative(root, target);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative) || await fs.realpath(target) !== target
    || (await fs.lstat(target)).isSymbolicLink()) {
    throw refusal('REGULATORY_RECOVERY_UNVERIFIED', 'Recovery target escaped the worker workspace.');
  }
  const content = await fs.readFile(target);
  if (content.length > 1048576 || persistence.digest(content) !== checkpoint.digest) {
    throw refusal('REGULATORY_RECOVERY_UNVERIFIED', 'Restored checkpoint bytes do not match the native receipt.');
  }
}

function patchFrom(snapshot, before) {
  return {
    energy: snapshot.drives.energy, integrity: snapshot.drives.integrity,
    curiosity: snapshot.drives.curiosity, survival: snapshot.drives.survival,
    stress: snapshot.modulators.stress, threat: snapshot.modulators.threat,
    hormones: { ...before.hormones, dopamine: snapshot.modulators.dopamine,
      adrenaline: snapshot.modulators.adrenaline, cortisol: snapshot.modulators.cortisol },
    cognitive: { uncertainty: snapshot.cognitive.dissonance }
  };
}

async function ensureFunctional(db, mission) {
  const before = await persistence.sync(db, mission.agentId);
  if (bridge.functional(bridge.toSnapshot(mission.agentId))) return { recovered: false, state: before };
  const reference = await recoveryReference(db, mission);
  const checkpoint = await persistence.getCheckpoint(db, mission.agentId, reference.checkpointId);
  const snapshot = checkCheckpoint(checkpoint, mission.agentId);
  await recoveryAgent(db, { mission, reference, checkpoint });
  await evidence(db, reference, checkpoint);
  await restoredFile(db, { mission, reference, checkpoint });
  try {
    return await withTransaction(db, async () => {
      const after = regulatory.updateState(mission.agentId, patchFrom(snapshot, before));
      if (!bridge.functional(bridge.toSnapshot(mission.agentId))) {
        throw refusal('REGULATORY_RECOVERY_UNVERIFIED', 'Restored regulatory state remains outside functional bounds.');
      }
      await persistence.consume(db, { agentId: mission.agentId, checkpointId: reference.checkpointId,
        recoveryAgentId: reference.recoveryAgentId, recoveryRunId: reference.recoveryRunId, before, after });
      return { recovered: true, state: after, checkpointId: reference.checkpointId };
    });
  } catch (error) {
    regulatory.hydrateState(mission.agentId, before);
    throw error;
  }
}

module.exports = { ensureFunctional };
