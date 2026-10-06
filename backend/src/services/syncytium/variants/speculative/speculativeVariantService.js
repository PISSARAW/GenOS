'use strict';

const S = require('../../../syncytiumSchemaService');
const { createHash, randomUUID } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const DEFAULT_EXEC_BUDGET = 5000;

function createSpeculativeVariantService(syn) {
  return {
    createSpeculativeSession: (m, o = {}) => createSession(m, o, syn),
    spawnBranch: (ctx) => spawnBranch({ ...ctx, syn }),
    executeOnBranch: (ctx) => executeOnBranch({ ...ctx, syn }),
    compareBranches: (ctx) => compareBranches({ ...ctx, syn }),
    promoteBranch: (ctx) => promoteBranch({ ...ctx, syn }),
    discardBranch: (ctx) => discardBranch({ ...ctx, syn }),
    listBranches: (ctx) => listBranches({ ...ctx, syn }),
    speculativeSnapshot: (ctx) => speculativeSnapshot({ ...ctx, syn })
  };
}

function compileSchema() {
  return S.compile({
    schemaId: 'syncytium-speculative-v1',
    fields: {
      branchRegistry: { dataType: 'MAP', consistencyZone: 'INVARIANT_PRESERVING' },
      branchSnapshots: { dataType: 'MAP', consistencyZone: 'INVARIANT_PRESERVING' },
      executionBudget: { dataType: 'LWW_REGISTER', consistencyZone: 'CAUSAL' },
      comparisonLog: { dataType: 'ADD_WINS_SET', consistencyZone: 'APPEND_ONLY' },
      validationLog: { dataType: 'ADD_WINS_SET', consistencyZone: 'APPEND_ONLY' },
      promotionLog: { dataType: 'ADD_WINS_SET', consistencyZone: 'APPEND_ONLY' },
      discardLog: { dataType: 'ADD_WINS_SET', consistencyZone: 'APPEND_ONLY' }
    }
  });
}

function createSession(m, o, syn) {
  return syn.createSession(m, { ...o, schema: compileSchema(), variantPolicy: o.variantPolicy || { id: 'speculative' } });
}

const err = (msg, code) => Object.assign(new Error(msg), { code });
function assertStr(v, label) {
  if (!v || typeof v !== 'string')
    throw err(`SpeculativeError: ${label} must be a non-empty string`, 'SPEC_BAD_INPUT');
}
function opId(o) { return o?.opId || randomUUID(); }
function actor(o, fb) { return o?.actorId || fb; }
function now() { return Date.now(); }

async function spawnBranch(ctx) {
  const { sid, baseSnapshotId, o, syn } = ctx;
  assertStr(baseSnapshotId, 'baseSnapshotId');
  const cfg = validateConfig(o?.branchConfig);
  const n = now();
  const id = ctx.branchId || o?.branchId || `branch-${n}-${randomUUID().slice(0, 8)}`;
  const A = actor(o, 'speculative-worker');
  const rec = { branchId: id, baseSnapshotId, parentBranchId: null,
    label: null, status: 'ACTIVE', createdBy: A, createdAt: n,
    executionBudgetMs: cfg.budget, operationsCount: 0, lastExecutionAt: null };
  const snapRef = { snapshotId: id, baseOn: baseSnapshotId, takenAt: n, branchId: id };
  await syn.createSpeculativeBranch(sid, { branchId: id, options: o });
  await syn.applyOperation(sid, makeFieldOp({ key: 'branchRegistry', action: 'set', entryKey: id, value: rec, A, o }), o);
  await syn.applyOperation(sid, makeFieldOp({ key: 'branchSnapshots', action: 'set', entryKey: id, value: snapRef, A, o }), o);
  return { branchId: id, label: null, status: 'ACTIVE', baseSnapshotId,
    executionBudgetMs: cfg.budget, createdAt: n };
}

function validateConfig(cfg) {
  if (cfg && typeof cfg !== 'object')
    throw err('branchConfig must be object', 'SPEC_BAD_CONFIG');
  const budget = cfg?.executionBudgetMs ?? DEFAULT_EXEC_BUDGET;
  if (!Number.isFinite(budget) || budget < 0)
    throw err('budget must be non-negative finite', 'SPEC_BAD_CONFIG');
  return { cap: 16, budget };
}

