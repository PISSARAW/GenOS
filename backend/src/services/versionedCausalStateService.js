'use strict';

const { withTransaction } = require('../db');
const authority = require('./missionEnvelopeAuthority');
const migration = require('../db/migrations/migrateVersionedCausalState');
const contract = require('./causalStateContract');
const { fingerprint } = require('./stateFingerprint');

async function requireAuthority(db, input) {
  if (!input?.runId || !input.agentId) throw contract.failure('CAUSAL_STATE_AUTHORITY_REQUIRED');
  const authorized = await authority.assertRun(db, { runId: input.runId, agentId: input.agentId });
  const saved = await authority.read(db, input.runId);
  if (!saved || saved.hash !== authorized.hash) throw contract.failure('CAUSAL_STATE_AUTHORITY_CHANGED');
  return { hash: saved.hash, reference: { runId: input.runId, eventId: saved.eventId,
    eventHash: saved.eventHash, signature: saved.signature, hash: saved.hash } };
}

function requireText(value, code) {
  if (typeof value !== 'string' || !value.trim() || value.length > 256) throw contract.failure(code);
  return value.trim();
}

async function prepare(db, input) {
  await migration.migrateVersionedCausalState(db);
  return requireAuthority(db, input);
}

async function insertBranch(db, input) {
  await db.run(`INSERT INTO causal_state_branches
    (id, run_id, agent_id, parent_branch_id, fork_snapshot_id, head_snapshot_id,
      status, purpose, intervention_json, authority_hash, authority_ref_json)
    VALUES (?, ?, ?, ?, ?, NULL, 'active', ?, ?, ?, ?)`,
  input.id, input.runId, input.agentId, input.parentBranchId || null,
  input.forkSnapshotId || null, input.purpose, contract.canonicalJson(input.intervention || {}),
  input.trusted.hash, contract.canonicalJson(input.trusted.reference));
}

