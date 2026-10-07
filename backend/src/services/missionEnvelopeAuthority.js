'use strict';

const fs = require('node:fs/promises');
const { withTransaction } = require('../db');
const values = require('./trinityProvenanceValues');
const ledger = require('./gvxDevelopmentLedger');
const provenance = require('./gvxMissionProvenance');
const state = require('./missionEnvelopeAuthorityState');
const SCHEMA = 'genos.execution-authority-envelope/v1';

function eventId(runId) { return `gvx-run:${runId}:authority`; }

async function seal(ctx) {
  if (!ctx.normalizedMission.missionId) return null;
  return withTransaction(ctx.db, async () => {
    await require('./missionExecutionAuthority').assertAuthority(ctx.db, ctx.normalizedMission.missionExecutionAuthority);
    const scope = await provenance.agentScope(ctx.db, ctx.agentId);
    if (!scope?.organizationId || !scope.projectId) return null;
    const binding = await provenance.readRun(ctx.db, { runId: ctx.executionRun.id, scope });
    if (!binding) throw values.failure('EXECUTION_AUTHORITY_BINDING_MISSING');
    const prior = await read(ctx.db, binding.runId);
    if (prior) {
      ctx.normalizedMission.executionAuthorityRef = { eventId: prior.eventId, runId: binding.runId, hash: prior.hash };
      await assertRun(ctx.db, { agentId: ctx.agentId, runId: binding.runId, mission: ctx.normalizedMission });
      return ctx.normalizedMission.executionAuthorityRef;
    }
    const envelope = await build(ctx, binding);
    await state.assertCurrent(ctx.db, envelope);
    const event = await ledger.appendEvent(ctx.db, { id: eventId(binding.runId), ...scope,
      type: 'decision_recorded', payload: { kind: 'execution_authority_envelope', envelope } });
    const reference = { eventId: event.id, runId: binding.runId, hash: values.digest(envelope) };
    ctx.normalizedMission.executionAuthorityRef = reference;
    return reference;
  });
}

async function build(ctx, binding) {
  const mission = ctx.normalizedMission;
  if (mission.missionId !== binding.mission.id) throw values.failure('EXECUTION_AUTHORITY_CONTEXT_CHANGED');
  const identity = await state.identity(ctx.db, ctx.agentId);
  const missionRecord = await ctx.db.get('SELECT orchestrator_agent_id FROM missions WHERE mission_id = ?', binding.mission.id);
  const root = await fs.realpath(mission.workspaceRoot);
  const duration = Math.min(binding.budget.latencyMs, Number(mission.timeoutMs) || binding.budget.latencyMs);
  if (!Number.isFinite(duration) || duration <= 0) throw values.failure('EXECUTION_AUTHORITY_DEADLINE_INVALID');
  const envelope = values.canonical({ schema: SCHEMA, runId: binding.runId, scope: binding.scope,
    missionId: binding.mission.id, orchestratorId: missionRecord.orchestrator_agent_id,
    bindingHash: binding.hash, identity, workspaceRoot: root,
    toolLease: [...new Set(mission.toolLease || [])].sort(),
    capabilities: mission.capabilities || [], planHash: values.digest(ctx.autonomyPlan || {}),
    limits: binding.budget, expiresAt: new Date(Date.now() + duration).toISOString(),
    lease: await state.lease(ctx.db, binding.mission.id) });
  require('./agentAuthorityService').assertToolLeaseFresh({ id: ctx.agentId,
    execution_mode: identity.executionMode, role: identity.role, capabilities: envelope.capabilities },
  envelope.toolLease, ctx.autonomyPlan);
  return envelope;
}

async function read(db, runId) {
  if (!await db.get("SELECT name FROM sqlite_master WHERE name = 'gvx_development_events'")) return null;
  const scope = await db.get(`SELECT organization_id AS organizationId, project_id AS projectId,
    entity_id AS entityId FROM gvx_development_events WHERE id = ?`, eventId(runId));
  if (!scope) return null;
  const event = await ledger.getEvent(db, eventId(runId), scope);
  const envelope = event.payload.envelope;
  if (event.payload.kind !== 'execution_authority_envelope' || envelope?.schema !== SCHEMA
      || envelope.runId !== runId || values.digest(envelope.scope) !== values.digest(scope)) {
    throw values.failure('EXECUTION_AUTHORITY_ENVELOPE_INVALID');
  }
  return { envelope, hash: values.digest(envelope), eventId: event.id };
}

