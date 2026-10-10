'use strict';

const { isDeepStrictEqual } = require('node:util');
const workerKinds = require('./workerKindService');

const AUTHORITY_TOOLS = Object.freeze({
  spawn: ['genos_create', 'genos_fork', 'genos_delegate_worker'],
  promote: ['genos_record_decision', 'genos_merge'],
  topology: ['genos_change_organization'],
  topologySession: ['genos_topology_session'],
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
  if (!kind || !Object.hasOwn(workerKinds.KINDS, kind)) throw contractError(kind || 'unknown', action);
  if (String(toolName).toLowerCase() === 'genos_topology_session'
    && (!contract.mission?.topologySessionId
      || (args.session_id || args.sessionId) !== contract.mission.topologySessionId)) {
    throw contractError(kind, action);
  }
  if (action === 'topology_read') return true;
  if (!contract.authority?.[action]) throw contractError(kind, action);
  return true;
}

async function enforcePersistedWorkerTool(db, agentId, toolCall) {
  const normalizedCall = typeof toolCall === 'string' ? { toolName: toolCall, args: {} } : (toolCall || {});
  const { toolName, args = {} } = normalizedCall;
  const agent = await db.get('SELECT execution_mode, metadata_json, role, parent_agent_id FROM agents WHERE id = ?', agentId);
  if (!agent || agent.execution_mode !== 'worker') return true;
  const metadata = persistedMetadata(agent, toolName);
  const kind = workerKinds.resolveWorkerKind(metadata.workerKind, agent.role);
  const contract = metadata.workerContract || workerKinds.buildWorkerContract(kind, {
    topologySessionId: metadata.topologySessionId
  });
  if (contract.identity?.workerKind !== kind) throw contractError('unknown', toolAction(toolName));
  assertRuntimeContract(contract, kind);
  if (agent.parent_agent_id && contract.identity.parentId !== agent.parent_agent_id) throw invalidContract();
  assertTopologySessionScope({ toolName, args, metadata, kind });
  return assertWorkerToolAllowed(contract, toolName, args);
}

function persistedMetadata(agent, toolName) {
  try { return typeof agent.metadata_json === 'string' ? JSON.parse(agent.metadata_json) : agent.metadata_json || {}; }
  catch (_) { throw contractError('unknown', toolAction(toolName)); }
}

function assertTopologySessionScope(input) {
  const { toolName, args, metadata, kind } = input;
  if (String(toolName).toLowerCase() !== 'genos_topology_session') return;
  if (!metadata.topologySessionId || (args.session_id || args.sessionId) !== metadata.topologySessionId) {
    throw contractError(kind, 'topology_read');
  }
}

function assertRuntimeContract(contract, kind) {
  if (!contract || contract.version !== 1 || contract.identity?.workerKind !== kind) {
    throw Object.assign(new Error('Worker runtime contract identity is invalid.'), { code: 'INVALID_WORKER_CONTRACT' });
  }
  workerKinds.assertMethodCompatibility(kind, contract.mission?.methodContract);
  assertCanonicalContract(contract, kind);
  assertHostCapabilityBoundary(contract, kind);
  if (contract.assignment?.workerKind && contract.assignment.workerKind !== kind) {
    throw Object.assign(new Error('Worker assignment and runtime contract select different kinds.'), { code: 'INVALID_WORKER_CONTRACT' });
  }
  assertNoUnsupportedDelegation(contract, kind);
  if (kind === 'sub_orchestrator' && !validSubOrchestratorContract(contract)) {
    throw Object.assign(new Error('Sub-orchestrator delegation contract is missing, expired, or outside its limits.'), { code: 'UNSUPPORTED_WORKER_DELEGATION' });
  }
  return true;
}

function assertCanonicalContract(contract, kind) {
  const canonical = workerKinds.buildWorkerContract(kind, {
    parentAgentId: contract.identity.parentId,
    prompt: contract.mission?.objective,
    scope: contract.mission?.scope,
    specialtyNiche: contract.mission?.specialtyNiche,
    hostContractId: contract.mission?.hostContractId,
    hostCapabilities: contract.mission?.hostCapabilities,
    methodContract: contract.mission?.methodContract,
    topologySessionId: contract.mission?.topologySessionId,
    writeLease: contract.mission?.writeLease === true,
    workerTokenLimit: contract.resources?.maxTokens,
    workerAssignment: contract.assignment
  });
  assertAuthorityCeiling(contract.authority, canonical.authority, kind);
  assertObjectCeilings(contract.resources, canonical.resources, { requireAll: true });
  assertObjectCeilings(contract.limits, canonical.limits, { delegated: kind === 'sub_orchestrator' });
  if (!sameArtifacts(contract.evidence, canonical.evidence)) throw invalidContract();
  const capabilities = canonical.expressedCapabilities || [];
  if (contract.expressedCapabilities?.some((capability) => !capabilities.includes(capability))) {
    throw invalidContract();
  }
}

function assertHostCapabilityBoundary(contract, kind) {
  if (kind !== 'symbiotic_worker') return;
  const hostCapabilities = contract.mission?.hostCapabilities;
  const required = contract.mission?.methodContract?.requiredCapabilities || [];
  if (!contract.mission?.hostContractId || !Array.isArray(hostCapabilities) || !hostCapabilities.length
    || required.some((capability) => !hostCapabilities.includes(capability))) {
    throw Object.assign(new Error('Symbiotic worker exceeds or lacks its host capability contract.'), {
      code: 'SYMBIOTIC_HOST_CONTRACT_INVALID'
    });
  }
}

function assertAuthorityCeiling(actual, maximum, kind) {
  if (!actual || typeof actual !== 'object') throw invalidContract();
  for (const [key, allowed] of Object.entries(maximum)) {
    const delegationGrant = kind === 'sub_orchestrator' && ['spawn', 'delegate'].includes(key);
    if (delegationGrant) continue;
    if (actual[key] !== allowed) throw invalidContract();
  }
  for (const [key, value] of Object.entries(actual)) {
    if (!Object.hasOwn(maximum, key) && value === true) throw invalidContract();
  }
}

function assertObjectCeilings(actual, maximum, options = {}) {
  if (!actual || typeof actual !== 'object' || Array.isArray(actual)) throw invalidContract();
  assertCeilingValues(actual, maximum, options);
  assertCeilingKeys(actual, maximum, options);
}

function assertCeilingValues(actual, maximum, options) {
  for (const [key, ceiling] of Object.entries(maximum)) {
    if (options.delegated && key === 'maxTokens') continue;
    if (!validCeilingValue(actual[key], ceiling)) throw invalidContract();
  }
}

function assertCeilingKeys(actual, maximum, options) {
  for (const key of Object.keys(actual)) {
    if (!permittedCeilingKey(key, maximum, options)) throw invalidContract();
  }
  if (options.requireAll && Object.keys(maximum).some((key) => !Object.hasOwn(actual, key))) throw invalidContract();
}

function validCeilingValue(actual, ceiling) {
  return typeof ceiling === 'string' ? actual === ceiling : withinCeiling(actual, ceiling);
}

function permittedCeilingKey(key, maximum, options) {
  return Object.hasOwn(maximum, key) || Boolean(options.delegated && ['maxChildren', 'maxTokens'].includes(key));
}

function withinCeiling(value, ceiling) {
  if (ceiling === null) return value === null || (Number.isFinite(value) && value >= 0);
  return Number.isFinite(value) && value >= 0 && value <= ceiling;
}

function sameArtifacts(actual, expected) {
  return actual?.provenanceRequired === true
    && JSON.stringify(actual.requiredArtifacts) === JSON.stringify(expected.requiredArtifacts);
}

function invalidContract() {
  return Object.assign(new Error('Persisted worker contract exceeds its canonical authority or resource ceiling.'), {
    code: 'INVALID_WORKER_CONTRACT'
  });
}

function assertAssignmentMatches(contract, request) {
  const kind = contract?.identity?.workerKind;
  if (require('./workerRuntimeLimitsService').isDeterministicWorkerMission({ workerKind: kind,
    methodContract: contract.mission?.methodContract })) {
    if (!isDeepStrictEqual(contract.mission?.methodContract || null, request?.methodContract || null)) {
      throw Object.assign(new Error('Deterministic worker input differs from its persisted method contract.'), {
        code: 'WORKER_METHOD_MISMATCH'
      });
    }
  }
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
    && validDelegationTokenBudget(contract)
    && Number.isFinite(contract.delegationExpiresAt)
    && Date.now() < contract.delegationExpiresAt;
}

function validDelegationTokenBudget(contract) {
  const tokens = contract.limits?.maxTokens;
  return Number.isSafeInteger(tokens) && tokens >= 1 && tokens <= 10000
    && tokens <= contract.resources?.maxTokens;
}

function delegationIsDisabled(contract) {
  return contract.authority?.spawn !== true && contract.authority?.delegate !== true
    && contract.spawnBudget === 0 && contract.delegationDepth === 0;
}

module.exports = { AUTHORITY_TOOLS, toolAction, assertWorkerToolAllowed, enforcePersistedWorkerTool, assertRuntimeContract, assertAssignmentMatches };
