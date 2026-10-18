'use strict';

const fs = require('node:fs/promises');
const { withTransaction } = require('../db');
const values = require('./trinityProvenanceValues');
const ledger = require('./gvxDevelopmentLedger');
const provenance = require('./gvxMissionProvenance');
const state = require('./missionEnvelopeAuthorityState');
const contract = require('./executionEnvelopeContract');
const migration = require('../db/migrations/migrateExecutionAuthorityV2');
const SCHEMA = contract.SCHEMA;
const LEGACY_SCHEMA = 'genos.execution-authority-envelope/v1';

function eventId(runId) { return `gvx-run:${runId}:authority`; }

async function realWorkspaceRoot(root, options = {}) {
  const resolve = options.resolve || fs.realpath;
  const attempts = options.attempts ?? 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { return await resolve(root); }
    catch (failure) {
      if (!['EPERM', 'EBUSY'].includes(failure.code)) throw failure;
      if (attempt === attempts - 1) break;
      await new Promise((done) => setTimeout(done, 25 * (attempt + 1)));
    }
  }
  const validate = options.validate
    || require('./workspaceSnapshotPaths').assertNoSymlinkAbsolutePath;
  return validate(root);
}

async function seal(ctx) {
  if (!ctx.normalizedMission.missionId) return null;
  return withTransaction(ctx.db, async () => {
    await require('./missionExecutionAuthority').assertAuthority(ctx.db, ctx.normalizedMission.missionExecutionAuthority);
    const scope = await provenance.agentScope(ctx.db, ctx.agentId);
    if (!scope?.organizationId || !scope.projectId) return null;
    const binding = await provenance.readRun(ctx.db, { runId: ctx.executionRun.id, scope });
    if (!binding) throw values.failure('EXECUTION_AUTHORITY_BINDING_MISSING');
    const classification = await migration.classification(ctx.db, binding.runId);
    if (classification?.status === migration.STATUSES.legacy) {
      throw values.failure('EXECUTION_AUTHORITY_LEGACY_READ_ONLY');
    }
    if (!classification) throw values.failure('EXECUTION_AUTHORITY_BINDING_MISSING');
    const prior = await read(ctx.db, binding.runId);
    if (prior) {
      ctx.normalizedMission.executionAuthorityRef = reference(prior, binding.runId);
      await assertRun(ctx.db, { agentId: ctx.agentId, runId: binding.runId, mission: ctx.normalizedMission });
      return ctx.normalizedMission.executionAuthorityRef;
    }
    const envelope = await build(ctx, binding);
    await state.assertCurrent(ctx.db, envelope);
    const event = await ledger.appendEvent(ctx.db, { id: eventId(binding.runId), ...scope,
      type: 'decision_recorded', payload: { kind: 'execution_authority_envelope', envelope } });
    const saved = savedEvent(event);
    assertSigned(saved);
    await migration.bindV2(ctx.db, { runId: binding.runId, schema: SCHEMA, hash: saved.hash });
    ctx.normalizedMission.executionAuthorityRef = reference(saved, binding.runId);
    return ctx.normalizedMission.executionAuthorityRef;
  });
}

async function build(ctx, binding) {
  const mission = ctx.normalizedMission;
  if (mission.missionId !== binding.mission.id) throw values.failure('EXECUTION_AUTHORITY_CONTEXT_CHANGED');
  const identity = await state.identity(ctx.db, ctx.agentId);
  const missionRecord = await ctx.db.get('SELECT orchestrator_agent_id FROM missions WHERE mission_id = ?', binding.mission.id);
  const root = await realWorkspaceRoot(mission.workspaceRoot);
  const duration = Math.min(binding.budget.latencyMs, Number(mission.timeoutMs) || binding.budget.latencyMs);
  if (!Number.isFinite(duration) || duration <= 0) throw values.failure('EXECUTION_AUTHORITY_DEADLINE_INVALID');
  const envelope = await contract.build(ctx, { binding, identity, workspaceRoot: root, duration,
    orchestratorId: missionRecord.orchestrator_agent_id,
    lease: await state.lease(ctx.db, binding.mission.id) });
  require('./agentAuthorityService').assertToolLeaseFresh({ id: ctx.agentId,
    execution_mode: identity.executionMode, role: identity.role, capabilities: envelope.capabilities },
  envelope.toolLease, ctx.autonomyPlan);
  return envelope;
}

async function read(db, runId) {
  const saved = await readEvent(db, runId);
  if (!saved) return null;
  if (saved.envelope.schema === LEGACY_SCHEMA) throw values.failure('EXECUTION_AUTHORITY_LEGACY_READ_ONLY');
  if (saved.envelope.schema !== SCHEMA) throw values.failure('EXECUTION_AUTHORITY_ENVELOPE_INVALID');
  assertSigned(saved);
  return saved;
}