async function assertRun(db, input) {
  const saved = await read(db, input.runId);
  if (!saved) {
    if (input.mission?.executionAuthorityRef) throw values.failure('EXECUTION_AUTHORITY_BINDING_MISSING');
    return { status: 'legacy_unbound' };
  }
  if (saved.envelope.scope.entityId !== input.agentId) throw values.failure('EXECUTION_AUTHORITY_ACTOR_MISMATCH');
  const binding = await provenance.readRun(db, { runId: input.runId, scope: saved.envelope.scope });
  if (binding?.hash !== saved.envelope.bindingHash) throw values.failure('EXECUTION_AUTHORITY_BINDING_CHANGED');
  await state.assertCurrent(db, saved.envelope);
  if (input.mission) await assertMission(saved, input.mission);
  return { status: 'authorized', hash: saved.hash, envelope: saved.envelope };
}

async function assertMission(saved, mission) {
  if (mission.missionId !== saved.envelope.missionId) throw values.failure('EXECUTION_AUTHORITY_CONTEXT_CHANGED');
  const root = await fs.realpath(mission.workspaceRoot);
  if (root !== saved.envelope.workspaceRoot || values.digest([...new Set(mission.toolLease || [])].sort())
      !== values.digest(saved.envelope.toolLease)) throw values.failure('EXECUTION_AUTHORITY_CONTEXT_CHANGED');
  if (mission.executionAuthorityRef?.hash !== saved.hash) throw values.failure('EXECUTION_AUTHORITY_REFERENCE_CHANGED');
}

async function guardEvent(db, input) {
  if (['AGENT_FAILED', 'AGENT_HALTED', 'AGENT_RUNTIME_ERROR', 'WORKER_TASK_FAILED'].includes(input.event.eventType)) return input.event;
  try { await assertRun(db, input); return input.event; }
  catch (failure) {
    return { ...input.event, eventType: 'AGENT_HALTED', detail: failure.code || failure.message,
      payload: { ...input.event.payload, authorityRefusal: { code: failure.code || 'EXECUTION_AUTHORITY_CHECK_FAILED',
        originalEventType: input.event.eventType } } };
  }
}

async function assertTool(db, input) {
  const run = await db.get('SELECT id FROM strategy_execution_runs WHERE agent_id = ? ORDER BY rowid DESC LIMIT 1', input.agentId);
  if (!run) return { status: 'legacy_unbound' };
  const result = await assertRun(db, { agentId: input.agentId, runId: run.id });
  if (result.status === 'legacy_unbound') return result;
  const tool = require('./toolLeasePolicy').normalizeToolName(input.toolName);
  if (!result.envelope.toolLease.includes(tool)) throw values.failure('EXECUTION_AUTHORITY_TOOL_DENIED');
  return result;
}

async function inspect(db, input) {
  const saved = await read(db, input.runId);
  if (!saved) return { status: 'legacy_unbound', postconditions: 'not_evaluated' };
  const expected = { ...input.scope, entityId: input.agentId };
  if (values.digest(expected) !== values.digest(saved.envelope.scope)) throw values.failure('EXECUTION_AUTHORITY_INSPECTION_SCOPE_MISMATCH');
  let current;
  try { await assertRun(db, input); current = { status: 'authorized' }; }
  catch (failure) { current = { status: 'refused', code: failure.code || 'EXECUTION_AUTHORITY_CHECK_FAILED' }; }
  return { status: 'bound', reference: { eventId: saved.eventId, hash: saved.hash, runId: input.runId },
    envelope: saved.envelope, current, postconditions: 'not_evaluated' };
}

module.exports = { SCHEMA, seal, read, assertRun, guardEvent, assertTool, inspect };
