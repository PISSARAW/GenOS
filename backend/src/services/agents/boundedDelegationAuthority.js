'use strict';

const values = require('../trinityProvenanceValues');
const ledger = require('../gvxDevelopmentLedger');
const provenance = require('../gvxMissionProvenance');
const enforcement = require('./workerContractEnforcement');
const CHILD_KINDS = new Set(['scout_cell', 'bounded_worker', 'adaptive_worker', 'verifier_worker']);
const SCHEMA = 'genos.bounded-worker-delegation/v1';

function denied(code = 'WORKER_CONTRACT_DENIED') { return values.failure(code); }
function metadata(agent) {
  try { return JSON.parse(agent.metadata_json || '{}'); }
  catch { throw denied('INVALID_SUBORCHESTRATOR_CONTRACT'); }
}

async function parent(db, agentId) {
  const agent = await db.get('SELECT * FROM agents WHERE id = ?', agentId);
  const contract = agent && metadata(agent).workerContract;
  assertParentContract(agent, contract);
  await require('../missionExecutionAuthority').assertAgentCurrent(db, agentId);
  assertStatus(agent);
  const root = await require('../agentAuthorityService').requireOrchestrator(db, agent.parent_agent_id);
  assertStatus(await db.get('SELECT status, isolation_mode FROM agents WHERE id = ?', root.id));
  const scope = await provenance.agentScope(db, agentId);
  const rootScope = await provenance.agentScope(db, root.id);
  if (!scope?.organizationId || !scope.projectId || !provenance.sameTenant(scope, rootScope)) throw denied('DELEGATION_TENANT_MISMATCH');
  await require('../missionEnvelopeAuthority').assertTool(db, { agentId, toolName: 'genos_delegate_worker' });
  const mission = await db.get(`SELECT m.mission_id FROM missions m JOIN mission_agents ma ON ma.mission_id=m.mission_id
    WHERE ma.agent_id=? AND m.status='active' AND m.orchestrator_agent_id=? ORDER BY ma.rowid DESC LIMIT 1`, agentId, root.id);
  return { agent, contract, scope, root, missionId: mission?.mission_id || null };
}

function assertParentContract(agent, contract) {
  if (agent?.execution_mode !== 'worker' || metadata(agent).workerKind !== 'sub_orchestrator') throw denied();
  enforcement.assertRuntimeContract(contract, 'sub_orchestrator');
  if (contract.identity.parentId !== agent.parent_agent_id || contract.authority.spawn !== true
      || contract.authority.delegate !== true || contract.spawnBudget < 1 || contract.limits.maxTokens <= 0) throw denied();
}

function assertStatus(agent) {
  if (['completed', 'failed', 'error', 'blocked', 'unverified', 'terminated', 'quarantined', 'apoptosis'].includes(agent.status)
      || agent.isolation_mode === 'Quarantine') throw denied();
}

async function capacity(db, authorized, excludedChildId = '') {
  const rows = await db.all("SELECT id FROM agents WHERE parent_agent_id = ? AND execution_mode = 'worker' AND id <> ?", authorized.agent.id, excludedChildId);
  if (!await db.get("SELECT name FROM sqlite_master WHERE name='gvx_development_events'")) {
    await require('../../db/migrations/migrateGvxLedger').migrateGvxLedger(db);
  }
  const records = await ledger.listAllEvents(db, authorized.scope);
  const delegated = records.filter(record => record.payload.kind === 'bounded_worker_delegation'
    && record.payload.binding?.parentId === authorized.agent.id && record.id !== `gvx-delegation:${excludedChildId}`);
  const count = new Set([...rows.map(row => row.id), ...delegated.map(record => record.payload.binding.childId)]).size;
  if (count >= authorized.contract.spawnBudget) throw denied('SUBORCHESTRATOR_CHILD_LIMIT');
  const allocated = delegated.reduce((total, record) => total + allocatedTokens(record, authorized), 0);
  if (allocated > authorized.contract.limits.maxTokens) throw denied('SUBORCHESTRATOR_TOKEN_LIMIT');
  return { count, remainingChildren: authorized.contract.spawnBudget - count,
    remainingTokens: authorized.contract.limits.maxTokens - allocated };
}

async function bind(db, input) {
  return require('../../db').withTransaction(db, () => bindBound(db, input));
}

