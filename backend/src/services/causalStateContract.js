'use strict';

const crypto = require('node:crypto');
const { canonicalValue, fingerprint } = require('./stateFingerprint');

const SNAPSHOT_SCHEMA = 'genos.causal-state-snapshot/v1';
const REPLAY_SCHEMA = 'genos.causal-state-replay-receipt/v1';

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function parseCanonical(json, code = 'CAUSAL_STATE_JSON_INVALID') {
  try {
    const value = JSON.parse(json);
    if (canonicalJson(value) !== json) throw failure(code);
    return value;
  } catch (error) {
    if (error.code === code) throw error;
    throw failure(code);
  }
}

function escapeSegment(value) {
  return value.replace(/~/g, '~0').replace(/\//g, '~1');
}

function unescapeSegment(value) {
  return value.replace(/~1/g, '/').replace(/~0/g, '~');
}

function joinPath(parent, key) {
  return `${parent}/${escapeSegment(key)}`;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function diffValues(before, after, path = '') {
  if (canonicalJson(before) === canonicalJson(after)) return [];
  if (!isRecord(before) || !isRecord(after)) {
    return [{ op: 'replace', path, value: canonicalValue(after) }];
  }
  const operations = [];
  const beforeKeys = Object.keys(before).sort();
  const afterKeys = Object.keys(after).sort();
  const afterSet = new Set(afterKeys);
  const beforeSet = new Set(beforeKeys);
  for (const key of beforeKeys.filter((entry) => !afterSet.has(entry)).reverse()) {
    operations.push({ op: 'remove', path: joinPath(path, key) });
  }
  for (const key of afterKeys) {
    if (!beforeSet.has(key)) {
      operations.push({ op: 'add', path: joinPath(path, key), value: canonicalValue(after[key]) });
    } else {
      operations.push(...diffValues(before[key], after[key], joinPath(path, key)));
    }
  }
  return operations;
}

function pathSegments(pointer) {
  if (pointer === '') return [];
  if (typeof pointer !== 'string' || !pointer.startsWith('/')) {
    throw failure('CAUSAL_STATE_PATCH_PATH_INVALID');
  }
  return pointer.slice(1).split('/').map(unescapeSegment);
}

function resolveParent(document, segments) {
  let cursor = document;
  for (const segment of segments.slice(0, -1)) {
    if (!isRecord(cursor) || !Object.hasOwn(cursor, segment)) {
      throw failure('CAUSAL_STATE_PATCH_PATH_INVALID');
    }
    cursor = cursor[segment];
  }
  if (!isRecord(cursor)) throw failure('CAUSAL_STATE_PATCH_PATH_INVALID');
  return { parent: cursor, key: segments.at(-1) };
}

function applyOperation(document, operation) {
  const segments = pathSegments(operation.path);
  if (!segments.length) {
    if (operation.op !== 'replace') throw failure('CAUSAL_STATE_PATCH_INVALID');
    return canonicalValue(operation.value);
  }
  const { parent, key } = resolveParent(document, segments);
  if (operation.op === 'remove') {
    if (!Object.hasOwn(parent, key)) throw failure('CAUSAL_STATE_PATCH_PATH_INVALID');
    delete parent[key];
  } else if (operation.op === 'add') {
    if (Object.hasOwn(parent, key)) throw failure('CAUSAL_STATE_PATCH_PATH_INVALID');
    parent[key] = canonicalValue(operation.value);
  } else if (operation.op === 'replace') {
    if (!Object.hasOwn(parent, key)) throw failure('CAUSAL_STATE_PATCH_PATH_INVALID');
    parent[key] = canonicalValue(operation.value);
  } else {
    throw failure('CAUSAL_STATE_PATCH_INVALID');
  }
  return document;
}

function applyOperations(state, operations) {
  if (!Array.isArray(operations)) throw failure('CAUSAL_STATE_PATCH_INVALID');
  let document = canonicalValue(state);
  for (const operation of operations) document = applyOperation(document, operation);
  return canonicalValue(document);
}

function snapshotSeal(input) {
  const body = {
    schema: SNAPSHOT_SCHEMA,
    id: input.id,
    runId: input.runId,
    branchId: input.branchId,
    parentSnapshotId: input.parentSnapshotId || null,
    sequence: input.sequence,
    stateHash: fingerprint(input.state),
    transitionHash: fingerprint(input.transition),
    authorityHash: input.authorityHash
  };
  return { ...body, seal: fingerprint(body) };
}

function verifySnapshot(row) {
  const state = parseCanonical(row.state_json);
  const transition = parseCanonical(row.transition_json, 'CAUSAL_STATE_TRANSITION_INVALID');
  const sealed = snapshotSeal({ id: row.id, runId: row.run_id, branchId: row.branch_id,
    parentSnapshotId: row.parent_snapshot_id, sequence: row.sequence, state, transition,
    authorityHash: row.authority_hash });
  if (sealed.stateHash !== row.state_hash || sealed.transitionHash !== row.transition_hash
      || sealed.seal !== row.snapshot_seal) throw failure('CAUSAL_STATE_INTEGRITY_FAILED');
  return { row, state, transition, sealed };
}

function replayReceipt(input) {
  const body = {
    schema: REPLAY_SCHEMA,
    id: input.id,
    runId: input.runId,
    branchId: input.branchId,
    fromSnapshotId: input.fromSnapshotId,
    toSnapshotId: input.toSnapshotId,
    path: input.path,
    expectedHash: input.expectedHash,
    observedHash: input.observedHash,
    authorityHash: input.authorityHash,
    status: input.status,
    reason: input.reason || null,
    promotionEligible: false
  };
  return { ...body, receiptHash: fingerprint(body) };
}

function identifier(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function failure(code) {
  return Object.assign(new Error(code), { code });
}

module.exports = { SNAPSHOT_SCHEMA, REPLAY_SCHEMA, canonicalJson, diffValues, applyOperations,
  snapshotSeal, verifySnapshot, replayReceipt, identifier, failure };
