'use strict';

const assert = require('node:assert/strict');
const { openDatabase } = require('./helpers/biologyDatabase');
const { workerSchema, addWorker } = require('./helpers/biologicalWorkerFixture');
const identity = require('../src/services/trinityWorkerIdentity');
const execution = require('../src/services/strategyExecutionService');
const bindings = require('../src/services/biologicalWorkerStore');

async function fixture(probe) {
  const db = openDatabase();
  try {
    await workerSchema(db);
    const contractRecord = await addWorker(db);
    await probe(db, contractRecord);
  } finally { await db.close(); }
}

async function rejectResolution(db, request, expected) {
  await assert.rejects(identity.resolve(db, { agentId: 'worker', ...request }), error => {
    assert.equal(error.code, expected.code);
    assert.equal(error.diagnostic.reason, expected.reason);
    if (expected.cause) assert.equal(error.diagnostic.cause, expected.cause);
    if (expected.requested !== undefined) assert.equal(error.diagnostic.requestedMissionId, expected.requested);
    if (expected.count !== undefined) assert.equal(error.diagnostic.candidateCount, expected.count);
    return true;
  });
}

async function addMission(db, input = {}) {
  await db.run(`INSERT INTO missions (mission_id, objective, status, orchestrator_agent_id)
    VALUES (?, 'Second mission', ?, ?)`, input.id || 'second-mission', input.status || 'active', input.parent || 'parent');
  await db.run('INSERT INTO mission_agents VALUES (?, ?)', input.id || 'second-mission', 'worker');
}

async function noFallback(db, contractRecord) {
  await rejectResolution(db, { missionId: 'worker' }, { code: 'BIOLOGICAL_WORKER_MISSION_NOT_FOUND',
    reason: 'none', cause: 'requested_mission_not_assigned', requested: 'worker', count: 0 });
  await assert.rejects(execution.createExecutionRun(db, { agentId: 'worker', missionId: 'worker', contractRecord }),
    { code: 'BIOLOGICAL_WORKER_MISSION_NOT_FOUND' });
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM strategy_execution_runs')).n, 0);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM sqlite_master WHERE name = ?', 'biological_worker_bindings')).n, 0,
    'failed binding rolls back run and receipt migration in the real transaction');
}

async function cardinality(db, contractRecord) {
  assert.equal((await identity.resolve(db, { agentId: 'worker' })).mission_id, 'worker-mission');
  await addMission(db);
  await assert.rejects(identity.resolve(db, { agentId: 'worker' }), error => {
    assert.equal(error.code, 'BIOLOGICAL_WORKER_MISSION_AMBIGUOUS');
    assert.equal(error.diagnostic.reason, 'multiple');
    assert.equal(error.diagnostic.requestedMissionId, null);
    assert.deepEqual(error.diagnostic.activeCandidateIds, ['second-mission', 'worker-mission']);
    assert.equal(error.diagnostic.candidateCount, 2);
    return true;
  });
  const run = await execution.createExecutionRun(db, { agentId: 'worker', missionId: 'second-mission', contractRecord });
  assert.equal((await bindings.binding(db, run.id)).missionId, 'second-mission');
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM mission_agents')).n, 2, 'resolution never creates authority');
}

async function inactiveAndMissing(db) {
  await db.run("UPDATE missions SET status = 'completed' WHERE mission_id = 'worker-mission'");
  await assert.rejects(identity.resolve(db, { agentId: 'worker', missionId: 'worker-mission' }), error => {
    assert.equal(error.code, 'BIOLOGICAL_WORKER_MISSION_NOT_FOUND');
    assert.equal(error.diagnostic.cause, 'requested_mission_inactive');
    assert.deepEqual(error.diagnostic.assignments, [{ missionId: 'worker-mission', status: 'completed', matchesRequestedIdentity: true }]);
    return true;
  });
  await rejectResolution(db, {}, { code: 'BIOLOGICAL_WORKER_MISSION_NOT_FOUND', reason: 'none', cause: 'no_active_assignments' });
  await db.run('DELETE FROM mission_agents');
  await rejectResolution(db, {}, { code: 'BIOLOGICAL_WORKER_MISSION_NOT_FOUND', reason: 'none', cause: 'no_assignments' });
}

async function invalidIdentity(db) {
  for (const missionId of ['', ' worker-mission', 'worker-mission ', {}, 0, false]) {
    await rejectResolution(db, { missionId }, { code: 'BIOLOGICAL_WORKER_MISSION_ID_INVALID', reason: 'invalid_requested_identity' });
  }
  await assert.rejects(identity.resolve(db, { agentId: 'absent' }), { code: 'BIOLOGICAL_WORKER_IDENTITY_INVALID' });
  await assert.rejects(identity.resolve(db, { agentId: 'parent' }), { code: 'BIOLOGICAL_WORKER_IDENTITY_INVALID' });
}