function makeFieldOp(p) {
  const base = { opId: opId(p.o), actorId: p.A,
    kind: { type: 'typed_field', key: p.key } };
  if (p.action === 'set') {
    base.kind.action = 'set'; base.kind.entryKey = p.entryKey; base.kind.value = p.value;
  } else if (p.action === 'delete') {
    base.kind.action = 'delete'; base.kind.entryKey = p.entryKey;
  } else {
    base.kind.action = 'add'; base.kind.value = p.value;
  }
  return base;
}

async function executeOnBranch(ctx) {
  const { sid, branchId, operations, o, syn } = ctx;
  assertStr(branchId, 'branchId');
  if (!Array.isArray(operations) || operations.length === 0)
    throw err('operations must be a non-empty array', 'SPEC_BAD_INPUT');
  const { reg } = await fetchReg(sid, o, syn);
  const branch = reg[branchId];
  if (!branch) throw err(`branch '${branchId}' not found`, 'SPEC_BRANCH_NOT_FOUND');
  if (branch.status !== 'ACTIVE')
    throw err(`branch not ACTIVE (${branch.status})`, 'SPEC_BRANCH_NOT_ACTIVE');
  const budget = branch.executionBudgetMs ?? DEFAULT_EXEC_BUDGET;
  const wallStart = performance.now();
  const { remaining, applied, exceededAt } = await applyOps({ sid, id: branchId, ops: operations, budget, o, syn });
  if (exceededAt !== null) {
    const exceeded = { ...branch, status: 'BUDGET_EXCEEDED', operationsCount: branch.operationsCount + 1,
      lastExecutionAt: now(), budgetExceededAtOperation: exceededAt,
      appliedOperationIds: [...(branch.appliedOperationIds || []), ...applied.map((item) => item.opId)] };
    await syn.applyOperation(sid, makeFieldOp({ key: 'branchRegistry', action: 'set', entryKey: branchId,
      value: exceeded, A: actor(o, 'branch-executor'), o }), o);
    return buildBudgetExceeded({ branchId, count: applied.length, budget, remaining, exceededAt });
  }
  const n = now();
  await syn.applyOperation(sid, makeFieldOp({ key: 'branchRegistry', action: 'set', entryKey: branchId,
    value: { ...branch, operationsCount: branch.operationsCount + 1, lastExecutionAt: n,
      appliedOperationIds: [...(branch.appliedOperationIds || []), ...applied.map((item) => item.opId)] }, A: actor(o, 'branch-executor'), o }), o);
  return buildCompletion({ branchId, applied, budget, remaining, n, wallStart });
}

async function applyOps(ctx) {
  const { sid, id, ops, budget, o, syn } = ctx;
  const remaining = { ms: budget };
  const applied = [];
  let exceededAt = null;
  for (let i = 0; i < ops.length; i++) {
    const cost = (ops[i]?.estimatedCostMs > 0) ? ops[i].estimatedCostMs : 1;
    if (cost > remaining.ms) { exceededAt = i; break; }
    remaining.ms -= cost;
    const op = ops[i];
    const opIdVal = op?.opId || randomUUID();
    const kind = op?.kind || { type: 'typed_field', key: 'branchSnapshots', action: 'set',
      entryKey: id, value: { appliedOperation: opIdVal, index: i } };
    await syn.applySpeculativeOperation(sid, {
      branchId: id, operation: { opId: opIdVal, actorId: actor(o, 'branch-executor'), kind }, options: o
    });
    applied.push({ index: i, status: 'APPLIED', opId: opIdVal });
  }
  return { remaining, applied, exceededAt };
}

function buildBudgetExceeded({ branchId, count, budget, remaining, exceededAt }) {
  return { branchId, status: 'BUDGET_EXCEEDED', operationsApplied: count,
    budgetConsumedMs: budget - remaining.ms, budgetRemainingMs: 0,
    abortedAtOperation: exceededAt, timestamp: now() };
}
function buildCompletion({ branchId, applied, budget, remaining, n, wallStart }) {
  return { branchId, status: 'COMPLETED',
    operationsApplied: applied.length,
    operationsFailed: 0,
    budgetConsumedMs: budget - remaining.ms,
    budgetRemainingMs: Math.max(0, remaining.ms),
    wallElapsedMs: performance.now() - (wallStart || performance.now()),
    results: applied, timestamp: n };
}

