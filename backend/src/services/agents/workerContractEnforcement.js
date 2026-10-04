'use strict';

const workerKinds = require('./workerKindService');

const AUTHORITY_TOOLS = Object.freeze({
  spawn: ['genos_create', 'genos_fork', 'genos_delegate_worker'],
  promote: ['genos_record_decision', 'genos_merge'],
  topology: ['genos_change_organization', 'genos_topology_session'],
  strategy: ['genos_change_strategy'],
  write: ['genos_run', 'genos_execute_primitive'],
  read: ['genos_inspect', 'genos_memory_query', 'genos_search_failures', 'genos_evidence_check', 'genos_validate', 'genos_diff', 'genos_organization_state', 'genos_philosophy', 'genos_lineage', 'genos_blame'],
  analyze: ['genos_diagnose', 'genos_hypothesis_evidence', 'genos_evaluate_trajectories', 'genos_adversarial_review', 'genos_security_coevolution'],
  execute: ['genos_snapshot', 'genos_replay', 'genos_test', 'genos_solve', 'genos_browser_act', 'genos_optimal_foraging', 'genos_computer_use', 'genos_execute_strategy_pipeline'],
  communicate: ['genos_worker_publish', 'genos_worker_inbox']
});

function contractError(kind, action) {
  const error = new Error(`Worker kind '${kind}' is not authorized for '${action}'.`);
  error.code = 'WORKER_CONTRACT_DENIED';
  return error;
}

function toolAction(toolName, args = {}) {
  const name = String(toolName || '').trim().toLowerCase();
  if (name === 'genos_topology_session' && args.operation === 'events') return 'topology_read';
  for (const [action, tools] of Object.entries(AUTHORITY_TOOLS)) {
    if (tools.includes(name)) return action;
  }
  return 'unknown';
}

function assertWorkerToolAllowed(contract, toolName, args = {}) {
  const kind = contract?.identity?.workerKind;
  const action = toolAction(toolName, args);
  if (!kind || !workerKinds.KINDS[kind]) throw contractError(kind || 'unknown', action);
  if (action === 'topology_read') {
    const authorizedSessionId = contract.mission?.topologySessionId;
    const requestedSessionId = args.session_id || args.sessionId;
    if (!authorizedSessionId || requestedSessionId !== authorizedSessionId) {
      throw contractError(kind, action);
    }
    return true;
  }
  if (!contract.authority?.[action]) throw contractError(kind, action);
  return true;
}

async function enforcePersistedWorkerTool(db, agentId, toolCall) {
  const normalizedCall = typeof toolCall === 'string' ? { toolName: toolCall, args: {} } : (toolCall || {});
  const { toolName, args = {} } = normalizedCall;
  const agent = await db.get('SELECT execution_mode, metadata_json, role, parent_agent_id FROM agents WHERE id = ?', agentId);
  if (!agent || agent.execution_mode !== 'worker') return true;
  const metadata = parseWorkerMetadata(agent, toolName);
  const kind = workerKinds.resolveWorkerKind(metadata.workerKind, agent.role);
  const contract = metadata.workerContract || workerKinds.buildWorkerContract(kind, { topologySessionId: metadata.topologySessionId });
  if (contract.identity?.workerKind !== kind) throw contractError('unknown', toolAction(toolName));
  assertRuntimeContract(contract, kind);
  assertParentBinding(contract, agent);
  assertTopologySessionScope({ toolName, args, metadata, kind });
  return assertWorkerToolAllowed(contract, toolName, args);
}

function parseWorkerMetadata(agent, toolName) {
  try { return typeof agent.metadata_json === 'string' ? JSON.parse(agent.metadata_json) : agent.metadata_json || {}; }
  catch (_) { throw contractError('unknown', toolAction(toolName)); }
}

function assertParentBinding(contract, agent) {
  if (contract.identity?.parentId !== (agent.parent_agent_id || null)) {
    throw invalidWorkerContract('Persisted worker parent does not match the agent record.');
  }
}

function assertTopologySessionScope(input) {
  const { toolName, args, metadata, kind } = input;
  if (toolAction(toolName, args) !== 'topology_read') return;
  if (!metadata.topologySessionId || (args.session_id || args.sessionId) !== metadata.topologySessionId) {
    throw contractError(kind, 'topology_read');
  }
}

function assertRuntimeContract(contract, kind) {
  if (!contract || contract.version !== 1 || contract.identity?.workerKind !== kind) {
    throw Object.assign(new Error('Worker runtime contract identity is invalid.'), { code: 'INVALID_WORKER_CONTRACT' });
  }
  workerKinds.assertMethodCompatibility(kind, contract.mission?.methodContract);
  if (contract.assignment?.workerKind && contract.assignment.workerKind !== kind) {
    throw Object.assign(new Error('Worker assignment and runtime contract select different kinds.'), { code: 'INVALID_WORKER_CONTRACT' });
  }
  assertNoUnsupportedDelegation(contract, kind);
  if (kind === 'sub_orchestrator' && !validSubOrchestratorContract(contract)) {
    throw Object.assign(new Error('Sub-orchestrator delegation contract is missing, expired, or outside its limits.'), { code: 'UNSUPPORTED_WORKER_DELEGATION' });
  }
  assertCanonicalCeilings(contract, kind);
  return true;
}

