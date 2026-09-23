'use strict';

/**
 * Sub-Orchestrator Service — bounded role escalation with explicit leases.
 *
 * Workers may request escalation to SubOrchestrator when task complexity
 * exceeds their bounded authority. The parent orchestrator evaluates the
 * request, grants a scoped lease, and the promoted agent operates within
 * strict bounds: spawn workers, organize local subgraph, evaluate evidence
 * — but CANNOT change global topology, promote others, or exceed budget.
 */

const crypto = require('crypto');
const { getPhenotype, canSpawn } = require('./phenotypeRegistryService');
const { emit, updateAgent } = require('../agentOrchestrationState');
const { incarnateAgent } = require('./agentIncarnationService');
const { getState, updateAgent: updateCollectiveAgent, addRelation } = require('../collectiveStateService');

const SUB_ORCH_PHENOTYPE = 'SubOrchestrator';
const SUB_ORCH_LEASE_TOOLS = [
  'genos_search_failures',
  'genos_diagnose',
  'genos_hypothesis_evidence',
  'genos_snapshot',
  'genos_diff',
  'genos_evaluate_trajectories',
  'genos_record_experience',
  'genos_replay',
  'genos_organization_state',
  'genos_worker_publish',
  'genos_worker_inbox',
  'genos_delegate_worker',
  'genos_report_progress',
  'genos_philosophy'
];

const GLOBAL_ONLY_TOOLS = [
  'genos_fork',
  'genos_create',
  'genos_solve',
  'genos_merge',
  'genos_adversarial_review',
  'genos_compile_memory',
  'genos_resilience_hypermutation',
  'genos_security_coevolution',
  'genos_a_team_preview',
  'genos_trinity_launch',
  'genos_change_strategy',
  'genos_change_organization',
  'genos_record_decision'
];

const ESCALATION_REASONS = Object.freeze({
  COMPLEXITY: 'task_complexity',
  FANOUT: 'required_fanout',
  BUDGET: 'budget_needed',
  SCOPE: 'scope_expansion'
});

function uuid() { return crypto.randomUUID(); }
function safeArray(v) { return Array.isArray(v) ? v : []; }
function nowIso() { return new Date().toISOString(); }

function defaultLease() {
  const phenotype = getPhenotype(SUB_ORCH_PHENOTYPE);
  return {
    scope: null,
    maxDepth: phenotype ? phenotype.delegationDepth : 1,
    maxChildren: phenotype ? phenotype.spawnBudget : 5,
    maxTokens: 10000,
    allowedPhenotypes: ['BoundedWorker', 'AdaptiveWorker', 'ScoutCell', 'Verifier'],
    allowedTopologies: ['subgraph', 'fan_out', 'pipeline'],
    expiry: null,
    grantedAt: null,
    revokedAt: null
  };
}

function buildLease(params) {
  const base = defaultLease();
  const lease = { ...base, ...params };
  lease.grantedAt = lease.grantedAt || nowIso();
  lease.expiry = lease.expiry || Date.now() + 3600000;
  return lease;
}

function leaseExpired(lease) {
  if (!lease || !lease.expiry) return false;
  return Date.now() > lease.expiry;
}

function validateWorker(workerId, worker) {
  if (!worker) return { status: 'denied', reason: 'worker_not_found', workerId };
  const phenotype = getPhenotype(worker.phenotype);
  if (!phenotype) return { status: 'denied', reason: 'unknown_phenotype', workerId };
  if (phenotype.authorityProfile.spawn) return { status: 'denied', reason: 'already_has_spawn', workerId };
  return null;
}

function buildEscalationRequest(ctx) {
  return {
    workerId: ctx.workerId,
    reason: ctx.reason || ESCALATION_REASONS.COMPLEXITY,
    taskComplexity: ctx.taskComplexity || 0,
    requiredFanout: ctx.requiredFanout || 0,
    budgetNeeded: ctx.budgetNeeded || 0,
    scope: ctx.scope || null,
    requestedAt: nowIso()
  };
}