async function compareBranches(ctx) {
  const { sid, branchIds, o, syn } = ctx;
  if (!Array.isArray(branchIds) || branchIds.length < 2)
    throw err('need >=2 branchIds', 'SPEC_BAD_INPUT');
  const { reg, snaps } = await fetchRegSnaps(sid, o, syn);
  const metricValues = ctx.metrics || o?.metrics || {};
  const branches = await Promise.all(branchIds.map(async (id) => {
    if (!reg[id]) throw err(`branch '${id}' not found`, 'SPEC_BRANCH_NOT_FOUND');
    const b = reg[id];
    const native = await syn.compareSpeculativeBranch(sid, { branchId: id, options: o });
    return { branchId: id, status: b.status, label: b.label || null,
      createdAt: b.createdAt, baseSnapshotId: b.baseSnapshotId,
      snapshot: native.simulated, changedFields: native.changedFields, metric: metricValues[id] };
  }));
  const metricName = ctx.metricName || o?.metricName;
  if (metricName && branches.some((branch) => !Number.isFinite(branch.metric))) {
    throw err(`Metric '${metricName}' requires one finite value for every branch`, 'SPEC_METRIC_INVALID');
  }
  const ranked = metricName ? [...branches].sort((left, right) => right.metric - left.metric) : [];
  const comparisonId = o?.comparisonId || randomUUID();
  const lineageGroups = groupByBase(branches);
  const A = actor(o, 'comparison-daemon');
  await syn.applyOperation(sid, makeFieldOp({ key: 'comparisonLog', action: 'add',
    value: { comparisonId, branchIds, comparedAt: now(), actorId: A, status: 'DIFFERENTIAL', lineageGroups }, A, o }), o);
  return { comparisonId, metricName: metricName || null, branches, ranked, lineageGroups, timestamp: now() };
}

function groupByBase(branches) {
  return branches.reduce((g, b) => {
    const key = b.baseSnapshotId || 'ORPHAN';
    if (!g[key]) g[key] = [];
    g[key].push(b.branchId);
    return g;
  }, {});
}

async function promoteBranch(ctx) {
  const { sid, branchId, evidenceGate, o, syn } = ctx;
  assertStr(branchId, 'branchId');
  const { reg } = await fetchReg(sid, o, syn);
  const branch = reg[branchId];
  if (!branch) throw err(`branch '${branchId}' not found`, 'SPEC_BRANCH_NOT_FOUND');
  if (branch.status !== 'ACTIVE') throw err(`branch is not eligible for promotion (${branch.status})`, 'SPEC_PROMOTION_INELIGIBLE');
  const n = now();
  const A = actor(o, 'promotion-manager');
  const fingerprint = branchFingerprint(branch);
  if (!validEvidenceGate(evidenceGate)) {
    const failed = { ...branch, status: 'VALIDATION_FAILED', validationFailedAt: n,
      validationFingerprint: fingerprint, failedEvidenceGate: evidenceGate || null };
    await syn.applyOperation(sid, makeFieldOp({ key: 'branchRegistry', action: 'set', entryKey: branchId,
      value: failed, A, o }), o);
    await syn.applyOperation(sid, makeFieldOp({ key: 'validationLog', action: 'add',
      value: { branchId, fingerprint, passed: false, evidenceGate: evidenceGate || null, checkedAt: n, by: A }, A, o }), o);
    throw err('Promotion requires passing validation evidence; this branch is now ineligible.', 'SPEC_PROMOTION_GATED');
  }
  const promoted = await syn.promoteSpeculativeBranch(sid, { branchId, options: o });
  const status = promoted.status;
  await syn.applyOperation(sid, makeFieldOp({ key: 'branchRegistry', action: 'set', entryKey: branchId,
    value: { ...branch, status, promotedAt: n, promotionEvidenceGate: evidenceGate,
      validationFingerprint: fingerprint,
      appliedOperationIds: promoted.operationIds }, A, o }), o);
  await syn.applyOperation(sid, makeFieldOp({ key: 'validationLog', action: 'add',
    value: { branchId, fingerprint, passed: true, evidenceGate, checkedAt: n, by: A }, A, o }), o);
  await syn.applyOperation(sid, makeFieldOp({ key: 'promotionLog', action: 'add',
    value: { branchId, promotedAt: n, by: A, evidenceGatePassed: true,
      label: branch.label || null, baseSnapshotId: branch.baseSnapshotId }, A, o }), o);
  return { branchId, previousStatus: branch.status, newStatus: status,
    evidenceGatePassed: true, promotedSnapshot: promoted.snapshot, timestamp: n };
}