function invalidWorkerContract(message) {
  return Object.assign(new Error(message), { code: 'INVALID_WORKER_CONTRACT' });
}

function exceedsCeiling(value, ceiling) {
  if (ceiling === null) return value !== null && (!Number.isFinite(value) || value < 0);
  return !Number.isFinite(value) || value < 0 || value > ceiling;
}

function assertCanonicalCeilings(contract, kind) {
  const canonical = workerKinds.buildWorkerContract(kind, {
    ...contract.mission, workerAssignment: contract.assignment,
    parentAgentId: contract.identity.parentId
  });
  assertAuthorityCeiling(contract, canonical, kind);
  assertBudgetCeilings(contract.resources, canonical.resources);
  assertBudgetCeilings(contract.limits, canonical.limits);
  assertEvidenceCeiling(contract.evidence, canonical.evidence);
  const capabilities = canonical.expressedCapabilities;
  if (contract.expressedCapabilities?.some((capability) => !capabilities.includes(capability))) {
    throw invalidWorkerContract('Worker contract declares an unsupported capability.');
  }
}

function assertAuthorityCeiling(contract, canonical, kind) {
  const allowedDelegation = kind === 'sub_orchestrator' && validSubOrchestratorContract(contract);
  for (const [action, granted] of Object.entries(contract.authority || {})) {
    if (granted !== true || canonical.authority[action] === true) continue;
    if (allowedDelegation && ['spawn', 'delegate'].includes(action)) continue;
    throw invalidWorkerContract(`Worker contract grants '${action}' beyond its canonical authority.`);
  }
}

function assertEvidenceCeiling(actual, canonical) {
  if (actual?.provenanceRequired !== true) {
    throw invalidWorkerContract('Worker contract must retain provenance requirements.');
  }
  for (const artifact of canonical.requiredArtifacts) {
    if (!actual?.requiredArtifacts?.includes(artifact)) {
      throw invalidWorkerContract(`Worker contract omits required '${artifact}' evidence.`);
    }
  }
}

function assertBudgetCeilings(actual, canonical) {
  for (const [name, ceiling] of Object.entries(canonical)) {
    if (ceiling === null || typeof ceiling === 'number') {
      if (exceedsCeiling(actual?.[name], ceiling)) {
        throw invalidWorkerContract(`Worker contract exceeds the '${name}' budget.`);
      }
    }
  }
}

function assertAssignmentMatches(contract, request) {
  const assignment = contract?.assignment;
  if (!assignment) return true;
  if (assignment.workerKind !== contract.identity?.workerKind) {
    throw Object.assign(new Error('Persisted assignment kind does not match the runtime contract.'), { code: 'INVALID_WORKER_CONTRACT' });
  }
  const expected = contract.mission?.methodContract;
  const actual = request?.methodContract;
  if (expected?.methodId && actual?.methodId !== expected.methodId) {
    throw Object.assign(new Error('Dispatched method does not match the persisted worker assignment.'), { code: 'WORKER_METHOD_MISMATCH' });
  }
  return true;
}

function assertNoUnsupportedDelegation(contract, kind) {
  if (kind === 'sub_orchestrator') return;
  if (contract.authority?.spawn || contract.authority?.delegate || contract.spawnBudget || contract.delegationDepth) {
    throw Object.assign(new Error('Node worker dispatch does not support nested spawn or delegation.'), { code: 'UNSUPPORTED_WORKER_DELEGATION' });
  }
}

function validSubOrchestratorContract(contract) {
  if (delegationIsDisabled(contract)) return true;
  return contract.authority?.spawn === true && contract.authority?.delegate === true
    && contract.spawnBudget >= 1 && contract.spawnBudget <= 5
    && contract.delegationDepth === 1 && contract.limits?.maxChildren === contract.spawnBudget
    && contract.limits?.maxTokens <= 10000 && Number.isFinite(contract.delegationExpiresAt)
    && Date.now() < contract.delegationExpiresAt;
}

function delegationIsDisabled(contract) {
  return contract.authority?.spawn !== true && contract.authority?.delegate !== true
    && contract.spawnBudget === 0 && contract.delegationDepth === 0;
}

module.exports = { AUTHORITY_TOOLS, toolAction, assertWorkerToolAllowed, enforcePersistedWorkerTool, assertRuntimeContract, assertAssignmentMatches };
