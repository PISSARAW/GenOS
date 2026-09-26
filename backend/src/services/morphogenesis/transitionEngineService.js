'use strict';

/**
 * Transactional Transition Engine — applies a MorphogenesisPlan atomically.
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
const { incarnateAgent } = require('../agents/agentIncarnationService');
const { terminateChild } = require('../processTermination');
const { activeProcesses, emit } = require('../agentOrchestrationState');

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
  const { db, parent, collectiveState } = ctx;
  const request = {
    role: action.role,
    mission: action.mission || { prompt: action.prompt || 'morphogenesis-spawned' },
    capabilityManifest: action.capabilityManifest || {},
    phenotype: action.phenotype || {},
    agentId: action.agentId,
    parentAgentId: parent?.id,
    workspace: action.workspace
  };
  const descriptor = await incarnateAgent({ request, ctx: { db } });
  if (collectiveState) {
    collectiveState.agents.set(descriptor.agentId, {
      id: descriptor.agentId,
      topology: action.topology || 'unknown',
      role: descriptor.role,
      status: 'active',
      capabilities: descriptor.capabilities || [],
      parent: parent?.id
    });
  }
  return { agentId: descriptor.agentId, role: descriptor.role, descriptor };
}

async function execRetire(action, collectiveState) {
  const { agentId } = action;
  const child = activeProcesses.get(agentId);
  if (child) {
    terminateChild(child);
    activeProcesses.delete(agentId);
  }
  const state = collectiveState || getState();
  state.agents.delete(agentId);
  state.relationGraph?.delete(agentId);
  return { agentId, runtime: Boolean(child) };
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
    else if (action.type === 'retire') detail = await execRetire(action, ctx.collectiveState);
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
  if (a.agentId && !postState.agents.has(a.agentId)) {
    failures.push(`spawn ${a.agentId}: agent not in post-state`);
  }
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

  for (const a of plan.actions) {
    if (a.type === 'spawn') verifySpawn(a, postState, failures);
    else if (a.type === 'retire') verifyRetire(a, postState, failures);
    else if (a.type === 'rebind') verifyRebind(a, postState, failures);
  }

  if (plan.targetOrganization && postState.topologyState.organization !== plan.targetOrganization) {
    failures.push(`topology organization mismatch: ${postState.topologyState.organization}`);
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
    plan: { id: plan?.id || transitionId, targetOrganization: plan?.targetOrganization || 'unknown', actionCount: plan?.actions?.length || 0 },
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

// ---------------------------------------------------------------------------
// Main entry point — executeTransition
// ---------------------------------------------------------------------------

async function executeTransition(ctx) {
  const { plan, collectiveState, db } = ctx;
  const transitionId = `tx-${uuid().slice(0, 8)}`;
  const actionsTaken = [];
  let preSnapshot = null;
  let postSnapshot = null;
  let rollbackReceipt = null;

  const validation = validateAndCheckConflict({ plan, collectiveState, transitionId });
  if (!validation.valid) return buildReceipt({ transitionId, plan, preSnapshot: null, postSnapshot: null, actionsTaken: [], rollbackReceipt: null, committed: false });

  preSnapshot = createStateSnapshot(collectiveState);
  const morphCtx = { db, parent: ctx.parent, transitionId, collectiveState: collectiveState || getState() };
  emitTransitionStart({ transitionId, plan });

  try {
    await executeActions({ plan, morphCtx, actionsTaken });
    const migrationLog = migrateState({ fromState: collectiveState, toState: collectiveState, plan });
    if (migrationLog.length) emitMigration({ transitionId, migrationLog });
    await verifyAndCommit({ plan, collectiveState, preSnapshot, transitionId });
    return buildReceipt({ transitionId, plan, preSnapshot, postSnapshot: createStateSnapshot(collectiveState), actionsTaken, rollbackReceipt: null, committed: true });
  } catch (err) {
    return handleRollback({ err, preSnapshot, transitionId, plan, actionsTaken });
  }
}

function validateAndCheckConflict(input) {
  const { plan, collectiveState, transitionId } = input;
  const errors = validatePlan(plan);
  if (errors.length > 0) return { valid: false };
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
  const { plan, morphCtx, actionsTaken } = input;
  for (const action of plan.actions) {
    const result = await runAction(action, morphCtx);
    actionsTaken.push(result);
    if (result.status === 'failed' && !action.continueOnFailure) throw new Error(`action ${action.type} failed: ${result.error}`);
  }
}

function emitMigration(input) {
  const { transitionId, migrationLog } = input;
  emit('system', 'MORPHOGENESIS_STATE_MIGRATED', 'MIGRATE',
    `State migration applied: ${migrationLog.length} change(s)`,
    { transitionId, log: migrationLog }, 'info');
}

async function verifyAndCommit(input) {
  const { plan, collectiveState, preSnapshot, transitionId } = input;
  const verification = verifyTransition({ plan, preState: preSnapshot, postState: collectiveState });
  if (!verification.verified) throw new Error(`verification failed: ${verification.failures.join('; ')}`);
  emit('system', 'MORPHOGENESIS_TRANSITION_COMMIT', 'COMMIT',
    `Transition ${transitionId} committed`, { transitionId, planId: plan.id }, 'info');
}

function handleRollback(input) {
  const { err, preSnapshot, transitionId, plan, actionsTaken } = input;
  emit('system', 'MORPHOGENESIS_TRANSITION_ROLLBACK', 'ROLLBACK',
    `Transition ${transitionId} rolling back: ${err.message}`, { transitionId, error: err.message }, 'error');
  let rollbackReceipt = null;
  if (preSnapshot) {
    const rolledBack = rollbackSnapshot(preSnapshot.snapshotId);
    rollbackReceipt = { rolledBack, targetSnapshotId: preSnapshot.snapshotId, triggeredBy: err.message, timestamp: nowIso() };
  }
  return buildReceipt({ transitionId, plan, preSnapshot, postSnapshot: null, actionsTaken, rollbackReceipt, committed: false });
}

// ---------------------------------------------------------------------------
// Public rollback entry point
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  executeTransition,
  rollback,
  verifyTransition,
  createSnapshot: createStateSnapshot,
  migrateState,
  validatePlan,
  buildReceipt
};