// requestEscalation — worker requests promotion
function requestEscalation(ctx) {
  if (!ctx || !ctx.workerId) {
    throw new Error('requestEscalation requires ctx.workerId');
  }
  const worker = getState().agents.get(ctx.workerId);
  const validation = validateWorker(ctx.workerId, worker);
  if (validation) return validation;
  const request = buildEscalationRequest(ctx);
  try {
    emit(ctx.workerId, 'ESCALATION_REQUESTED', 'ESCALATION',
      `Worker ${ctx.workerId} requests escalation: ${request.reason}`,
      { workerId: ctx.workerId, reason: request.reason }, 'info');
  } catch (_) {}
  return { status: 'pending', request };
}

function denyFanout(request, currentLoad) {
  const maxFanout = currentLoad?.maxFanoutRemaining || 0;
  if (request.requiredFanout > maxFanout) {
    return { decision: 'deny', reason: 'fanout_exceeds_capacity', maxAvailable: maxFanout };
  }
  return null;
}

function denyBudget(request, budget) {
  const availableBudget = budget?.remaining || 0;
  if (request.budgetNeeded > availableBudget) {
    return { decision: 'deny', reason: 'insufficient_budget', availableBudget };
  }
  return null;
}

// evaluateEscalation — parent orchestrator evaluates request
function evaluateEscalation(ctx) {
  if (!ctx || !ctx.request) {
    return { decision: 'deny', reason: 'invalid_context' };
  }
  const { request, budget, currentLoad } = ctx;
  const phenotype = getPhenotype(SUB_ORCH_PHENOTYPE);
  if (!phenotype || !phenotype.authorityProfile.spawn) {
    return { decision: 'deny', reason: 'sub_orchestrator_phenotype_invalid' };
  }
  const fanoutDeny = denyFanout(request, currentLoad);
  if (fanoutDeny) return fanoutDeny;
  const budgetDeny = denyBudget(request, budget);
  if (budgetDeny) return budgetDeny;
  if (request.taskComplexity < 3) {
    return { decision: 'deny', reason: 'complexity_below_threshold' };
  }
  const suggestedLease = buildLease({
    scope: request.scope,
    maxChildren: Math.min(request.requiredFanout, phenotype.spawnBudget),
    maxTokens: Math.min(request.budgetNeeded, budget?.remaining || 0)
  });
  return { decision: 'grant', lease: suggestedLease, reason: 'escalation_approved' };
}

function grantPreconditions(worker, lease) {
  if (!worker) return { status: 'failed', reason: 'worker_not_found' };
  const activeChildren = safeArray(worker.children).length;
  if (activeChildren >= lease.maxChildren) return { status: 'failed', reason: 'max_children_reached' };
  if (leaseExpired(lease)) return { status: 'failed', reason: 'lease_expired' };
  return null;
}

// grantLease — promote worker with scoped lease
function grantLease(ctx) {
  if (!ctx || !ctx.workerId || !ctx.lease) {
    throw new Error('grantLease requires ctx.workerId and ctx.lease');
  }
  const { workerId, lease } = ctx;
  const worker = getState().agents.get(workerId);
  const precheck = grantPreconditions(worker, lease);
  if (precheck) return precheck;
  const subOrchestratorId = `suborch-${uuid().slice(0, 8)}`;
  const updatedLease = {
    ...lease,
    scope: lease.scope || { domain: worker.workspace || 'default' },
    grantedAt: nowIso()
  };
  updateCollectiveAgent(workerId, {
    phenotype: SUB_ORCH_PHENOTYPE,
    lease: updatedLease,
    children: safeArray(worker.children)
  });
  try { updateAgent(workerId, 'promoted', 'Sub-Orchestrator promotion'); } catch (_) {}
  try {
    emit(workerId, 'LEASE_GRANTED', 'ESCALATION',
      `Lease granted to ${workerId} as ${subOrchestratorId}`,
      { workerId, subOrchestratorId, lease: updatedLease }, 'info');
  } catch (_) {}
  return { status: 'granted', subOrchestratorId, workerId, lease: updatedLease };
}

