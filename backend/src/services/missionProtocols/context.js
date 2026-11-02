'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { digest } = require('../evidenceProtocol/canonical');
const store = require('./store');

function failure(code) { return Object.assign(new Error(code), { code }); }

async function prepare(ctx) {
  const mission = ctx.normalizedMission;
  if (!mission.missionId) return null;
  const runId = ctx.executionRun?.id;
  if (!runId) throw failure('MISSION_PROTOCOL_RUN_REQUIRED');
  const scope = await require('../gvxMissionProvenance').requireAgentScope(ctx.db, ctx.agentId);
  const lease = await require('../missionEnvelopeAuthorityState').lease(ctx.db, mission.missionId);
  const databases = await ctx.db.all('PRAGMA database_list');
  const filename = databases.find(row => row.name === 'main')?.file;
  if (!filename) throw failure('MISSION_PROTOCOL_DURABLE_DATABASE_REQUIRED');
  const directory = path.join(`${filename}.protocols`, digest(runId).slice(7));
  fs.mkdirSync(directory, { recursive: true });
  const generation = lease?.generation || 1;
  const duration = ctx.runtimeBudget?.latencyMs || ctx.executionRun.budget?.latencyMs;
  if (!Number.isSafeInteger(duration) || duration <= 0) throw failure('MISSION_PROTOCOL_DEADLINE_REQUIRED');
  const binding = { db: ctx.db, agentId: ctx.agentId, runId, missionId: mission.missionId,
    scope: { organizationId: scope.organizationId, projectId: scope.projectId },
    workspaceId: mission.workspaceId || ctx.dispatchedAgent.workspace_id,
    actor: { agentId: ctx.agentId, incarnationId: runId, trustDomain: scope.organizationId },
    generations: { incarnation: 1, organization: generation, workspace: 1 },
    authority: { authorityId: `runtime:${runId}`, generation }, directory,
    mission, executionRun: ctx.executionRun, lease, preparing: true,
    expiresAt: new Date(Date.now() + duration).toISOString() };
  await assertCurrent(binding);
  return binding;
}

async function build(ctx) {
  const binding = await prepare(ctx);
  if (!binding) return null;
  const sealed = await require('../missionEnvelopeAuthority').read(ctx.db, binding.runId);
  if (!sealed) throw failure('MISSION_PROTOCOL_SEALED_AUTHORITY_REQUIRED');
  binding.preparing = false;
  binding.expiresAt = sealed.envelope.expiresAt;
  binding.executionAuthorityRef = ctx.normalizedMission.executionAuthorityRef;
  await assertCurrent(binding);
  await store.save(binding);
  return binding;
}

async function load(db, runId) {
  const row = await store.read(db, runId);
  return row ? { ...JSON.parse(row.binding_json), db } : null;
}

async function assertCurrent(binding) {
  if (!binding) throw failure('MISSION_PROTOCOL_BINDING_REQUIRED');
  const { db, agentId, runId, missionId } = binding;
  const run = await db.get('SELECT agent_id FROM strategy_execution_runs WHERE id = ?', runId);
  if (run?.agent_id !== agentId) throw failure('MISSION_PROTOCOL_RUN_SCOPE_MISMATCH');
  const scope = await require('../gvxMissionProvenance').requireAgentScope(db, agentId);
  if (scope.organizationId !== binding.scope.organizationId || scope.projectId !== binding.scope.projectId) {
    throw failure('MISSION_PROTOCOL_TENANT_CHANGED');
  }
  const mission = await require('../missionIdentityService').get(db, missionId);
  if (mission?.status !== 'active') throw failure('MISSION_PROTOCOL_MISSION_INACTIVE');
  const lease = await require('../missionEnvelopeAuthorityState').lease(db, missionId);
  if (digest(lease) !== digest(binding.lease)) throw failure('MISSION_AUTHORITY_STALE');
  await require('../missionExecutionAuthority').assertAgentCurrent(db, agentId);
  if (binding.preparing) return;
  await require('../missionEnvelopeAuthority').assertRun(db, { agentId, runId });
}

async function authorize(binding, request) {
  await assertCurrent(binding);
  const frame = request?.request || request;
  if (frame?.missionId && frame.missionId !== binding.missionId) return false;
  if (frame?.scope && digest(frame.scope) !== digest(binding.scope)) return false;
  return true;
}

module.exports = { prepare, build, load, assertCurrent, authorize, failure };
