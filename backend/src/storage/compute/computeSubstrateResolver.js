'use strict';

/**
 * Compute Substrate Resolver — dynamically selects the optimal execution
 * substrate based on operation type, scale, and current load.
 *
 * Substrates:
 *   cpu           → single-threaded, low-latency, small payloads
 *   gpu           → parallel batch scoring, vector transforms
 *   vfs_workers   → isolated patches, sandboxed file mutations
 *   cpu_solver    → SAT / constraint satisfaction / formal search
 *   remote_model  → LLM inference, heavy cognition
 *   qpu           → quantum circuits, superposition sampling
 *
 * Integrates with MorphogenesisPlanner: when a plan requires execution,
 * the resolver chooses WHERE to run each step.
 */

const { getDatabase } = require('../../db');

const SUBSTRATE_CAPABILITIES = {
  cpu: {
    label: 'CPU',
    description: 'Single-threaded general-purpose execution',
    maxScale: 50,
    operationTypes: ['branch_diff', 'single_patch', 'lineage_traversal', 'snapshot'],
    costPerOp: 0.001,
  },
  gpu: {
    label: 'GPU',
    description: 'Massively parallel batch operations',
    maxScale: 10000,
    operationTypes: ['scoring_batch', 'vector_transform', 'embedding_compute', 'batch_eval'],
    costPerOp: 0.01,
  },
  vfs_workers: {
    label: 'VFS Workers',
    description: 'Isolated sandboxed file system mutations',
    maxScale: 500,
    operationTypes: ['isolated_patch', 'file_mutation', 'blast_radius_check', 'sandbox_exec'],
    costPerOp: 0.005,
  },
  cpu_solver: {
    label: 'CPU Solver',
    description: 'SAT/constraint/formal search solver',
    maxScale: 100,
    operationTypes: ['sat_solve', 'constraint_satisfy', 'formal_verify', 'mcts_search'],
    costPerOp: 0.02,
  },
  remote_model: {
    label: 'Remote Model',
    description: 'LLM inference via provider endpoint',
    maxScale: 200,
    operationTypes: ['llm_inference', 'cognitive_composition', 'self_model_refresh'],
    costPerOp: 0.1,
  },
  qpu: {
    label: 'QPU',
    description: 'Quantum processing for superposition/circuit tasks',
    maxScale: 50,
    operationTypes: ['quantum_circuit', 'superposition_sample', 'entanglement_ops'],
    costPerOp: 0.5,
  },
};

const OPERATION_TYPE_MAP = {
  branch_diff: 'branch_diff',
  single_patch: 'branch_diff',
  diff: 'branch_diff',
  scoring: 'scoring_batch',
  batch_scoring: 'scoring_batch',
  score_ops: 'scoring_batch',
  isolated_patch: 'isolated_patch',
  sandbox_patch: 'isolated_patch',
  vfs_patch: 'isolated_patch',
  sat: 'sat_solve',
  sat_solve: 'sat_solve',
  constraint_satisfy: 'sat_solve',
  quantum_circuit: 'quantum_circuit',
  quantum: 'quantum_circuit',
  qpu_op: 'quantum_circuit',
  llm_inference: 'llm_inference',
  remote_model: 'llm_inference',
  cognitive: 'llm_inference',
};

const DEFAULT_OPERATION_TYPE = 'branch_diff';

/**
 * Classify an operation into one of the supported types.
 */
function classifyOperation(operation) {
  const mapped = OPERATION_TYPE_MAP[operation.type];
  if (mapped) return mapped;
  if (operation.payload && operation.payload.op) {
    return classifyOperation({ type: operation.payload.op, payload: operation.payload.payload });
  }
  return DEFAULT_OPERATION_TYPE;
}

/**
 * Extract scale value from a specific key of an operation.
 */
function scaleFromKey(operation, key) {
  const val = operation[key];
  if (val) return val;
  if (operation.payload) return scaleFromKey(operation.payload, key);
  return null;
}

/**
 * Extract array length scale from a specific key of an operation.
 */
function scaleFromArray(operation, key) {
  const arr = operation[key];
  if (Array.isArray(arr)) return arr.length;
  if (operation.payload) return scaleFromArray(operation.payload, key);
  return null;
}

/**
 * Estimate the scale (number of parallel ops) of an operation.
 */
function estimateScale(operation) {
  const scaleVal = scaleFromKey(operation, 'scale');
  if (scaleVal) return scaleVal;
  const countVal = scaleFromKey(operation, 'count');
  if (countVal) return countVal;
  const itemsScale = scaleFromArray(operation, 'items');
  if (itemsScale) return itemsScale;
  const patchesScale = scaleFromArray(operation, 'patches');
  if (patchesScale) return patchesScale;
  const casesScale = scaleFromArray(operation, 'cases');
  if (casesScale) return casesScale;
  return 1;
}

/**
 * Check if a substrate handles the given operation type.
 */
function substrateHandlesType(cfg, operationType) {
  return cfg.operationTypes.includes(operationType);
}

/**
 * Score a candidate substrate for the given operation.
 */
function scoreCandidate(key, cfg, ctx) {
  const { operationType, scale, loadMap } = ctx;
  if (!substrateHandlesType(cfg, operationType)) return null;
  const currentLoad = loadMap?.[key] ?? 0;
  const headroom = cfg.maxScale - currentLoad;
  const fits = scale <= headroom;
  const utilization = cfg.maxScale > 0 ? currentLoad / cfg.maxScale : 1;
  const score = fits ? (1 - utilization) * 10 - cfg.costPerOp : -Infinity;
  return { key, cfg, currentLoad, headroom, fits, score };
}