// buildToolLease — restricted tool set for sub-orchestrator
function addTopologyTools(base, lease) {
  const allowedSet = new Set(safeArray(lease.allowedTopologies));
  if (allowedSet.has('fan_out')) base.push('genos_delegate_worker');
  return base;
}

function buildToolLease(lease) {
  const base = addTopologyTools([...SUB_ORCH_LEASE_TOOLS], lease);
  return base.filter((t) => GLOBAL_ONLY_TOOLS.indexOf(t) === -1);
}

// canSpawnWorker — check if sub-orchestrator can spawn more workers
function canSpawnWorker(subOrch) {
  if (!subOrch) return { ok: false, reason: 'no_sub_orchestrator' };
  if (!subOrch.lease) return { ok: false, reason: 'no_lease' };
  if (leaseExpired(subOrch.lease)) return { ok: false, reason: 'lease_expired' };
  const children = safeArray(subOrch.children).length;
  if (children >= subOrch.lease.maxChildren) {
    return { ok: false, reason: 'max_children_reached', current: children, max: subOrch.lease.maxChildren };
  }
  return { ok: true, remaining: subOrch.lease.maxChildren - children };
}

// createSubOrchestrator — instantiate the promoted agent
function createSubOrchestrator(ctx) {
  if (!ctx || !ctx.workerId || !ctx.lease) {
    throw new Error('createSubOrchestrator requires ctx.workerId and ctx.lease');
  }
  const { workerId, lease, db } = ctx;
  const phenotype = getPhenotype(SUB_ORCH_PHENOTYPE);
  if (!phenotype || !canSpawn(SUB_ORCH_PHENOTYPE)) {
    return { status: 'failed', reason: 'phenotype_cannot_spawn' };
  }
  const leaseTools = buildToolLease(lease);
  const spawnRequest = {
    role: 'sub_orchestrator',
    capabilityManifest: { owned: safeArray(lease.allowedPhenotypes) },
    mission: {
      prompt: `Sub-Orchestrator for scope: ${JSON.stringify(lease.scope)}. ` +
        `Max children: ${lease.maxChildren}, Max depth: ${lease.maxDepth}, ` +
        `Max tokens: ${lease.maxTokens}. ` +
        'Spawn workers, organize local subgraph, evaluate evidence. ' +
        'CANNOT change global topology, promote agents, or exceed lease bounds.',
      executionPolicy: { allowFileEdits: false }
    },
    phenotype: { genomeRef: `suborch-${workerId}` },
    budget: { tokens: lease.maxTokens },
    workspace: { organizationId: lease.scope?.organizationId, projectId: lease.scope?.projectId },
    providedLease: leaseTools,
    parentAgentId: workerId
  };
  let descriptor;
  try {
    descriptor = incarnateAgent({ request: spawnRequest, ctx: { db, parent: { id: workerId } } });
  } catch (err) {
    return { status: 'failed', reason: 'incarnation_failed', error: err.message };
  }
  const collectiveState = getState();
  const worker = collectiveState.agents.get(workerId);
  if (worker) {
    const children = safeArray(worker.children);
    children.push(descriptor.agentId);
    updateCollectiveAgent(workerId, { children });
    addRelation(workerId, descriptor.agentId, { type: 'subordinates', lease });
  }
  try {
    emit(descriptor.agentId, 'SUB_ORCHESTRATOR_CREATED', 'ESCALATION',
      `Sub-Orchestrator ${descriptor.agentId} created from ${workerId}`,
      { workerId, agentId: descriptor.agentId }, 'info');
  } catch (_) {}
  return { status: 'created', subOrchestratorId: descriptor.agentId, workerId, lease, toolLease: leaseTools, descriptor };
}

