const MAX_WORKFLOW_NODES = 10000;
const MAX_WORKFLOW_DEPTH = 256;
const MAX_PARALLEL_BRANCHES = 32;
const MAX_WORKFLOW_DURATION_MS = 30 * 60 * 1000;

const state = {
  timer: null,
  memoryTimer: null,
  memoryCycleRunning: false,
  busy: false,
  busyTables: new Set(),
  recovered: false,
  lastRecoveryAt: 0,
  lastScopeByTable: new Map(),
  inFlightJobs: new Set()
};

module.exports = {
  MAX_WORKFLOW_NODES,
  MAX_WORKFLOW_DEPTH,
  MAX_PARALLEL_BRANCHES,
  MAX_WORKFLOW_DURATION_MS,
  state
};
