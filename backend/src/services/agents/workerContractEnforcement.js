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
  const contract = workerKinds.buildWorkerContract(kind, metadata.workerContract?.mission || {});
  return assertWorkerToolAllowed(contract, toolName);
}

function assertRuntimeContract(contract, kind) {
  if (!contract || contract.version !== 1 || contract.identity?.workerKind !== kind) {
    throw Object.assign(new Error('Worker runtime contract identity is invalid.'), { code: 'INVALID_WORKER_CONTRACT' });
  }
  if (contract.authority?.spawn || contract.authority?.delegate || contract.spawnBudget || contract.delegationDepth) {
    throw Object.assign(new Error('Node worker dispatch does not support nested spawn or delegation.'), { code: 'UNSUPPORTED_WORKER_DELEGATION' });
  }
  return true;
}

module.exports = { AUTHORITY_TOOLS, toolAction, assertWorkerToolAllowed, enforcePersistedWorkerTool, assertRuntimeContract };