function validEvidenceGate(gate) {
  return gate && gate.passed === true && Array.isArray(gate.checks) && gate.checks.length > 0
    && gate.checks.every((check) => check && check.passed === true);
}

function branchFingerprint(branch) {
  return createHash('sha256').update(JSON.stringify({ branchId: branch.branchId,
    baseSnapshotId: branch.baseSnapshotId,
    appliedOperationIds: [...(branch.appliedOperationIds || [])].sort() })).digest('hex');
}

async function discardBranch(ctx) {
  const { sid, branchId, reason, o, syn } = ctx;
  assertStr(branchId, 'branchId');
  if (!reason || typeof reason !== 'string')
    throw err('reason must be a non-empty string', 'SPEC_BAD_INPUT');
  const { reg } = await fetchReg(sid, o, syn);
  if (!reg[branchId]) throw err(`branch '${branchId}' not found`, 'SPEC_BRANCH_NOT_FOUND');
  await syn.discardSpeculativeBranch(sid, { branchId, reason, options: o });
  const n = now();
  const A = actor(o, 'speculation-manager');
  await syn.applyOperation(sid, makeFieldOp({ key: 'branchRegistry', action: 'delete', entryKey: branchId, A, o }), o);
  await syn.applyOperation(sid, makeFieldOp({ key: 'branchSnapshots', action: 'delete', entryKey: branchId, A, o }), o);
  await syn.applyOperation(sid, makeFieldOp({ key: 'discardLog', action: 'add',
    value: { branchId, discardedAt: n, by: A, reason,
      label: reg[branchId].label || null, baseSnapshotId: reg[branchId].baseSnapshotId }, A, o }), o);
  return { branchId, discardedAt: n, reason, status: 'DISCARDED' };
}

async function listBranches(ctx) {
  const { sid, o, syn } = ctx;
  const { reg, snaps } = await fetchRegSnaps(sid, o, syn);
  const branches = Object.values(reg).map(b => ({
    branchId: b.branchId, status: b.status, label: b.label || null,
    baseSnapshotId: b.baseSnapshotId, parentBranchId: b.parentBranchId,
    createdAt: b.createdAt, lastExecutionAt: b.lastExecutionAt,
    executionBudgetMs: b.executionBudgetMs, operationsCount: b.operationsCount,
    hasSnapshot: !!snaps[b.branchId]
  }));
  return { branches, totalCount: branches.length,
    activeCount: branches.filter(b => b.status === 'ACTIVE').length,
    promotedCount: branches.filter(b => b.status === 'PROMOTED').length,
    timestamp: now() };
}

async function speculativeSnapshot(ctx) {
  const { sid, o, syn } = ctx;
  const listing = await listBranches({ sid, o, syn });
  const snap = await syn.snapshot(sid, o);
  const sf = snap.shared?.sharedFields || {};
  return { sessionId: sid, schemaId: 'syncytium-speculative-v1', ...listing,
    comparisonOps: (sf.comparisonLog || []).length,
    promotionOps: (sf.promotionLog || []).length,
    discardOps: (sf.discardLog || []).length,
    executionBudget: sf.executionBudget || { value: DEFAULT_EXEC_BUDGET },
    timestamp: now() };
}

async function fetchRegSnaps(sid, o, syn) {
  const snap = await syn.snapshot(sid, o);
  const sf = snap.shared?.sharedFields || {};
  return { reg: sf.branchRegistry || {}, snaps: sf.branchSnapshots || {} };
}
const fetchReg = fetchRegSnaps;

module.exports = { createSpeculativeVariantService };