async function foreignMission(db, contractRecord) {
  await db.exec(`INSERT INTO workspaces VALUES ('foreign', 'other-org', 'project');
    INSERT INTO agents (id, execution_mode, workspace_id) VALUES ('foreign-parent', 'orchestrator', 'foreign');
    UPDATE missions SET orchestrator_agent_id = 'foreign-parent' WHERE mission_id = 'worker-mission';`);
  await assert.rejects(execution.createExecutionRun(db, { agentId: 'worker', missionId: 'worker-mission', contractRecord }), error => {
    assert.equal(error.code, 'BIOLOGICAL_WORKER_TENANT_MISMATCH');
    assert.equal(error.diagnostic.authority, 'mission_orchestrator');
    assert.equal(error.diagnostic.reason, 'tenant_mismatch');
    return true;
  });
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM strategy_execution_runs')).n, 0);
}

async function parentTenant(db) {
  await db.exec(`INSERT INTO workspaces VALUES ('foreign', 'org', 'other-project');
    INSERT INTO agents (id, execution_mode, workspace_id) VALUES ('foreign-parent', 'worker', 'foreign');
    UPDATE agents SET parent_agent_id = 'foreign-parent' WHERE id = 'worker';`);
  await assert.rejects(identity.resolve(db, { agentId: 'worker' }), error => {
    assert.equal(error.code, 'BIOLOGICAL_WORKER_TENANT_MISMATCH');
    assert.equal(error.diagnostic.authority, 'worker_parent');
    return true;
  });
}

async function missingAuthority(db) {
  await db.run("UPDATE agents SET workspace_id = 'missing-workspace' WHERE id = 'worker'");
  await rejectResolution(db, {}, { code: 'BIOLOGICAL_WORKER_TENANT_MISMATCH', reason: 'tenant_authority_missing' });
  await db.run("UPDATE agents SET workspace_id = 'worker-workspace' WHERE id = 'worker'");
  await db.run('UPDATE missions SET orchestrator_agent_id = NULL');
  await rejectResolution(db, {}, { code: 'BIOLOGICAL_WORKER_TENANT_MISMATCH', reason: 'tenant_authority_missing' });
}

async function privateWorkspace(db) {
  await db.exec(`INSERT INTO workspaces VALUES ('private-world', 'org', 'project');
    UPDATE agents SET workspace_id = 'private-world' WHERE id = 'worker';`);
  assert.equal((await identity.resolve(db, { agentId: 'worker', missionId: 'worker-mission' })).mission_id, 'worker-mission');
}

async function nullTenantDelegation(db, contractRecord) {
  await db.exec(`INSERT INTO workspaces VALUES ('private-world', NULL, NULL);
    UPDATE agents SET workspace_id = NULL WHERE id = 'parent';
    UPDATE agents SET workspace_id = 'private-world' WHERE id = 'worker';`);
  const run = await execution.createExecutionRun(db, { agentId: 'worker', missionId: 'worker-mission', contractRecord });
  assert.deepEqual((await bindings.binding(db, run.id)).tenant, { organizationId: null, projectId: null },
    'known parent without workspace may bind a private world in the same null tenant');
}

async function nullTenantForeign(db) {
  await db.run("UPDATE agents SET workspace_id = NULL WHERE id = 'parent'");
  await rejectResolution(db, { missionId: 'worker-mission' }, {
    code: 'BIOLOGICAL_WORKER_TENANT_MISMATCH', reason: 'tenant_mismatch' });
  await db.exec(`INSERT INTO workspaces VALUES ('private-world', NULL, 'project');
    UPDATE agents SET workspace_id = 'private-world' WHERE id = 'worker';`);
  await rejectResolution(db, { missionId: 'worker-mission' }, {
    code: 'BIOLOGICAL_WORKER_TENANT_MISMATCH', reason: 'tenant_mismatch' });
}

async function corruptAuthority(db) {
  await db.exec(`INSERT INTO workspaces VALUES ('private-world', NULL, NULL);
    UPDATE agents SET workspace_id = 'private-world' WHERE id = 'worker';
    UPDATE agents SET workspace_id = 'missing-workspace' WHERE id = 'parent';`);
  await rejectResolution(db, { missionId: 'worker-mission' }, {
    code: 'BIOLOGICAL_WORKER_TENANT_MISMATCH', reason: 'tenant_authority_missing', cause: 'workspace_reference_missing' });
  await db.exec(`UPDATE agents SET workspace_id = NULL WHERE id = 'parent';
    UPDATE agents SET parent_agent_id = 'missing-parent' WHERE id = 'worker';`);
  await assert.rejects(identity.resolve(db, { agentId: 'worker', missionId: 'worker-mission' }), error => {
    assert.equal(error.code, 'BIOLOGICAL_WORKER_TENANT_MISMATCH');
    assert.equal(error.diagnostic.authority, 'worker_parent');
    assert.equal(error.diagnostic.cause, 'authority_identity_missing');
    return true;
  });
  await db.run("UPDATE missions SET orchestrator_agent_id = 'missing-orchestrator'");
  await rejectResolution(db, { missionId: 'worker-mission' }, {
    code: 'BIOLOGICAL_WORKER_TENANT_MISMATCH', reason: 'tenant_authority_missing', cause: 'authority_identity_missing' });
}

