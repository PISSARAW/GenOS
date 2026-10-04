'use strict';

/**
 * Transition Engine — applies a MorphogenesisPlan with host-provided compensation.
 *
 * Lifecycle: VALIDATE → SNAPSHOT → PREPARE → SPAWN/REBIND → MIGRATE → VERIFY → COMMIT
 * On any failure: ROLLBACK to the pre-transition snapshot.
 *
 * Produces a MorphogenesisReceipt with full provenance.
 */

const crypto = require('crypto');
const {
  getState, createSnapshot, rollback: rollbackSnapshot
} = require('../collectiveStateService');
const { emit } = require('../agentOrchestrationState');

function uuid() { return crypto.randomUUID(); }
function nowIso() { return new Date().toISOString(); }

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validatePlan(plan) {
  const errors = [];
  if (!plan) { errors.push('plan is required'); return errors; }
  if (!plan.id) errors.push('plan.id is required');
  if (!Array.isArray(plan.actions)) errors.push('plan.actions must be an array');
  if (plan.actions) {
    for (const [i, a] of plan.actions.entries()) {
      if (!a.type) errors.push(`actions[${i}].type is required`);
      if (!['spawn', 'retire', 'rebind'].includes(a.type)) {
        errors.push(`actions[${i}].type invalid: ${a.type}`);
      }
      if (a.continueOnFailure === true) errors.push(`actions[${i}].continueOnFailure is unsafe`);
      if (['retire', 'rebind'].includes(a.type) && !a.agentId) errors.push(`actions[${i}].agentId is required`);
    }
  }
  return errors;
}

function hasNoActiveConflict(plan, collectiveState) {
  if (!plan.conflictCheck) return true;
  const ids = plan.actions.filter((a) => a.type === 'retire').map((a) => a.agentId);
  for (const id of ids) {
    const agent = collectiveState.agents.get(id);
    if (!agent) return false;
    if (agent.status === 'terminating') return false;
  }
  return true;
}

