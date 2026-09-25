'use strict';

const workerKinds = require('./workerKindService');

const AUTHORITY_TOOLS = Object.freeze({
  spawn: ['genos_create', 'genos_fork', 'genos_delegate_worker'],
  promote: ['genos_record_decision', 'genos_merge'],
  topology: ['genos_change_organization', 'genos_topology_session'],
  strategy: ['genos_change_strategy'],
  write: ['genos_run', 'genos_execute_primitive']
});

function contractError(kind, action) {
  const error = new Error(`Worker kind '${kind}' is not authorized for '${action}'.`);
  error.code = 'WORKER_CONTRACT_DENIED';
  return error;
}

function toolAction(toolName) {
  const name = String(toolName || '').trim().toLowerCase();
  for (const [action, tools] of Object.entries(AUTHORITY_TOOLS)) {
    if (tools.includes(name)) return action;
  }
  return 'execute';
}

function assertWorkerToolAllowed(contract, toolName) {
  const kind = contract?.identity?.workerKind;
  const action = toolAction(toolName);
  if (!kind || !workerKinds.KINDS[kind]) throw contractError(kind || 'unknown', action);
  if (!contract.authority?.[action]) throw contractError(kind, action);
  return true;
}

async function enforcePersistedWorkerTool(db, agentId, toolName) {
  const agent = await db.get('SELECT execution_mode, metadata_json, role FROM agents WHERE id = ?', agentId);
  if (!agent || agent.execution_mode !== 'worker') return true;
  let metadata = {};
  try { metadata = typeof agent.metadata_json === 'string' ? JSON.parse(agent.metadata_json) : agent.metadata_json || {}; }
  catch (_) { throw contractError('unknown', toolAction(toolName)); }
  const kind = workerKinds.resolveWorkerKind(metadata.workerKind, agent.role);
  const contract = metadata.workerContract || workerKinds.buildWorkerContract(kind, {});
  if (contract.identity?.workerKind !== kind) throw contractError('unknown', toolAction(toolName));
  return assertWorkerToolAllowed(contract, toolName);
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
  return true;
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
