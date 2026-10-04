'use strict';

const S = require('../../../syncytiumSchemaService');
const { randomUUID } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const DEFAULT_EXEC_BUDGET = 5000;

function createSpeculativeVariantService(syn) {
  return {
    createSpeculativeSession: (m, o) => createSession(m, o, syn),
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
      branchStates: { dataType: 'MAP', consistencyZone: 'INVARIANT_PRESERVING' },
      branchLineage: { dataType: 'MAP', consistencyZone: 'INVARIANT_PRESERVING' },
      executionBudget: { dataType: 'LWW_REGISTER', consistencyZone: 'CAUSAL' },
      comparisonLog: { dataType: 'ADD_WINS_SET', consistencyZone: 'APPEND_ONLY' },
      promotionLog: { dataType: 'ADD_WINS_SET', consistencyZone: 'APPEND_ONLY' },
      discardLog: { dataType: 'ADD_WINS_SET', consistencyZone: 'APPEND_ONLY' }
    }
  });
}

function createSession(m, o, syn) {
  return syn.createSession(m, { ...o, schema: compileSchema(), variantPolicy: { id: 'speculative' } });
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
  const id = o?.branchId || `branch-${n}-${randomUUID().slice(0, 8)}`;
  const A = actor(o, 'speculative-worker');
  const baseSnap = await syn.snapshot(sid, o);
  const branchState = {
    sharedFields: JSON.parse(JSON.stringify(baseSnap.shared?.sharedFields || {})),
    totalOps: baseSnap.shared?.totalOps || 0,
    schema: baseSnap.schema
  };
  const rec = {
    branchId: id,
    baseSnapshotId,
    parentBranchId: null,
    label: null,
    status: 'ACTIVE',
    createdBy: A,
    createdAt: n,
    executionBudgetMs: cfg.budget,
    operationsCount: 0,
    lastExecutionAt: null,
    baseTotalOps: branchState.totalOps
  };
  const snapRef = { snapshotId: id, baseOn: baseSnapshotId, takenAt: n, branchId: id };
  const lineage = {
    branchId: id,
    baseSnapshotId,
    parentBranchId: null,
    createdAt: n,
    createdBy: A,
    promotedAt: null,
    discardedAt: null,
    mergeBaseTotalOps: branchState.totalOps
  };
  await syn.applyOperation(sid, makeFieldOp({ key: 'branchRegistry', action: 'set', entryKey: id, value: rec, A, o }), o);
  await syn.applyOperation(sid, makeFieldOp({ key: 'branchSnapshots', action: 'set', entryKey: id, value: snapRef, A, o }), o);
  await syn.applyOperation(sid, makeFieldOp({ key: 'branchStates', action: 'set', entryKey: id, value: branchState, A, o }), o);
  await syn.applyOperation(sid, makeFieldOp({ key: 'branchLineage', action: 'set', entryKey: id, value: lineage, A, o }), o);
  return { branchId: id, label: null, status: 'ACTIVE', baseSnapshotId,
    executionBudgetMs: cfg.budget, createdAt: n };
}

function validateConfig(cfg) {
  if (cfg && typeof cfg !== 'object')
    throw err('branchConfig must be object', 'SPEC_BAD_CONFIG');
  const budget = cfg?.executionBudgetMs || DEFAULT_EXEC_BUDGET;
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
  const { reg, states } = await fetchRegStates(sid, o, syn);
  const branch = reg[branchId];
  if (!branch) throw err(`branch '${branchId}' not found`, 'SPEC_BRANCH_NOT_FOUND');
  if (branch.status !== 'ACTIVE')
    throw err(`branch not ACTIVE (${branch.status})`, 'SPEC_BRANCH_NOT_ACTIVE');
  const budget = branch.executionBudgetMs || DEFAULT_EXEC_BUDGET;
  const wallStart = performance.now();
  const { remaining, applied, newState } = await applyOpsOnBranch({ sid, id: branchId, ops: operations, budget, o, syn, branchState: states[branchId] });
  if (remaining.ms < 0)
    return buildBudgetExceeded({ branchId, count: applied.length, budget, remaining });
  const n = now();
  await syn.applyOperation(sid, makeFieldOp({ key: 'branchRegistry', action: 'set', entryKey: branchId,
    value: { ...branch, operationsCount: branch.operationsCount + 1, lastExecutionAt: n }, A: actor(o, 'branch-executor'), o }), o);
  await syn.applyOperation(sid, makeFieldOp({ key: 'branchStates', action: 'set', entryKey: branchId,
    value: newState, A: actor(o, 'branch-executor'), o }), o);
  return buildCompletion({ branchId, applied, budget, remaining, n, wallStart });
}

