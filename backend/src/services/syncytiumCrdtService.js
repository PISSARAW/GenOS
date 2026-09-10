const ROLE_COLORS = {
  shared_state_coordinator: '#3b82f6',
  parallel_executor: '#10b981',
  consistency_guardian: '#f59e0b',
  integration_executor: '#8b5cf6'
};

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

function applyKind(state, kind) {
  if (kind.type === 'insert_text') {
    state.text = applyInsert(state.text, kind.index || 0, kind.text || '');
  } else if (kind.type === 'delete_text') {
    state.text = applyDelete(state.text, kind.index || 0, kind.len || 0);
  } else if (kind.type === 'set_field') {
    state.fields[kind.key] = kind.value;
  }
}

function updateCursor(state, op) {
  if (op.kind?.type !== 'update_cursor') return;
  const { line = 1, column = 1, selection = [column, column] } = op.kind;
  state.cursors[op.agentId] = {
    agentId: op.agentId,
    role: op.role,
    line,
    column,
    selectionStart: selection[0] ?? column,
    selectionEnd: selection[1] ?? column,
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

class SyncytiumCrdt {
  constructor() {
    this.opLog = [];
    this.lamportClock = 0;
    this.stepCounter = 0;
  }

  applyOp(op) {
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
    const recordedOp = { ...op, lamport, timestampMs };
    this.opLog.push(recordedOp);
    this.stepCounter += 1;
    return this.getSnapshot();
  }

  getSnapshot(targetMs = null) {
    const state = { text: '', fields: {}, cursors: {}, invariants: {} };
    let lastMs = 0;

    for (const op of orderOps(this.opLog)) {
      if (targetMs !== null && op.timestampMs > targetMs) continue;
      lastMs = Math.max(lastMs, op.timestampMs);
      applyKind(state, op.kind);
      updateCursor(state, op);
      updateInvariant(state, op);
    }

    return {
      step: this.stepCounter,
      timestampMs: lastMs,
      textContent: state.text,
      sharedFields: state.fields,
      cursors: Object.values(state.cursors).sort((a, b) => a.agentId.localeCompare(b.agentId)),
      invariants: Object.values(state.invariants).sort((a, b) => a.name.localeCompare(b.name)),
      totalOps: this.opLog.length,
      isTimeTravel: targetMs !== null,
      rewindTargetMs: targetMs
    };
  }

  timeTravel(targetMs) {
    return this.getSnapshot(targetMs);
  }

  getHistory() {
    return [...this.opLog];
  }
}

function createSyncytiumCrdt() {
  return new SyncytiumCrdt();
}

module.exports = {
  createSyncytiumCrdt,
  SyncytiumCrdt,
  roleColor
};