async function insertSnapshot(db, input) {
  const sealed = contract.snapshotSeal(input);
  await db.run(`INSERT INTO causal_state_snapshots
    (id, run_id, branch_id, parent_snapshot_id, sequence, state_json, state_hash,
      transition_json, transition_hash, authority_hash, snapshot_seal)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, input.id, input.runId, input.branchId,
  input.parentSnapshotId || null, input.sequence, contract.canonicalJson(input.state),
  sealed.stateHash, contract.canonicalJson(input.transition), sealed.transitionHash,
  input.authorityHash, sealed.seal);
  return sealed;
}

async function advanceHead(db, input) {
  const result = await db.run(`UPDATE causal_state_branches SET head_snapshot_id = ?
    WHERE id = ? AND run_id = ? AND status = 'active'
      AND (head_snapshot_id = ? OR (head_snapshot_id IS NULL AND ? IS NULL))`,
  input.nextHeadId, input.branchId, input.runId, input.expectedHeadId, input.expectedHeadId);
  if (result.changes !== 1) throw contract.failure('CAUSAL_STATE_BRANCH_HEAD_CHANGED');
}

function snapshotView(sealed, input) {
  return { schema: contract.SNAPSHOT_SCHEMA, id: input.id, runId: input.runId,
    branchId: input.branchId, parentSnapshotId: input.parentSnapshotId || null,
    sequence: input.sequence, stateHash: sealed.stateHash, transitionHash: sealed.transitionHash,
    seal: sealed.seal, authorityHash: input.authorityHash, promotionEligible: false };
}

async function createRoot(db, input) {
  const trusted = await prepare(db, input);
  const branchId = input.branchId || contract.identifier('branch');
  const snapshotId = input.snapshotId || contract.identifier('state');
  const purpose = requireText(input.purpose || 'root', 'CAUSAL_STATE_PURPOSE_REQUIRED');
  return withTransaction(db, async () => {
    await insertBranch(db, { ...input, id: branchId, purpose, trusted });
    const record = { id: snapshotId, runId: input.runId, branchId, sequence: 0,
      state: input.state, transition: { kind: 'root' }, authorityHash: trusted.hash };
    const sealed = await insertSnapshot(db, record);
    await advanceHead(db, { runId: input.runId, branchId, expectedHeadId: null,
      nextHeadId: snapshotId });
    return { branchId, snapshot: snapshotView(sealed, record), authorityRef: trusted.reference };
  });
}

async function loadBranch(db, branchId) {
  const row = await db.get('SELECT * FROM causal_state_branches WHERE id = ?', branchId);
  if (!row) throw contract.failure('CAUSAL_STATE_BRANCH_NOT_FOUND');
  return row;
}

async function loadSnapshot(db, snapshotId) {
  const row = await db.get('SELECT * FROM causal_state_snapshots WHERE id = ?', snapshotId);
  if (!row) throw contract.failure('CAUSAL_STATE_SNAPSHOT_NOT_FOUND');
  return contract.verifySnapshot(row);
}

function assertOwned(record, input, trusted) {
  if (record.run_id !== input.runId || record.agent_id && record.agent_id !== input.agentId) {
    throw contract.failure('CAUSAL_STATE_RUN_SCOPE_MISMATCH');
  }
  if (record.authority_hash !== trusted.hash) throw contract.failure('CAUSAL_STATE_AUTHORITY_CHANGED');
}

async function append(db, input) {
  const trusted = await prepare(db, input);
  const branchId = requireText(input.branchId, 'CAUSAL_STATE_BRANCH_REQUIRED');
  const expectedHeadId = requireText(input.expectedHeadId, 'CAUSAL_STATE_EXPECTED_HEAD_REQUIRED');
  return withTransaction(db, async () => {
    const branch = await loadBranch(db, branchId);
    assertOwned(branch, input, trusted);
    if (branch.status !== 'active' || branch.head_snapshot_id !== expectedHeadId) {
      throw contract.failure('CAUSAL_STATE_BRANCH_HEAD_CHANGED');
    }
    const parent = await loadSnapshot(db, expectedHeadId);
    const operations = contract.diffValues(parent.state, input.state);
    const transition = { kind: 'transition', event: input.event || null, operations };
    const record = { id: input.snapshotId || contract.identifier('state'), runId: input.runId,
      branchId, parentSnapshotId: parent.row.id, sequence: parent.row.sequence + 1,
      state: input.state, transition, authorityHash: trusted.hash };
    const sealed = await insertSnapshot(db, record);
    await advanceHead(db, { runId: input.runId, branchId, expectedHeadId,
      nextHeadId: record.id });
    return { snapshot: snapshotView(sealed, record), operations,
      diffHash: fingerprint(operations), promotionEligible: false };
  });
}

async function fork(db, input) {
  const trusted = await prepare(db, input);
  const source = await loadSnapshot(db,
    requireText(input.sourceSnapshotId, 'CAUSAL_STATE_SOURCE_REQUIRED'));
  assertOwned(source.row, input, trusted);
  const branchId = input.branchId || contract.identifier('branch');
  const snapshotId = input.snapshotId || contract.identifier('state');
  const purpose = requireText(input.purpose || 'counterfactual', 'CAUSAL_STATE_PURPOSE_REQUIRED');
  return withTransaction(db, async () => {
    await insertBranch(db, { ...input, id: branchId, parentBranchId: source.row.branch_id,
      forkSnapshotId: source.row.id, purpose, trusted });
    const transition = { kind: 'fork', sourceSnapshotId: source.row.id,
      intervention: input.intervention || {} };
    const record = { id: snapshotId, runId: input.runId, branchId,
      parentSnapshotId: source.row.id, sequence: 0, state: source.state, transition,
      authorityHash: trusted.hash };
    const sealed = await insertSnapshot(db, record);
    await advanceHead(db, { runId: input.runId, branchId, expectedHeadId: null,
      nextHeadId: snapshotId });
    return { branchId, snapshot: snapshotView(sealed, record), sourceSnapshotId: source.row.id,
      authorityRef: trusted.reference, promotionEligible: false };
  });
}

async function diff(db, input) {
  const trusted = await prepare(db, input);
  const left = await loadSnapshot(db, requireText(input.leftSnapshotId, 'CAUSAL_STATE_LEFT_REQUIRED'));
  const right = await loadSnapshot(db, requireText(input.rightSnapshotId, 'CAUSAL_STATE_RIGHT_REQUIRED'));
  assertOwned(left.row, input, trusted);
  assertOwned(right.row, input, trusted);
  const operations = contract.diffValues(left.state, right.state);
  return { runId: input.runId, leftSnapshotId: left.row.id, rightSnapshotId: right.row.id,
    leftHash: left.row.state_hash, rightHash: right.row.state_hash, operations,
    diffHash: fingerprint(operations), promotionEligible: false };
}

async function ancestryPath(db, input) {
  const path = [];
  let current = await loadSnapshot(db, input.toSnapshotId);
  for (let depth = 0; depth < 1000; depth += 1) {
    assertOwned(current.row, input, input.trusted);
    path.push(current);
    if (current.row.id === input.fromSnapshotId) return path.reverse();
    if (!current.row.parent_snapshot_id) break;
    current = await loadSnapshot(db, current.row.parent_snapshot_id);
  }
  throw contract.failure('CAUSAL_STATE_REPLAY_PATH_INVALID');
}

function applyReplayPath(path) {
  let state = path[0].state;
  for (let index = 1; index < path.length; index += 1) {
    const entry = path[index];
    const transition = entry.transition;
    if (entry.row.parent_snapshot_id !== path[index - 1].row.id) {
      throw contract.failure('CAUSAL_STATE_REPLAY_PATH_INVALID');
    }
    if (transition.kind === 'fork') {
      if (contract.canonicalJson(state) !== contract.canonicalJson(entry.state)) {
        throw contract.failure('CAUSAL_STATE_REPLAY_MISMATCH');
      }
    } else if (transition.kind === 'transition') {
      state = contract.applyOperations(state, transition.operations);
    } else {
      throw contract.failure('CAUSAL_STATE_TRANSITION_INVALID');
    }
    if (fingerprint(state) !== entry.row.state_hash) throw contract.failure('CAUSAL_STATE_REPLAY_MISMATCH');
  }
  return state;
}

async function saveReplayReceipt(db, input) {
  const receipt = contract.replayReceipt(input);
  await db.run(`INSERT INTO causal_state_replay_receipts
    (id, run_id, branch_id, from_snapshot_id, to_snapshot_id, status, reason,
      receipt_json, receipt_hash, authority_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  receipt.id, receipt.runId, receipt.branchId, receipt.fromSnapshotId, receipt.toSnapshotId,
  receipt.status, receipt.reason, contract.canonicalJson(receipt), receipt.receiptHash,
  receipt.authorityHash);
  return receipt;
}

async function replay(db, input) {
  const trusted = await prepare(db, input);
  const replayInput = { ...input, trusted,
    fromSnapshotId: requireText(input.fromSnapshotId, 'CAUSAL_STATE_REPLAY_FROM_REQUIRED'),
    toSnapshotId: requireText(input.toSnapshotId, 'CAUSAL_STATE_REPLAY_TO_REQUIRED') };
  let path = [];
  let observedHash = null;
  try {
    path = await ancestryPath(db, replayInput);
    observedHash = fingerprint(applyReplayPath(path));
    const expectedHash = input.expectedHash || path.at(-1).row.state_hash;
    if (observedHash !== expectedHash) throw contract.failure('CAUSAL_STATE_REPLAY_EXPECTATION_FAILED');
    return saveReplayReceipt(db, { id: contract.identifier('replay'), runId: input.runId,
      branchId: path.at(-1).row.branch_id, fromSnapshotId: replayInput.fromSnapshotId,
      toSnapshotId: replayInput.toSnapshotId, path: path.map((entry) => entry.row.id),
      expectedHash, observedHash, authorityHash: trusted.hash, status: 'verified' });
  } catch (error) {
    const target = path.at(-1)?.row;
    if (target) {
      error.receipt = await saveReplayReceipt(db, { id: contract.identifier('replay'),
        runId: input.runId, branchId: target.branch_id,
        fromSnapshotId: replayInput.fromSnapshotId, toSnapshotId: replayInput.toSnapshotId,
        path: path.map((entry) => entry.row.id), expectedHash: input.expectedHash || target.state_hash,
        observedHash: observedHash || 'unavailable', authorityHash: trusted.hash, status: 'refused',
        reason: error.code || 'CAUSAL_STATE_REPLAY_FAILED' });
    }
    throw error;
  }
}

module.exports = { createRoot, append, fork, diff, replay, loadBranch, loadSnapshot };
