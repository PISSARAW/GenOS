'use strict';

const values = require('./trinityProvenanceValues');
const ledger = require('./gvxDevelopmentLedger');
const { error } = require('./gvxContracts');
const SCHEMA = 'genos.gvx.mission-run-binding/v1';

async function agentScope(db, agentId) {
  return db.get(`SELECT a.id AS entityId, w.organization_id AS organizationId,
    w.project_id AS projectId FROM agents a JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ?`, agentId);
}

async function ledgerExists(db) {
  return Boolean(await db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'gvx_development_events'"));
}

async function bindRun(db, input) {
  const missionId = input.missionId || input.workerBinding?.missionId;
  if (!missionId) return null;
  const scope = await agentScope(db, input.agentId);
  if (!scope?.organizationId || !scope.projectId) return null;
  const mission = await loadMission(db, { missionId, agentId: input.agentId, scope });
  const contract = await loadContract(db, { ...input, scope });
  const payload = values.canonical({ schema: SCHEMA, runId: input.id, scope,
    mission: { id: mission.mission_id, objectiveHash: values.digest(mission.objective),
      contractHash: values.digest({ objective: mission.objective, strategyContractHash: contract.hash }) },
    strategyContract: contract, budget: input.budget,
    workerBindingHash: input.workerBinding ? values.digest(input.workerBinding) : null });
  if (!await ledgerExists(db)) await require('../db/migrations/migrateGvxLedger').migrateGvxLedger(db);
  const event = await ledger.appendEvent(db, { id: `gvx-run:${input.id}:binding`, ...scope,
    type: 'decision_recorded', payload: { kind: 'mission_run_binding', binding: payload } });
  return { ...payload, hash: values.digest(payload), eventId: event.id };
}

async function loadMission(db, input) {
  const mission = await db.get('SELECT * FROM missions WHERE mission_id = ?', input.missionId);
  if (!mission || mission.status !== 'active') throw error('GVX_MISSION_NOT_ACTIVE');
  const member = await db.get('SELECT agent_id FROM mission_agents WHERE mission_id = ? AND agent_id = ?', input.missionId, input.agentId);
  if (!member && mission.orchestrator_agent_id !== input.agentId) throw error('GVX_MISSION_RUN_NOT_ASSIGNED');
  const authorityScope = await agentScope(db, mission.orchestrator_agent_id);
  if (!sameTenant(authorityScope, input.scope)) throw error('GVX_MISSION_TENANT_MISMATCH');
  return mission;
}

function sameTenant(left, right) {
  return Boolean(left && right && left.organizationId === right.organizationId && left.projectId === right.projectId);
}

async function loadContract(db, input) {
  const record = await require('./strategyContractService').getContractById(db, input.contractRecord.id);
  if (!record || record.version !== input.contractRecord.version
      || values.digest(record.contract) !== values.digest(input.contractRecord.contract)) throw error('GVX_RUN_CONTRACT_MISMATCH');
  if (!sameTenant(await agentScope(db, record.agentId), input.scope)) throw error('GVX_RUN_CONTRACT_SCOPE_MISMATCH');
  return { id: record.id, version: record.version, hash: values.digest(record.contract), ownerId: record.agentId };
}

async function readRun(db, query) {
  if (!await ledgerExists(db)) return null;
  const event = await ledger.getEvent(db, `gvx-run:${query.runId}:binding`, query.scope);
  if (!event) return null;
  const binding = event.payload.binding;
  if (event.payload.kind !== 'mission_run_binding' || binding?.schema !== SCHEMA || binding.runId !== query.runId) {
    throw error('GVX_RUN_BINDING_INVALID');
  }
  await verifyCurrentRecords(db, binding);
  return { ...binding, hash: values.digest(binding), eventId: event.id };
}

async function verifyCurrentRecords(db, binding) {
  const run = await db.get('SELECT * FROM strategy_execution_runs WHERE id = ?', binding.runId);
  const scope = await agentScope(db, binding.scope.entityId);
  const mission = await db.get('SELECT objective FROM missions WHERE mission_id = ?', binding.mission.id);
  if (!run || !scope || run.agent_id !== binding.scope.entityId || values.digest(scope) !== values.digest(binding.scope)) {
    throw error('GVX_RUN_BINDING_SCOPE_CHANGED');
  }
  if (!mission || values.digest(mission.objective) !== binding.mission.objectiveHash) throw error('GVX_MISSION_BINDING_CHANGED');
  assertRunFields(run, binding);
  const record = await require('./strategyContractService').getContractById(db, run.contract_id);
  if (!record || record.agentId !== binding.strategyContract.ownerId
      || values.digest(record.contract) !== binding.strategyContract.hash) throw error('GVX_RUN_CONTRACT_MISMATCH');
}

function assertRunFields(run, binding) {
  if (run.contract_id !== binding.strategyContract.id || run.contract_version !== binding.strategyContract.version
      || values.digest(JSON.parse(run.budget_json)) !== values.digest(binding.budget)) throw error('GVX_RUN_BINDING_CHANGED');
}

module.exports = { SCHEMA, bindRun, readRun, agentScope, sameTenant };