// revokeLease — terminate sub-orchestrator role
function revokeLease(ctx) {
  if (!ctx || !ctx.subOrchestratorId) {
    throw new Error('revokeLease requires ctx.subOrchestratorId');
  }
  const { subOrchestratorId, reason } = ctx;
  const collectiveState = getState();
  const subOrch = collectiveState.agents.get(subOrchestratorId);
  if (!subOrch) {
    return { status: 'failed', reason: 'sub_orchestrator_not_found' };
  }
  const revokedLease = { ...subOrch.lease, revokedAt: nowIso(), revocationReason: reason };
  updateCollectiveAgent(subOrchestratorId, { phenotype: 'BoundedWorker', lease: revokedLease, children: [] });
  try {
    updateAgent(subOrchestratorId, 'demoted', `Revoked: ${reason || 'no_reason'}`);
  } catch (_) {}
  try {
    emit(subOrchestratorId, 'LEASE_REVOKED', 'ESCALATION',
      `Lease revoked for ${subOrchestratorId}: ${reason || 'no_reason'}`,
      { subOrchestratorId, reason }, 'warn');
  } catch (_) {}
  return { status: 'revoked', subOrchestratorId, reason: reason || 'no_reason', revokedAt: revokedLease.revokedAt };
}

function registerChildWorker(subOrchestratorId, descriptor) {
  const subOrch = getState().agents.get(subOrchestratorId);
  const children = safeArray(subOrch ? subOrch.children : []);
  children.push(descriptor.agentId);
  updateCollectiveAgent(subOrchestratorId, { children });
  addRelation(subOrchestratorId, descriptor.agentId, { type: 'child_worker' });
  try {
    emit(subOrchestratorId, 'WORKER_SPAWNED', 'ESCALATION',
      `Spawned worker ${descriptor.agentId} from ${subOrchestratorId}`,
      { subOrchestratorId, workerId: descriptor.agentId }, 'info');
  } catch (_) {}
}

// spawnWorkerFromSubOrch — spawn a worker within lease bounds
function spawnWorkerFromSubOrch(ctx) {
  if (!ctx || !ctx.subOrchestratorId || !ctx.workerRequest) {
    throw new Error('spawnWorkerFromSubOrch requires ctx.subOrchestratorId and ctx.workerRequest');
  }
  const { subOrchestratorId, workerRequest, db } = ctx;
  const subOrch = getState().agents.get(subOrchestratorId);
  if (!subOrch) {
    return { status: 'failed', reason: 'sub_orchestrator_not_found' };
  }
  const spawnCheck = canSpawnWorker(subOrch);
  if (!spawnCheck.ok) {
    return { status: 'denied', reason: spawnCheck.reason };
  }
  const spawnReq = {
    ...workerRequest,
    role: workerRequest.role || 'worker',
    parentAgentId: subOrchestratorId,
    workspace: subOrch.lease?.scope,
    budget: { tokens: Math.floor((subOrch.lease?.maxTokens || 10000) / (subOrch.lease?.maxChildren || 1)) }
  };
  let descriptor;
  try {
    descriptor = incarnateAgent({ request: spawnReq, ctx: { db, parent: { id: subOrchestratorId } } });
  } catch (err) {
    return { status: 'failed', reason: 'incarnation_failed', error: err.message };
  }
  registerChildWorker(subOrchestratorId, descriptor);
  return { status: 'spawned', workerId: descriptor.agentId, subOrchestratorId, descriptor };
}

module.exports = {
  requestEscalation,
  evaluateEscalation,
  grantLease,
  createSubOrchestrator,
  revokeLease,
  spawnWorkerFromSubOrch,
  canSpawnWorker,
  buildLease,
  buildToolLease,
  leaseExpired,
  SUB_ORCH_PHENOTYPE,
  SUB_ORCH_LEASE_TOOLS,
  GLOBAL_ONLY_TOOLS
};
