const ROLE_COLORS = {
  shared_state_coordinator: '#3b82f6',
  parallel_executor: '#10b981',
  consistency_guardian: '#f59e0b',
  integration_executor: '#8b5cf6'
};
const typedCrdt = require('./syncytiumCrdtTypeRegistry');
const causalClock = require('./syncytium/causality/causalClockService');
const versionVectors = require('./syncytium/causality/versionVectorService');

function roleColor(role) {
  return ROLE_COLORS[role] || '#06b6d4';
}

function applyInsert(text, index, insertStr) {
  if (index >= text.length) return text + insertStr;
  return text.slice(0, index) + insertStr + text.slice(index);
}

function applyDelete(text, index, len) {
  if (index >= text.length) return text;
  const end = Math.min(index + len, text.length);
  return text.slice(0, index) + text.slice(end);
}

function applyKind(state, kind, operation) {
  // Ops without a well-formed `kind` must be ignored, never crash the server.
  if (!kind || typeof kind.type !== 'string') return;
  const handlers = {
    insert_text: () => { state.text = applyInsert(state.text, kind.index || 0, kind.text || ''); },
    delete_text: () => { state.text = applyDelete(state.text, kind.index || 0, kind.len || 0); },
    set_field: () => applySetField(state, kind, operation),
    typed_field: () => typedCrdt.apply(state.typedFields, operation, operation)
  };
  handlers[kind.type]?.();
}

function applySetField(state, kind, operation) {
  if (operation.fieldType !== 'LWW_REGISTER') {
    state.fields[kind.key] = kind.value;
    return;
  }
  const typedOperation = {
    ...operation,
    kind: { type: 'typed_field', key: kind.key, action: 'assign', value: kind.value }
  };
  typedCrdt.apply(state.typedFields, typedOperation, operation);
}

// Only a genuine [start, end] pair of finite numbers is a valid selection;
// strings, empty arrays and malformed tuples fall back to the caret position.
function normalizeSelection(selection, column) {
  if (Array.isArray(selection)
    && selection.length === 2
    && selection.every((value) => Number.isFinite(value))) {
    return selection;
  }
  return [column, column];
}

function updateCursor(state, op) {
  if (op.kind?.type !== 'update_cursor') return;
  const { line = 1, column = 1 } = op.kind;
  const selection = normalizeSelection(op.kind.selection, column);
  state.cursors[op.agentId] = {
    agentId: op.agentId,
    role: op.role,
    line,
    column,
    selectionStart: selection[0],
    selectionEnd: selection[1],
    color: roleColor(op.role),
    lastActiveMs: op.timestampMs
  };
}

// Deterministic total order for replay: time first, then Lamport clock, then
// stable identity tie-breakers. Without this, two replicas that receive the
// same ops in a different order replay them differently and diverge.
function orderOps(ops) {
  return [...ops].sort((a, b) =>
    (a.timestampMs - b.timestampMs) ||
    (a.lamport - b.lamport) ||
    String(a.agentId).localeCompare(String(b.agentId)) ||
    String(a.opId).localeCompare(String(b.opId))
  );
}

function updateInvariant(state, op) {
  if (op.kind?.type !== 'check_invariant') return;
  state.invariants[op.kind.name] = {
    name: op.kind.name,
    passed: Boolean(op.kind.passed),
    lastCheckedMs: op.timestampMs,
    checkedBy: `${op.role}:${op.agentId}`,
    failureReason: op.kind.error || null
  };
}

function emptyState() {
  return { text: '', fields: {}, typedFields: {}, cursors: {}, invariants: {}, causalFrontier: {} };
}

function cloneState(state) {
  return structuredClone(state);
}

class SyncytiumCrdt {
  constructor() {
    this.opLog = [];
    this.lamportClock = 0;
    this.appliedOpIds = new Set();
    this.causalFrontier = {};
    this.checkpointState = emptyState();
    this.compactedOpCount = 0;
    this.compactedThroughTimestampMs = 0;
    this.compactedFrontier = {};
    this.compactedOpIds = new Set();
  }

  applyOp(op) {
    const opId = typeof op.opId === 'string' ? op.opId.trim() : '';
    if (opId && this.appliedOpIds.has(opId)) return this.getSnapshot();
    const previousLamport = this.lamportClock;
    const previousFrontier = this.causalFrontier;
    const causalOperation = causalClock.record(op, this.causalFrontier);
    // Lamport receive rule: advance the local clock past any remote timestamp,
    // then stamp local events with max(local, remote) + 1. A remote op keeps
    // its own stamp.
    const remoteLamport = Number.isInteger(op.lamport) ? op.lamport : 0;
    let lamport;
    if (remoteLamport > 0) {
      this.lamportClock = Math.max(this.lamportClock, remoteLamport);
      lamport = remoteLamport;
    } else {
      this.lamportClock += 1;
      lamport = this.lamportClock;
    }
    // `??` so an explicit 0 timestamp is honored instead of replaced.
    const timestampMs = op.timestampMs ?? Date.now();
    const recordedOp = { ...causalOperation, ...(opId ? { opId } : {}), lamport, timestampMs };
    this.opLog.push(recordedOp);
    this.causalFrontier = versionVectors.merge(this.causalFrontier, recordedOp.versionVector);
    if (opId) this.appliedOpIds.add(opId);
    try {
      return this.getSnapshot();
    } catch (error) {
      this.opLog.pop();
      if (opId) this.appliedOpIds.delete(opId);
      this.lamportClock = previousLamport;
      this.causalFrontier = previousFrontier;
      throw error;
    }
  }