function allocatedTokens(record, authorized) {
  const binding = record.payload.binding;
  if (binding?.schema !== SCHEMA || binding.parentId !== authorized.agent.id
      || !Number.isSafeInteger(binding.modelTokens) || binding.modelTokens < 0) throw denied('DELEGATION_BINDING_INVALID');
  return binding.modelTokens;
}

async function bindBound(db, input) {
  const fresh = await parent(db, input.parentId);
  const agent = await db.get('SELECT * FROM agents WHERE id = ?', input.childId);
  const contract = agent && metadata(agent).workerContract;
  assertChild(agent, contract, fresh);
  const modelTokens = contract.resources.maxTokens;
  const budget = await capacity(db, fresh, agent.id);
  if (modelTokens > budget.remainingTokens) throw denied('SUBORCHESTRATOR_TOKEN_LIMIT');
  if (!Number.isSafeInteger(input.allocation) || input.allocation < 0 || modelTokens > input.allocation
      || !Number.isSafeInteger(modelTokens) || modelTokens < 0) throw denied('SUBORCHESTRATOR_TOKEN_LIMIT');
  const binding = values.canonical({ schema: SCHEMA, parentId: fresh.agent.id, childId: agent.id,
    scope: fresh.scope, rootId: fresh.root.id, missionId: fresh.missionId, parentContractHash: values.digest(fresh.contract),
    childContractHash: values.digest(contract), modelTokens, depth: 1,
    expiresAt: new Date(fresh.contract.delegationExpiresAt).toISOString() });
  await ledger.appendEvent(db, { id: `gvx-delegation:${agent.id}`, ...fresh.scope,
    type: 'decision_recorded', payload: { kind: 'bounded_worker_delegation', binding } });
  if (fresh.missionId) await db.run('INSERT OR IGNORE INTO mission_agents (mission_id,agent_id,role) VALUES (?,?,?)', fresh.missionId, agent.id, agent.role);
  return { ...binding, hash: values.digest(binding) };
}

function assertChild(agent, contract, authorized) {
  if (agent?.execution_mode !== 'worker' || agent.parent_agent_id !== authorized.agent.id
      || agent.workspace_id !== authorized.agent.workspace_id || !CHILD_KINDS.has(contract?.identity?.workerKind)) throw denied();
  enforcement.assertRuntimeContract(contract, contract.identity.workerKind);
  if (contract.identity.parentId !== authorized.agent.id || contract.authority.spawn || contract.authority.delegate
      || contract.spawnBudget !== 0 || contract.delegationDepth !== 0) throw denied('UNSUPPORTED_WORKER_DELEGATION');
}

async function authorize(db, input) {
  const authorized = await parent(db, input.parent.id);
  const contract = metadata(await db.get('SELECT * FROM agents WHERE id = ?', input.agent.id)).workerContract;
  assertChild(input.agent, contract, authorized);
  const event = await ledger.getEvent(db, `gvx-delegation:${input.agent.id}`, authorized.scope);
  const binding = event?.payload.binding;
  if (event?.payload.kind !== 'bounded_worker_delegation' || binding?.schema !== SCHEMA
      || binding.parentContractHash !== values.digest(authorized.contract)
      || binding.childContractHash !== values.digest(contract) || binding.childId !== input.agent.id
      || binding.rootId !== authorized.root.id || !bindingIsCurrent(binding, authorized, contract)) throw denied('DELEGATION_BINDING_INVALID');
  const principal = { ...authorized.agent, boundedDelegationChildId: input.agent.id };
  if (!require('../cedarAgentAuthority').authorize({ principal, resource: input.agent,
    action: 'StartMission', workspaceId: input.agent.workspace_id })) throw denied('MISSION_CEDAR_DENIED');
  return input.agent;
}

function bindingIsCurrent(binding, authorized, contract) {
  return binding.parentId === authorized.agent.id && binding.depth === 1
    && binding.modelTokens === contract.resources.maxTokens && binding.missionId === authorized.missionId
    && values.digest(binding.scope) === values.digest(authorized.scope)
    && binding.expiresAt === new Date(authorized.contract.delegationExpiresAt).toISOString()
    && Date.now() < Date.parse(binding.expiresAt);
}

module.exports = { SCHEMA, parent, capacity, bind, authorize };