/**
 * Build and rank all candidate substrates for an operation.
 */
function rankCandidates(operationType, scale, loadMap) {
  const ctx = { operationType, scale, loadMap };
  const entries = Object.entries(SUBSTRATE_CAPABILITIES);
  const candidates = [];
  for (const [key, cfg] of entries) {
    const candidate = scoreCandidate(key, cfg, ctx);
    if (candidate) candidates.push(candidate);
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

/**
 * Format the selection reason for a winning candidate.
 */
function formatReason(winner) {
  const util = winner.cfg.maxScale > 0 ? winner.currentLoad / winner.cfg.maxScale : 0;
  return `${winner.cfg.label}: headroom=${winner.headroom}, utilization=${util.toFixed(2)}`;
}

/**
 * Choose the optimal substrate for an operation given current load.
 */
function chooseSubstrate(operationType, scale, loadMap) {
  const candidates = rankCandidates(operationType, scale, loadMap);

  if (candidates.length === 0 || !candidates[0].fits) {
    return {
      substrate: 'cpu',
      reason: 'fallback: no fitting substrate, using CPU',
      degraded: true,
    };
  }

  return {
    substrate: candidates[0].key,
    reason: formatReason(candidates[0]),
    degraded: false,
  };
}

/**
 * Resolve compute substrate for a single operation.
 */
function resolve(operation, options = {}) {
  const operationType = classifyOperation(operation);
  const scale = estimateScale(operation);
  const loadMap = options.loadMap || {};
  const result = chooseSubstrate(operationType, scale, loadMap);

  return {
    operationType,
    scale,
    substrate: result.substrate,
    reason: result.reason,
    degraded: result.degraded,
    estimatedCost: SUBSTRATE_CAPABILITIES[result.substrate].costPerOp * scale,
  };
}

/**
 * Resolve compute substrates for a batch of operations (used by MorphogenesisPlanner).
 */
function resolveBatch(operations, options = {}) {
  const loadMap = options.loadMap || {};
  return operations.map((op) => resolve(op, { loadMap }));
}

/**
 * Map a plan action to its operation type.
 */
function opTypeForAction(action) {
  if (action === 'incarnate') return 'llm_inference';
  if (action === 'terminate') return 'single_patch';
  if (action === 'reassign') return 'branch_diff';
  if (action === 'keep') return 'snapshot';
  return 'branch_diff';
}

/**
 * MorphogenesisPlanner integration: annotate plan steps with substrate choices.
 */
function annotatePlanWithSubstrates(plan, options = {}) {
  if (!plan.transitionSequence) return plan;

  const loadMap = options.loadMap || {};
  const annotatedSteps = plan.transitionSequence.map((step) => {
    const op = { type: opTypeForAction(step.action), scale: 1 };
    const substrate = resolve(op, { loadMap });
    return { ...step, substrate };
  });

  return { ...plan, transitionSequence: annotatedSteps, substrateAnnotation: true };
}

/**
 * Persist compute_substrates registration into the database.
 */
async function registerSubstrate(db, substrate) {
  await db.run(
    `INSERT INTO compute_substrates (id, label, capabilities, current_load, max_scale, cost_per_op, status, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       label = excluded.label,
       capabilities = excluded.capabilities,
       max_scale = excluded.max_scale,
       cost_per_op = excluded.cost_per_op,
       updated_at = datetime('now')`,
    substrate.id,
    substrate.label,
    JSON.stringify(substrate.capabilities),
    substrate.currentLoad || 0,
    substrate.maxScale,
    substrate.costPerOp,
  );
}

/**
 * Update load for a substrate in the database.
 */
async function updateSubstrateLoad(db, id, load) {
  await db.run(
    `UPDATE compute_substrates SET current_load = ?, updated_at = datetime('now') WHERE id = ?`,
    load,
    id,
  );
}

/**
 * Load current substrate state from database.
 */
async function loadSubstrateState(db) {
  const rows = await db.all('SELECT id, current_load FROM compute_substrates WHERE status = ?', 'active');
  const map = {};
  for (const row of rows) map[row.id] = row.current_load;
  return map;
}

/**
 * Initialize all compute substrates in the database.
 */
async function initializeSubstrates(db) {
  for (const [id, cfg] of Object.entries(SUBSTRATE_CAPABILITIES)) {
    await registerSubstrate(db, {
      id,
      label: cfg.label,
      capabilities: cfg.operationTypes,
      maxScale: cfg.maxScale,
      costPerOp: cfg.costPerOp,
    });
  }
}

/**
 * Get a ComputeSubstrateResolver instance bound to a database.
 */
async function getComputeSubstrateResolver() {
  const db = await getDatabase();
  const loadMap = await loadSubstrateState(db);
  return {
    resolve: (op) => resolve(op, { loadMap }),
    resolveBatch: (ops) => resolveBatch(ops, { loadMap }),
    annotatePlan: (plan) => annotatePlanWithSubstrates(plan, { loadMap }),
    refreshLoad: async () => { Object.assign(loadMap, await loadSubstrateState(db)); },
    loadMap,
  };
}

module.exports = {
  SUBSTRATE_CAPABILITIES,
  classifyOperation,
  estimateScale,
  chooseSubstrate,
  resolve,
  resolveBatch,
  annotatePlanWithSubstrates,
  registerSubstrate,
  updateSubstrateLoad,
  loadSubstrateState,
  initializeSubstrates,
  getComputeSubstrateResolver,
};