async function readEvent(db, runId) {
  if (!await db.get("SELECT name FROM sqlite_master WHERE name = 'gvx_development_events'")) return null;
  const scope = await db.get(`SELECT organization_id AS organizationId, project_id AS projectId,
    entity_id AS entityId FROM gvx_development_events WHERE id = ?`, eventId(runId));
  if (!scope) return null;
  const event = await ledger.getEvent(db, eventId(runId), scope);
  const envelope = event.payload.envelope;
  if (event.payload.kind !== 'execution_authority_envelope'
      || envelope?.runId !== runId || values.digest(envelope.scope) !== values.digest(scope)) {
    throw values.failure('EXECUTION_AUTHORITY_ENVELOPE_INVALID');
  }
  return savedEvent(event);
}

function savedEvent(event) {
  return { envelope: event.payload.envelope, hash: values.digest(event.payload.envelope),
    eventId: event.id, eventHash: event.eventHash, signature: event.controlPlaneMac };
}

function reference(saved, runId) {
  return { eventId: saved.eventId, runId, hash: saved.hash,
    eventHash: saved.eventHash, signature: saved.signature };
}

function assertSigned(saved) {
  if (!saved.signature || !process.env.GENOS_GVX_LEDGER_HMAC_SECRET) {
    throw values.failure('EXECUTION_AUTHORITY_SIGNATURE_REQUIRED');
  }
}

async function assertRun(db, input) {
  const saved = await read(db, input.runId);
  if (!saved) {
    const classification = await migration.classification(db, input.runId);
    if (classification?.status === migration.STATUSES.legacy) {
      throw values.failure('EXECUTION_AUTHORITY_LEGACY_READ_ONLY');
    }
    throw values.failure('EXECUTION_AUTHORITY_BINDING_MISSING');
  }
  if (saved.envelope.scope.entityId !== input.agentId) throw values.failure('EXECUTION_AUTHORITY_ACTOR_MISMATCH');
  const binding = await provenance.readRun(db, { runId: input.runId, scope: saved.envelope.scope });
  if (binding?.hash !== saved.envelope.bindingHash) throw values.failure('EXECUTION_AUTHORITY_BINDING_CHANGED');
  await state.assertCurrent(db, saved.envelope);
  if (input.mission) await assertMission(saved, input.mission);
  if (input.verifyInputs) await assertInputs(saved, input);
  return { status: 'authorized', hash: saved.hash, envelope: saved.envelope };
}

async function assertInputs(saved, input) {
  const snapshot = await require('./trinitySnapshotService').hashWorkspace(saved.envelope.workspaceRoot);
  if (snapshot !== saved.envelope.inputSnapshot.hash) {
    throw values.failure('EXECUTION_AUTHORITY_INPUT_SNAPSHOT_CHANGED');
  }
  const executable = await contract.measureExecutable(input.executable, saved.envelope.workspaceRoot);
  if (executable.path !== saved.envelope.executable.path
      || executable.sha256 !== saved.envelope.executable.sha256) {
    throw values.failure('EXECUTION_AUTHORITY_EXECUTABLE_CHANGED');
  }
}

async function assertCompletedRunEvidence(db, input) {
  const saved = await read(db, input.runId);
  if (!saved) throw values.failure('EXECUTION_AUTHORITY_BINDING_MISSING');
  if (saved.envelope.scope.entityId !== input.agentId) throw values.failure('EXECUTION_AUTHORITY_ACTOR_MISMATCH');
  const binding = await provenance.readRun(db, { runId: input.runId, scope: saved.envelope.scope });
  if (binding?.hash !== saved.envelope.bindingHash) throw values.failure('EXECUTION_AUTHORITY_BINDING_CHANGED');
  const run = await db.get('SELECT status, completed_at AS completedAt FROM strategy_execution_runs WHERE id = ? AND agent_id = ?',
    input.runId, input.agentId);
  const terminal = (await require('./biologicalWorkerStore').observations(db, input.runId))
    .filter(item => item.applied && item.event.eventType === 'AGENT_COMPLETED').at(-1);
  const recordedAt = Date.parse(run?.completedAt);
  const eventAt = Date.parse(terminal?.event.timestamp);
  const completedAt = Math.max(recordedAt, eventAt);
  if (run?.status !== 'completed' || !Number.isFinite(recordedAt) || !Number.isFinite(eventAt)
      || Math.abs(recordedAt - eventAt) > 60000 || completedAt > Date.parse(saved.envelope.expiresAt)) {
    throw values.failure('EXECUTION_AUTHORITY_COMPLETION_NOT_SEALED');
  }
  await state.assertCurrent(db, saved.envelope, completedAt);
  return { status: 'authorized', hash: saved.hash, envelope: saved.envelope, completedAt: new Date(completedAt).toISOString() };
}