  hasOpId(opId) {
    return this.appliedOpIds.has(String(opId || '').trim());
  }

  getCausalFrontier() {
    return { ...this.causalFrontier };
  }

  fork() {
    const replica = new SyncytiumCrdt();
    replica.restore(this.serialize());
    return replica;
  }

  serialize() {
    return {
      checkpointState: cloneState(this.checkpointState),
      compactedOpCount: this.compactedOpCount,
      compactedThroughTimestampMs: this.compactedThroughTimestampMs,
      compactedFrontier: { ...this.compactedFrontier },
      compactedOpIds: [...this.compactedOpIds],
      operations: this.getHistory()
    };
  }

  restore(serialized = {}) {
    this.checkpointState = serialized.checkpointState ? cloneState(serialized.checkpointState) : emptyState();
    this.compactedOpCount = Number(serialized.compactedOpCount) || 0;
    this.compactedThroughTimestampMs = Number(serialized.compactedThroughTimestampMs) || 0;
    this.compactedFrontier = { ...(serialized.compactedFrontier || {}) };
    this.compactedOpIds = new Set(serialized.compactedOpIds || []);
    this.opLog = [];
    this.appliedOpIds = new Set(this.compactedOpIds);
    this.lamportClock = 0;
    this.causalFrontier = { ...this.compactedFrontier };
    for (const operation of serialized.operations || []) this.applyOp(operation);
    return this.getSnapshot();
  }

  compact(stableFrontier = {}) {
    const ordered = orderOps(this.opLog);
    let prefixLength = 0;
    while (prefixLength < ordered.length && operationIsStable(ordered[prefixLength], stableFrontier)) prefixLength += 1;
    if (!prefixLength) return { compacted: 0, compactedOpIds: [] };
    const prefix = ordered.slice(0, prefixLength);
    const state = cloneState(this.checkpointState);
    for (const operation of prefix) {
      applyKind(state, operation.kind, operation);
      updateCursor(state, operation);
      updateInvariant(state, operation);
      state.causalFrontier = versionVectors.merge(state.causalFrontier, operation.versionVector || {});
    }
    const compactedOpIds = prefix.map((operation) => operation.opId).filter(Boolean);
    this.checkpointState = state;
    this.compactedOpCount += prefix.length;
    this.compactedThroughTimestampMs = Math.max(this.compactedThroughTimestampMs, ...prefix.map((operation) => operation.timestampMs || 0));
    this.compactedFrontier = versionVectors.merge(this.compactedFrontier, state.causalFrontier);
    compactedOpIds.forEach((opId) => this.compactedOpIds.add(opId));
    const compactedSet = new Set(prefix);
    this.opLog = this.opLog.filter((operation) => !compactedSet.has(operation));
    return { compacted: prefix.length, compactedOpIds };
  }

  getSnapshot(targetMs = null, maxOps = null) {
    if (targetMs !== null && targetMs < this.compactedThroughTimestampMs) throw compactedHistoryError();
    if (maxOps !== null && maxOps < this.compactedOpCount) throw compactedHistoryError();
    const state = cloneState(this.checkpointState);
    let lastMs = this.compactedThroughTimestampMs;
    let applied = this.compactedOpCount;
    let replayed = 0;

    for (const op of orderOps(this.opLog)) {
      if (targetMs !== null && op.timestampMs > targetMs) continue;
      if (maxOps !== null && replayed >= maxOps - this.compactedOpCount) break;
      applied += 1;
      replayed += 1;
      lastMs = Math.max(lastMs, op.timestampMs);
      state.causalFrontier = versionVectors.merge(state.causalFrontier, op.versionVector || {});
      applyKind(state, op.kind, op);
      updateCursor(state, op);
      updateInvariant(state, op);
    }

    const isTimeTravel = targetMs !== null || maxOps !== null;
    const rewindTargetMs = targetMs !== null ? targetMs : (maxOps !== null ? lastMs : null);

    return {
      // step/totalOps describe the replayed prefix, never a global counter.
      step: applied,
      timestampMs: lastMs,
      textContent: state.text,
      sharedFields: { ...state.fields, ...typedCrdt.materialize(state.typedFields) },
      cursors: Object.values(state.cursors).sort((a, b) => a.agentId.localeCompare(b.agentId)),
      invariants: Object.values(state.invariants).sort((a, b) => a.name.localeCompare(b.name)),
      totalOps: applied,
      logSize: this.compactedOpCount + this.opLog.length,
      retainedOps: this.opLog.length,
      compactedOps: this.compactedOpCount,
      causalFrontier: state.causalFrontier,
      isTimeTravel,
      rewindTargetMs
    };
  }

  timeTravel(targetMs) {
    return this.getSnapshot(targetMs, null);
  }

  timeTravelToStep(step) {
    return this.getSnapshot(null, step);
  }

  getHistory() {
    return [...this.opLog];
  }
}

function operationIsStable(operation, frontier) {
  const actor = operation.dot?.actorId;
  const sequence = operation.dot?.sequence;
  return Boolean(actor && Number.isSafeInteger(sequence) && sequence <= (frontier[actor] || 0));
}

function compactedHistoryError() {
  return Object.assign(new Error('Requested history precedes the retained causal checkpoint.'), { code: 'SYNCYTIUM_HISTORY_COMPACTED' });
}

function createSyncytiumCrdt() {
  return new SyncytiumCrdt();
}

module.exports = {
  createSyncytiumCrdt,
  SyncytiumCrdt,
  roleColor
};