async function applyOpsOnBranch(ctx) {
  const { sid, id, ops, budget, o, syn, branchState } = ctx;
  const remaining = { ms: budget };
  const applied = [];
  let currentState = branchState ? JSON.parse(JSON.stringify(branchState)) : { sharedFields: {}, totalOps: 0, schema: null };
  for (let i = 0; i < ops.length; i++) {
    const cost = (ops[i]?.estimatedCostMs > 0) ? ops[i].estimatedCostMs : 1;
    if (cost > remaining.ms) break;
    remaining.ms -= cost;
    const op = ops[i];
    const opIdVal = op?.opId || randomUUID();
    const kind = op?.kind || { type: 'typed_field', key: 'branchStates', action: 'set',
      entryKey: id, value: { appliedOperation: opIdVal, index: i } };
    currentState = applyOpToState(currentState, { opId: opIdVal, actorId: actor(o, 'branch-executor'), kind });
    applied.push({ index: i, status: 'APPLIED', opId: opIdVal });
  }
  return { remaining, applied, newState: currentState };
}

function applyOpToState(state, operation) {
  const newState = { ...state, sharedFields: { ...state.sharedFields }, totalOps: (state.totalOps || 0) + 1 };
  const kind = operation.kind;
  if (kind.type === 'typed_field') {
    const key = kind.key;
    if (!newState.sharedFields[key]) newState.sharedFields[key] = {};
    if (kind.action === 'set') {
      newState.sharedFields[key][kind.entryKey] = kind.value;
    } else if (kind.action === 'delete') {
      delete newState.sharedFields[key][kind.entryKey];
    } else if (kind.action === 'add') {
      if (!Array.isArray(newState.sharedFields[key])) newState.sharedFields[key] = [];
      newState.sharedFields[key].push(kind.value);
    }
  }
  return newState;
}

function buildBudgetExceeded({ branchId, count, budget, remaining }) {
  return { branchId, status: 'BUDGET_EXCEEDED', operationsApplied: count,
    budgetConsumedMs: budget - remaining.ms, budgetRemainingMs: 0,
    abortedAtOperation: count, timestamp: now() };
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
  const { reg, states } = await fetchRegStates(sid, o, syn);
  const branches = branchIds.map(id => {
    if (!reg[id]) throw err(`branch '${id}' not found`, 'SPEC_BRANCH_NOT_FOUND');
    const b = reg[id];
    const state = states[id];
    return { branchId: id, status: b.status, label: b.label || null,
      createdAt: b.createdAt, baseSnapshotId: b.baseSnapshotId,
      snapshot: state || null, operationsCount: b.operationsCount,
      budgetConsumedMs: (b.executionBudgetMs || DEFAULT_EXEC_BUDGET) - (b.executionBudgetMs || DEFAULT_EXEC_BUDGET) };
  });
  const comparisonId = o?.comparisonId || randomUUID();
  const lineageGroups = groupByBase(branches);
  const A = actor(o, 'comparison-daemon');
  await syn.applyOperation(sid, makeFieldOp({ key: 'comparisonLog', action: 'add',
    value: { comparisonId, branchIds, comparedAt: now(), actorId: A, status: 'DIFFERENTIAL', lineageGroups }, A, o }), o);
  return { comparisonId, branches, lineageGroups, timestamp: now() };
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
  const { sid, branchId, validationResult, o, syn } = ctx;
  assertStr(branchId, 'branchId');
  if (!validationResult || typeof validationResult !== 'object' || validationResult.valid !== true) {
    throw err('Promotion requires explicit validationResult with valid=true from mission metrics comparison', 'SPEC_PROMOTION_GATED');
  }
  const { reg, states, lineage } = await fetchRegStatesLineage(sid, o, syn);
  const branch = reg[branchId];
  if (!branch) throw err(`branch '${branchId}' not found`, 'SPEC_BRANCH_NOT_FOUND');
  if (branch.status === 'PROMOTED') throw err('already PROMOTED', 'SPEC_ALREADY_PROMOTED');
  const n = now();
  const branchState = states[branchId];
  if (!branchState) throw err('Branch state not found for promotion', 'SPEC_BRANCH_STATE_MISSING');
  const mainSnapshot = await syn.snapshot(sid, o);
  const mainState = { sharedFields: mainSnapshot.shared?.sharedFields || {}, totalOps: mainSnapshot.shared?.totalOps || 0 };
  const mergedState = mergeStates(mainState, branchState, branch.baseTotalOps);
  const A = actor(o, 'promotion-manager');
  await syn.applyOperation(sid, makeFieldOp({ key: 'branchRegistry', action: 'set', entryKey: branchId,
    value: { ...branch, status: 'PROMOTED', promotedAt: n, promotionEvidenceGate: true, promotionValidation: validationResult }, A, o }), o);
  await syn.applyOperation(sid, makeFieldOp({ key: 'branchLineage', action: 'set', entryKey: branchId,
    value: { ...lineage[branchId], promotedAt: n, mergeBaseTotalOps: mainState.totalOps }, A, o }), o);
  await syn.applyOperation(sid, makeFieldOp({ key: 'promotionLog', action: 'add',
    value: { branchId, promotedAt: n, by: A, evidenceGatePassed: true,
      label: branch.label || null, baseSnapshotId: branch.baseSnapshotId, validationResult }, A, o }), o);
  await syn.applyOperation(sid, makeFieldOp({ key: 'branchStates', action: 'delete', entryKey: branchId, A, o }), o);
  return { branchId, previousStatus: branch.status, newStatus: 'PROMOTED',
    evidenceGatePassed: true, timestamp: n, mergedOps: mergedState.totalOps - mainState.totalOps };
}