async function assertMission(saved, mission) {
  if (mission.missionId !== saved.envelope.missionId) throw contextChanged('mission identity changed');
  const root = await realWorkspaceRoot(mission.workspaceRoot);
  if (root !== saved.envelope.workspaceRoot) throw contextChanged('workspace root changed');
  const actualTools = [...new Set(mission.toolLease || [])];
  const sealedTools = new Set(saved.envelope.toolLease);
  if (actualTools.some(tool => !sealedTools.has(tool))) {
    throw contextChanged(`tool lease widened (${JSON.stringify(actualTools.filter(tool => !sealedTools.has(tool)).sort())})`);
  }
  if (mission.executionAuthorityRef?.hash !== saved.hash) throw values.failure('EXECUTION_AUTHORITY_REFERENCE_CHANGED');
  if (mission.executionAuthorityRef.eventHash !== saved.eventHash
      || mission.executionAuthorityRef.signature !== saved.signature) {
    throw values.failure('EXECUTION_AUTHORITY_SIGNATURE_CHANGED');
  }
}

function contextChanged(reason) {
  return Object.assign(new Error(`Execution authority context changed: ${reason}.`), { code: 'EXECUTION_AUTHORITY_CONTEXT_CHANGED' });
}

async function guardEvent(db, input) {
  if (['AGENT_FAILED', 'AGENT_HALTED', 'AGENT_RUNTIME_ERROR', 'WORKER_TASK_FAILED'].includes(input.event.eventType)) return input.event;
  if (await migration.isInternalRun(db, input.runId)) return input.event;
  try { await assertRun(db, input); return input.event; }
  catch (failure) {
    return { ...input.event, eventType: 'AGENT_HALTED', detail: failure.code || failure.message,
      payload: { ...input.event.payload, authorityRefusal: { code: failure.code || 'EXECUTION_AUTHORITY_CHECK_FAILED',
        originalEventType: input.event.eventType } } };
  }
}

async function assertTool(db, input) {
  const run = await selectToolRun(db, input);
  if (!run) throw values.failure('EXECUTION_AUTHORITY_RUN_REQUIRED');
  const result = await assertRun(db, { agentId: input.agentId, runId: run.id });
  const tool = require('./toolLeasePolicy').normalizeToolName(input.toolName);
  if (!result.envelope.toolLease.includes(tool)) throw values.failure('EXECUTION_AUTHORITY_TOOL_DENIED');
  return result;
}

async function selectToolRun(db, input) {
  if (input.runId) {
    const run = await db.get('SELECT id FROM strategy_execution_runs WHERE agent_id = ? AND id = ?',
      input.agentId, input.runId);
    if (!run) throw values.failure('EXECUTION_AUTHORITY_RUN_MISMATCH');
    return run;
  }
  const runs = await db.all('SELECT id FROM strategy_execution_runs WHERE agent_id = ? ORDER BY rowid DESC LIMIT 2',
    input.agentId);
  if (runs.length > 1) throw values.failure('EXECUTION_AUTHORITY_RUN_REQUIRED');
  return runs[0] || null;
}

async function inspect(db, input) {
  const classification = await migration.classification(db, input.runId);
  const any = await readEvent(db, input.runId);
  if (any?.envelope.schema === LEGACY_SCHEMA || classification?.status === migration.STATUSES.legacy) {
    await assertLegacyInspectionScope(db, input, any);
    return { status: 'legacy_read_only', reason: classification?.reason || 'v1-envelope',
      envelope: any?.envelope || null, current: { status: 'refused',
        code: 'EXECUTION_AUTHORITY_LEGACY_READ_ONLY' }, postconditions: 'not_evaluated' };
  }
  const saved = await read(db, input.runId);
  if (!saved) return { status: classification ? 'unsealed_refused' : 'not_found',
    current: { status: 'refused', code: 'EXECUTION_AUTHORITY_BINDING_MISSING' },
    postconditions: 'not_evaluated' };
  const expected = { ...input.scope, entityId: input.agentId };
  if (values.digest(expected) !== values.digest(saved.envelope.scope)) throw values.failure('EXECUTION_AUTHORITY_INSPECTION_SCOPE_MISMATCH');
  let current;
  try { await assertRun(db, input); current = { status: 'authorized' }; }
  catch (failure) { current = { status: 'refused', code: failure.code || 'EXECUTION_AUTHORITY_CHECK_FAILED' }; }
  return { status: 'bound', reference: { eventId: saved.eventId, hash: saved.hash, runId: input.runId },
    envelope: saved.envelope, current, postconditions: 'not_evaluated' };
}

async function assertLegacyInspectionScope(db, input, saved) {
  const run = await db.get('SELECT agent_id AS agentId FROM strategy_execution_runs WHERE id = ?', input.runId);
  if (run?.agentId !== input.agentId) throw values.failure('EXECUTION_AUTHORITY_INSPECTION_SCOPE_MISMATCH');
  const actual = saved?.envelope.scope || await provenance.agentScope(db, input.agentId);
  const expected = { ...input.scope, entityId: input.agentId };
  if (values.digest(expected) !== values.digest(actual)) {
    throw values.failure('EXECUTION_AUTHORITY_INSPECTION_SCOPE_MISMATCH');
  }
}

module.exports = { SCHEMA, seal, read, assertRun, assertCompletedRunEvidence, guardEvent, assertTool, inspect,
  realWorkspaceRoot };