async function actualCaller(db, contractRecord) {
  await addMission(db);
  const planning = require('../src/services/agentRuntimeAdapter/missionPlanning');
  const ctx = { db, agentId: 'worker', contractRecord, normalizedMission: { missionId: 'second-mission' }, runtimeBudget: { tokens: 10 } };
  await planning.createMissionExecutionRun(ctx);
  assert.equal((await bindings.binding(db, ctx.executionRun.id)).missionId, 'second-mission',
    'runtime planning forwards the explicit biological mission identity');
}

async function telemetrySchema(db) {
  await db.exec(`CREATE TABLE telemetry_events (event_id TEXT PRIMARY KEY, session_id TEXT,
    agent_id TEXT, event_type TEXT, action TEXT, detail TEXT, payload_json TEXT, severity TEXT,
    organization_id TEXT, project_id TEXT);`);
}

async function diagnosticPersistence(db, contractRecord) {
  await telemetrySchema(db);
  const planning = require('../src/services/agentRuntimeAdapter/missionPlanning');
  const ctx = { db, agentId: 'worker', contractRecord, normalizedMission: { missionId: 'wrong-mission' }, runtimeBudget: { tokens: 10 } };
  let sourceError;
  await assert.rejects(planning.createMissionExecutionRun(ctx), error => {
    assert.equal(error.code, 'BIOLOGICAL_WORKER_MISSION_NOT_FOUND');
    sourceError = error;
    return true;
  });
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM strategy_execution_runs')).n, 0, 'run is rolled back');
  const row = await db.get('SELECT * FROM telemetry_events');
  assert.equal(row.event_type, 'BIOLOGICAL_WORKER_MISSION_REJECTED');
  assert.equal(row.organization_id, 'org');
  assert.equal(row.project_id, 'project');
  const payload = JSON.parse(row.payload_json);
  assert.equal(payload.workerId, 'worker');
  assert.equal(payload.requestedMissionId, 'wrong-mission');
  assert.equal(payload.diagnostic.cause, 'requested_mission_not_assigned');
  assert.deepEqual(payload.diagnostic.assignments, [{ missionId: 'worker-mission', status: 'active', matchesRequestedIdentity: false }]);
  assert.equal(payload.promotionAuthorized, false);
  const fake = new Error('injected');
  fake.diagnostic = payload.diagnostic;
  fake.code = payload.code;
  assert.equal(await identity.recordRejected(db, { agentId: 'worker', error: fake }), null);
  assert.equal(await identity.recordRejected(db, { agentId: 'parent', error: sourceError }), null);
  assert.equal((await identity.recordRejected(db, { agentId: 'worker', error: sourceError })).eventId, row.event_id);
  const foreignDb = openDatabase();
  try { assert.equal(await identity.recordRejected(foreignDb, { agentId: 'worker', error: sourceError }), null); }
  finally { await foreignDb.close(); }
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM telemetry_events')).n, 1, 'untrusted errors cannot emit resolver diagnostics');
}

async function diagnosticFailureDoesNotMask(db, contractRecord) {
  const planning = require('../src/services/agentRuntimeAdapter/missionPlanning');
  const ctx = { db, agentId: 'worker', contractRecord, normalizedMission: { missionId: 'wrong-mission' }, runtimeBudget: { tokens: 10 } };
  await assert.rejects(planning.createMissionExecutionRun(ctx), { code: 'BIOLOGICAL_WORKER_MISSION_NOT_FOUND' });
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM strategy_execution_runs')).n, 0);
}

async function diagnosticCannotBeRewritten(db) {
  await telemetrySchema(db);
  let sourceError;
  await assert.rejects(identity.resolve(db, { agentId: 'worker', missionId: 'wrong-mission' }), error => {
    sourceError = error;
    return true;
  });
  sourceError.diagnostic = { rawPrompt: 'must-never-be-recorded' };
  sourceError.code = 'INJECTED_CODE';
  sourceError.message = 'must-never-be-recorded';
  await identity.recordRejected(db, { agentId: 'worker', error: sourceError });
  const row = await db.get('SELECT * FROM telemetry_events');
  const payload = JSON.parse(row.payload_json);
  assert.equal(payload.code, 'BIOLOGICAL_WORKER_MISSION_NOT_FOUND');
  assert.equal(payload.diagnostic.requestedMissionId, 'wrong-mission');
  assert.equal(payload.diagnostic.rawPrompt, undefined);
  assert.equal(row.detail.includes('must-never-be-recorded'), false);
}

async function main() {
  const probes = [noFallback, cardinality, inactiveAndMissing, invalidIdentity, foreignMission,
    parentTenant, missingAuthority, privateWorkspace, nullTenantDelegation, nullTenantForeign,
    corruptAuthority, actualCaller, diagnosticPersistence, diagnosticFailureDoesNotMask,
    diagnosticCannotBeRewritten];
  for (const probe of probes) await fixture(probe);
  console.log(`Trinity L2 worker identity: ${probes.length} SQLite scenarios passed.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