function mergeStates(mainState, branchState, baseTotalOps) {
  const merged = { ...mainState, sharedFields: { ...mainState.sharedFields }, totalOps: mainState.totalOps };
  const branchFields = branchState.sharedFields || {};
  for (const [key, value] of Object.entries(branchFields)) {
    if (!merged.sharedFields[key]) merged.sharedFields[key] = {};
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      merged.sharedFields[key] = { ...merged.sharedFields[key], ...value };
    } else if (Array.isArray(value)) {
      merged.sharedFields[key] = [...(merged.sharedFields[key] || []), ...value];
    } else {
      merged.sharedFields[key] = value;
    }
  }
  merged.totalOps = Math.max(mainState.totalOps, branchState.totalOps);
  return merged;
}

async function discardBranch(ctx) {
  const { sid, branchId, reason, o, syn } = ctx;
  assertStr(branchId, 'branchId');
  if (!reason || typeof reason !== 'string')
    throw err('reason must be a non-empty string', 'SPEC_BAD_INPUT');
  const { reg, lineage } = await fetchRegLineage(sid, o, syn);
  if (!reg[branchId]) throw err(`branch '${branchId}' not found`, 'SPEC_BRANCH_NOT_FOUND');
  const n = now();
  const A = actor(o, 'speculation-manager');
  await syn.applyOperation(sid, makeFieldOp({ key: 'branchRegistry', action: 'set', entryKey: branchId,
    value: { ...reg[branchId], status: 'DISCARDED', discardedAt: n, discardReason: reason }, A, o }), o);
  await syn.applyOperation(sid, makeFieldOp({ key: 'branchLineage', action: 'set', entryKey: branchId,
    value: { ...lineage[branchId], discardedAt: n, discardReason: reason }, A, o }), o);
  await syn.applyOperation(sid, makeFieldOp({ key: 'discardLog', action: 'add',
    value: { branchId, discardedAt: n, by: A, reason,
      label: reg[branchId].label || null, baseSnapshotId: reg[branchId].baseSnapshotId }, A, o }), o);
  return { branchId, discardedAt: n, reason, status: 'DISCARDED' };
}

async function listBranches(ctx) {
  const { sid, o, syn } = ctx;
  const { reg, states, lineage } = await fetchRegStatesLineage(sid, o, syn);
  const branches = Object.values(reg).map(b => ({
    branchId: b.branchId, status: b.status, label: b.label || null,
    baseSnapshotId: b.baseSnapshotId, parentBranchId: b.parentBranchId,
    createdAt: b.createdAt, lastExecutionAt: b.lastExecutionAt,
    executionBudgetMs: b.executionBudgetMs, operationsCount: b.operationsCount,
    hasSnapshot: !!states[b.branchId],
    hasLineage: !!lineage[b.branchId],
    promotedAt: b.promotedAt || null,
    discardedAt: b.discardedAt || null
  }));
  return { branches, totalCount: branches.length,
    activeCount: branches.filter(b => b.status === 'ACTIVE').length,
    promotedCount: branches.filter(b => b.status === 'PROMOTED').length,
    discardedCount: branches.filter(b => b.status === 'DISCARDED').length,
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

async function fetchRegStates(sid, o, syn) {
  const snap = await syn.snapshot(sid, o);
  const sf = snap.shared?.sharedFields || {};
  return { reg: sf.branchRegistry || {}, states: sf.branchStates || {} };
}

async function fetchRegLineage(sid, o, syn) {
  const snap = await syn.snapshot(sid, o);
  const sf = snap.shared?.sharedFields || {};
  return { reg: sf.branchRegistry || {}, lineage: sf.branchLineage || {} };
}

async function fetchRegStatesLineage(sid, o, syn) {
  const snap = await syn.snapshot(sid, o);
  const sf = snap.shared?.sharedFields || {};
  return { reg: sf.branchRegistry || {}, states: sf.branchStates || {}, lineage: sf.branchLineage || {} };
}

module.exports = { createSpeculativeVariantService };