function adapterErrors(plan, ctx) {
  // Host adapters own durable DB, workspace, and process effects; rollback adapters must undo them.
  const actions = new Set((Array.isArray(plan?.actions) ? plan.actions : []).map((action) => action.type));
  const errors = [];
  if (actions.has('spawn') && (typeof ctx.spawnAgent !== 'function' || typeof ctx.rollbackSpawnAgent !== 'function')) {
    errors.push('spawnAgent and rollbackSpawnAgent adapters are required');
  }
  if (actions.has('retire') && (typeof ctx.retireAgent !== 'function' || typeof ctx.rollbackRetireAgent !== 'function')) {
    errors.push('retireAgent and rollbackRetireAgent adapters are required');
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

function createStateSnapshot(collectiveState) {
  return {
    snapshotId: createSnapshot(),
    capturedAt: nowIso(),
    morphologyVersion: collectiveState.currentMorphologyVersion,
    agentCount: collectiveState.agents.size,
    serialized: serializeForReceipt(collectiveState)
  };
}

function serializeForReceipt(s) {
  return {
    mission: s.mission,
    topologyState: s.topologyState,
    currentMorphologyVersion: s.currentMorphologyVersion,
    agentIds: Array.from(s.agents.keys()),
    budgetTotal: s.budgets.total
  };
}

// ---------------------------------------------------------------------------
// State migration
// ---------------------------------------------------------------------------

function migrateState(ctx) {
  const { fromState, toState, plan } = ctx;
  const log = [];

  const targetOrg = plan.targetOrganization;
  if (targetOrg && toState.topologyState.organization !== targetOrg) {
    toState.topologyState = { ...toState.topologyState, organization: targetOrg };
    log.push({ op: 'set_organization', value: targetOrg });
  }

  const targetTopology = plan.targetTopology;
  if (targetTopology && toState.topologyState.topology !== targetTopology) {
    toState.topologyState = { ...toState.topologyState, topology: targetTopology };
    log.push({ op: 'set_topology', value: targetTopology });
  }

  const newVersion = (fromState.currentMorphologyVersion || 0) + 1;
  if (toState.currentMorphologyVersion !== newVersion) {
    toState.currentMorphologyVersion = newVersion;
    log.push({ op: 'bump_morphology_version', value: newVersion });
  }

  if (plan.budgetPatch) {
    toState.budgets = { ...toState.budgets, ...plan.budgetPatch };
    log.push({ op: 'patch_budget', value: plan.budgetPatch });
  }

  toState.updatedAt = nowIso();
  return log;
}

// ---------------------------------------------------------------------------
// Action executors
// ---------------------------------------------------------------------------

async function execSpawn(action, ctx) {
  const { db, parent, collectiveState, spawnAgent } = ctx;
  const parentAgentId = parent?.id || action.parentAgentId;
  if (!db || !parentAgentId) throw new Error('spawn requires a database and authorized parent agent');
  await require('../medical/missionQuarantineGate').assertMissionDispatchAllowed(db, parentAgentId);
  if (typeof spawnAgent !== 'function') throw new Error('spawn runtime adapter is required');
  const descriptor = await spawnAgent(action, { db, parentAgentId, collectiveState });
  if (descriptor?.started !== true || !descriptor.agentId) {
    throw new Error('spawn runtime adapter did not confirm a started worker');
  }
  if (collectiveState) {
    collectiveState.agents.set(descriptor.agentId, {
      id: descriptor.agentId,
      topology: action.topology || 'unknown',
      role: descriptor.role || action.role,
      status: 'active',
      capabilities: descriptor.capabilities || [],
      parent: parentAgentId
    });
  }
  return { agentId: descriptor.agentId, role: descriptor.role || action.role, descriptor };
}

async function execRetire(action, ctx) {
  const { agentId } = action;
  const { collectiveState, retireAgent } = ctx;
  const retired = await retireAgent(action, { ...ctx, collectiveState });
  if (retired?.retired !== true) throw new Error('retire runtime adapter did not confirm retirement');
  const state = collectiveState || getState();
  state.agents.delete(agentId);
  state.relationGraph?.delete(agentId);
  return { agentId, runtime: true };
}

async function execRebind(action, collectiveState) {
  const { agentId, targetRole, targetParent } = action;
  const state = collectiveState || getState();
  const agent = state.agents.get(agentId);
  if (!agent) throw new Error(`rebind: agent ${agentId} not found`);
  const previous = { role: agent.role, parent: agent.parent };
  agent.role = targetRole || agent.role;
  agent.parent = targetParent ?? agent.parent;
  if (action.addCapabilities) {
    const caps = new Set(agent.capabilities || []);
    for (const c of action.addCapabilities) caps.add(c);
    agent.capabilities = Array.from(caps);
  }
  state.agents.set(agentId, agent);
  return { agentId, previous, next: { role: agent.role, parent: agent.parent } };
}

async function runAction(action, ctx) {
  const startedAt = nowIso();
  try {
    let detail;
    if (action.type === 'spawn') detail = await execSpawn(action, ctx);
    else if (action.type === 'retire') detail = await execRetire(action, ctx);
    else if (action.type === 'rebind') detail = await execRebind(action, ctx.collectiveState);
    else throw new Error(`unknown action type: ${action.type}`);
    return { type: action.type, status: 'success', startedAt, finishedAt: nowIso(), detail };
  } catch (err) {
    return {
      type: action.type, status: 'failed', startedAt, finishedAt: nowIso(),
      error: err.message || String(err), agentId: action.agentId
    };
  }
}

// ---------------------------------------------------------------------------
// Verification helpers
// ---------------------------------------------------------------------------

function verifySpawn(a, postState, failures) {
  const actualId = a.actualAgentId || a.agentId;
  if (!actualId || !postState.agents.has(actualId)) failures.push(`spawn ${actualId || 'unknown'}: agent not in post-state`);
  if (a.agentId && a.actualAgentId && a.agentId !== a.actualAgentId) failures.push(`spawn ${a.agentId}: unexpected agent ${a.actualAgentId}`);
}

function verifyRetire(a, postState, failures) {
  if (a.agentId && postState.agents.has(a.agentId)) {
    failures.push(`retire ${a.agentId}: agent still present`);
  }
}

function verifyRebind(a, postState, failures) {
  const agent = a.agentId ? postState.agents.get(a.agentId) : null;
  if (a.agentId && !agent) {
    failures.push(`rebind ${a.agentId}: agent missing`);
  } else if (a.targetRole && agent.role !== a.targetRole) {
    failures.push(`rebind ${a.agentId}: role mismatch ${agent.role} != ${a.targetRole}`);
  }
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

function verifyTransition(ctx) {
  const { plan, preState, postState } = ctx;
  const failures = [];

  for (const [index, a] of plan.actions.entries()) {
    if (a.type === 'spawn') verifySpawn({ ...a, actualAgentId: ctx.actionsTaken?.[index]?.detail?.agentId }, postState, failures);
    else if (a.type === 'retire') verifyRetire(a, postState, failures);
    else if (a.type === 'rebind') verifyRebind(a, postState, failures);
  }

  if (plan.targetOrganization && postState.topologyState.organization !== plan.targetOrganization) {
    failures.push(`organization mismatch: ${postState.topologyState.organization}`);
  }
  if (plan.targetTopology && postState.topologyState.topology !== plan.targetTopology) {
    failures.push(`topology mismatch: ${postState.topologyState.topology}`);
  }

  return { verified: failures.length === 0, failures };
}

// ---------------------------------------------------------------------------
// Receipt builder
// ---------------------------------------------------------------------------

function buildReceipt(params) {
  const { transitionId, plan, preSnapshot, postSnapshot, actionsTaken, rollbackReceipt, committed } = params;
  return {
    transitionId,
    timestamp: nowIso(),
    plan: { id: plan?.id || transitionId, targetTopology: plan?.targetTopology || null, targetOrganization: plan?.targetOrganization || null, actionCount: plan?.actions?.length || 0 },
    preStateSnapshot: preSnapshot,
    postStateSnapshot: postSnapshot,
    actionsTaken,
    committed,
    rollbackReceipt,
    integrity: crypto.createHash('sha256')
      .update(JSON.stringify({ transitionId, actionsTaken, committed }))
      .digest('hex').slice(0, 16)
  };
}

async function executeTransition(ctx) {
  const { plan, collectiveState, db } = ctx;
  const transitionId = `tx-${uuid().slice(0, 8)}`;
  const actionsTaken = [];

  const validation = validateAndCheckConflict({ plan, collectiveState, transitionId });
  const errors = [...(validation.errors || []), ...adapterErrors(plan, ctx)];
  if (!validation.valid || errors.length) {
    return { ...buildReceipt({ transitionId, plan, preSnapshot: null, postSnapshot: null, actionsTaken: [], rollbackReceipt: null, committed: false }), errors };
  }

  const state = collectiveState || getState();
  const preSnapshot = createStateSnapshot(state);
  const morphCtx = {
    ...ctx, db, parent: ctx.parent, transitionId, collectiveState: state
  };
  const compensations = [];
  emitTransitionStart({ transitionId, plan });

  try {
    await executeActions({ plan, morphCtx, actionsTaken, compensations });
    const migrationLog = migrateState({ fromState: state, toState: state, plan });
    if (migrationLog.length) emitMigration({ transitionId, migrationLog });
    await verifyAndCommit({ plan, collectiveState: state, preSnapshot, transitionId, actionsTaken });
    return buildReceipt({ transitionId, plan, preSnapshot, postSnapshot: createStateSnapshot(state), actionsTaken, rollbackReceipt: null, committed: true });
  } catch (err) {
    return handleRollback({ err, preSnapshot, transitionId, plan, actionsTaken, compensations, morphCtx });
  }
}

function validateAndCheckConflict(input) {
  const { plan, collectiveState, transitionId } = input;
  const errors = validatePlan(plan);
  if (errors.length > 0) return { valid: false, errors };
  if (!hasNoActiveConflict(plan, collectiveState)) throw new Error('active_conflict: retiring agent already terminating');
  return { valid: true };
}

function emitTransitionStart(input) {
  const { transitionId, plan } = input;
  const morphCtx = { db: null, parent: null, transitionId, collectiveState: null };
  emit('system', 'MORPHOGENESIS_TRANSITION_START', 'TRANSITION',
    `Transition ${transitionId} started for plan ${plan.id}`,
    { transitionId, planId: plan.id, actionCount: plan.actions.length }, 'info');
}

async function executeActions(input) {
  const { plan, morphCtx, actionsTaken, compensations } = input;
  for (const action of plan.actions) {
    const result = await runAction(action, morphCtx);
    actionsTaken.push(result);
    if (result.status === 'success' && ['spawn', 'retire'].includes(action.type)) {
      compensations.push({ action, result });
    }
    if (result.status === 'failed') throw new Error(`action ${action.type} failed: ${result.error}`);
  }
}

function emitMigration(input) {
  const { transitionId, migrationLog } = input;
  emit('system', 'MORPHOGENESIS_STATE_MIGRATED', 'MIGRATE',
    `State migration applied: ${migrationLog.length} change(s)`,
    { transitionId, log: migrationLog }, 'info');
}

async function verifyAndCommit(input) {
  const { plan, collectiveState, preSnapshot, transitionId, actionsTaken } = input;
  const verification = verifyTransition({ plan, preState: preSnapshot, postState: collectiveState, actionsTaken });
  if (!verification.verified) throw new Error(`verification failed: ${verification.failures.join('; ')}`);
  emit('system', 'MORPHOGENESIS_TRANSITION_COMMIT', 'COMMIT',
    `Transition ${transitionId} committed`, { transitionId, planId: plan.id }, 'info');
}

async function compensateActions(compensations, ctx, cause) {
  const errors = [];
  for (const item of compensations.slice().reverse()) {
    try {
      const compensate = item.action.type === 'spawn' ? ctx.rollbackSpawnAgent : ctx.rollbackRetireAgent;
      await compensate(item.action, { ...ctx, cause, actionResult: item.result });
    } catch (error) {
      errors.push(error.message || String(error));
    }
  }
  return errors;
}

async function handleRollback(input) {
  const { err, preSnapshot, transitionId, plan, actionsTaken, compensations, morphCtx } = input;
  emit('system', 'MORPHOGENESIS_TRANSITION_ROLLBACK', 'ROLLBACK',
    `Transition ${transitionId} rolling back: ${err.message}`, { transitionId, error: err.message }, 'error');
  let rollbackReceipt = null;
  if (preSnapshot) {
    const compensationErrors = await compensateActions(compensations, morphCtx, err.message);
    const rolledBack = rollbackSnapshot(preSnapshot.snapshotId);
    rollbackReceipt = {
      rolledBack: rolledBack && compensationErrors.length === 0,
      memoryRestored: rolledBack,
      externalCompensated: compensationErrors.length === 0,
      compensationErrors,
      targetSnapshotId: preSnapshot.snapshotId,
      triggeredBy: err.message,
      timestamp: nowIso()
    };
  }
  return buildReceipt({ transitionId, plan, preSnapshot, postSnapshot: null, actionsTaken, rollbackReceipt, committed: false });
}

async function rollback(ctx) {
  const { snapshotId, collectiveState } = ctx;
  const rolledBack = rollbackSnapshot(snapshotId);
  return {
    rolledBack,
    targetSnapshotId: snapshotId,
    timestamp: nowIso(),
    morphologyVersion: collectiveState.currentMorphologyVersion
  };
}

module.exports = {
  executeTransition,
  rollback,
  verifyTransition,
  createSnapshot: createStateSnapshot,
  migrateState,
  validatePlan,
  buildReceipt
};
