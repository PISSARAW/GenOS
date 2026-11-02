'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_DB_BACKUP_SKIP = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'gqel-native-contracts-test-only';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const quality = require('../src/services/qualityElevation/qualityMissionContract');
const { compileQualityContract } = require('../src/services/qualityElevation/qualityContract');
const kinds = require('../src/services/agents/workerKindService');
const enforcement = require('../src/services/agents/workerContractEnforcement');
const { buildWorkerMission } = require('../src/services/orchestratorDispatchService');
const { buildLocalMission } = require('../bin/orchestratorWindowsLocalExecution.cjs');
const runtimeContext = require('../bin/orchestratorMissionRuntimeContext.cjs');

function specification() {
  return { qualityElevation: compileQualityContract({ mission: 'Écrire une fiction avec un choix observable.', domain: 'creative_writing' }),
    qualityRuntime: { generatorModel: 'ollama://author', reviewers: [{ id: 'reader', model: 'ollama://reader' }], planScenes: false } };
}

function missionFieldsSurviveBuilders() {
  const spec = specification();
  const mission = buildWorkerMission({ ...spec, agentId: 'author', orchestratorAgentId: 'parent',
    role: 'literary_author', prompt: 'Le brief', workerTokenLimit: 5000 });
  assert.equal(mission.qualityElevation.contractId, spec.qualityElevation.contractId);
  assert.equal(mission.workerContract.qualityElevation.digest, spec.qualityElevation.digest);
  assert.deepEqual(mission.workerContract.qualityRuntime, spec.qualityRuntime);
  assert.equal(Object.isFrozen(mission.workerContract.qualityElevation.criteria), true);
  enforcement.assertRuntimeContract(mission.workerContract, 'creative_worker');
  enforcement.assertAssignmentMatches(mission.workerContract, mission);
  const local = buildLocalMission({ id: 'author', enhancedPrompt: 'Le brief', request: { ...spec, workerKind: 'creative_worker' },
    missionBudget: { tokens: 5000, costUsd: 1 }, requestTimeoutMs: 10000, allowedCommands: [], allowFileEdits: false });
  assert.equal(local.qualityElevation.contractId, spec.qualityElevation.contractId);
  assert.deepEqual(runtimeContext(spec).qualityRuntime, spec.qualityRuntime);
  assert.equal(quality.qualityAuthority({}), null);
  assert.equal(buildWorkerMission({ role: 'worker' }).workerContract.qualityElevation, undefined);
}

function persistedQualityCannotBeReassigned() {
  const spec = specification();
  const contract = kinds.buildWorkerContract('creative_worker', { ...spec, orchestratorAgentId: 'parent' });
  const restored = {};
  quality.restoreWorkerQuality(restored, JSON.parse(JSON.stringify(contract)));
  assert.equal(restored.qualityElevation.contractId, spec.qualityElevation.contractId);
  assert.throws(() => quality.restoreWorkerQuality({ qualityElevation: null }, contract), { code: 'GQEL_CONTRACT_CHANGED' });
  assert.throws(() => quality.restoreWorkerQuality(specification(), contract), { code: 'GQEL_CONTRACT_CHANGED' });
  assert.throws(() => quality.restoreWorkerQuality({ qualityRuntime: { generatorModel: 'ollama://other' } }, contract), { code: 'GQEL_CONTRACT_CHANGED' });
  const changed = structuredClone(contract);
  changed.qualityElevation.threshold = 0;
  assert.throws(() => enforcement.assertRuntimeContract(changed, 'creative_worker'), { code: 'GQEL_CONTRACT_CHANGED' });
  const repair = { schema: 'genos.quality-repair-request/v1', attempt: 1, unverifiedCriteria: ['brief_coverage'] };
  const request = { ...spec, qualityRepair: repair };
  quality.restoreWorkerQuality(request, contract);
  assert.deepEqual(request.qualityRepair, repair);
  assert.equal(kinds.buildWorkerContract('creative_worker', request).qualityRepair, undefined);
}

function fleetScopesRemainSeparate() {
  const fleet = require('../src/services/agentFleetWorkers');
  const parentQuality = specification(), childQuality = specification();
  const parent = { id: 'parent', execution_mode: 'orchestrator' };
  const base = { id: 'author', identity: { name: 'Auteur' }, parent, plan: {}, prompt: 'Écrire',
    mission: { ...parentQuality, prompt: 'Livrable collectif' }, assignedTokens: 4000 };
  const assignment = quality.prepareQualityMission({ ...childQuality, workerKind: 'creative_worker', role: 'literary_author' });
  const author = fleet.workerIdentity({ ...base, assignment });
  assert.equal(author.workerContract.qualityElevation.contractId, childQuality.qualityElevation.contractId);
  const scout = fleet.workerIdentity({ ...base, assignment: { workerKind: 'scout_cell', role: 'scout_cell' } });
  assert.equal(scout.workerContract.qualityElevation, undefined);
  const runtime = fleet.workerRuntime({ ...base, assignment, route: {}, capabilities: [], toolLease: [] });
  assert.equal(runtime.qualityElevation.contractId, childQuality.qualityElevation.contractId);
}

function publicAssignmentsRemainUsable() {
  const spec = specification();
  const args = { mission: 'Écrire', ...spec, worker_assignments: { literary_author: spec } };
  assert.equal(require('../src/services/mcpArgumentValidation').validateToolArguments('genos_orchestrate', args), null);
  const members = require('../src/services/topologyWorkerKindService').applyTopologyWorkerKinds('a-team',
    [{ role: 'literary_author', mission: 'Écrire' }], args.worker_assignments);
  assert.equal(members[0].qualityElevation.contractId, spec.qualityElevation.contractId);
  const direct = require('../bin/directWorkerContext.cjs').attachEnvelope({}, spec);
  assert.equal(direct.qualityElevation.contractId, spec.qualityElevation.contractId);
  const payload = require('../bin/workerLaunchPayload.cjs').workerLaunchPayload({ member: members[0],
    context: { request: {} }, workerId: 'author', parent: {} });
  assert.equal(payload.qualityElevation.contractId, spec.qualityElevation.contractId);
}

async function topologyPersistsQuality() {
  let inserted;
  const db = { get: async () => null, run: async (...args) => { inserted = args; return { changes: 1 }; } };
  const spec = specification();
  await require('../src/services/topologyWorkerPersistenceService').ensureTopologyWorker(db,
    { ...spec, workerId: 'author', parentId: 'parent', role: 'literary_author', workerKind: 'creative_worker', mission: 'Le brief' });
  const saved = JSON.parse(inserted.at(-1));
  assert.equal(saved.workerContract.qualityElevation.contractId, spec.qualityElevation.contractId);
  assert.deepEqual(saved.workerContract.qualityRuntime, spec.qualityRuntime);
}

async function authorityRejectsQualityMutation(root) {
  const { openDatabase } = require('./helpers/biologyDatabase');
  const fixture = require('./helpers/biologicalWorkerFixture');
  const authority = require('../src/services/missionEnvelopeAuthority');
  const db = openDatabase(path.join(root, 'authority.db'));
  try {
    await fixture.workerSchema(db);
    await db.exec('ALTER TABLE agents ADD COLUMN status TEXT; ALTER TABLE agents ADD COLUMN isolation_mode TEXT; ALTER TABLE mission_agents ADD COLUMN role TEXT; CREATE TABLE aeis_agent_dissonance(agent_id TEXT PRIMARY KEY,authority_level INTEGER);');
    const record = await fixture.addWorker(db);
    await require('../src/services/missionExecutionAuthority').rotate(db, { missionId: 'worker-mission', agentId: 'parent', forceRotate: true });
    const spec = specification();
    const workerContract = kinds.buildWorkerContract('creative_worker', { ...spec, orchestratorAgentId: 'parent' });
    await db.run('UPDATE agents SET metadata_json=? WHERE id=?', JSON.stringify({ workerContract }), 'worker');
    const run = await require('../src/services/strategyExecutionService').createExecutionRun(db,
      { agentId: 'worker', contractRecord: record, missionId: 'worker-mission', budget: { tokens: 1000, latencyMs: 300000 } });
    const ctx = { db, agentId: 'worker', executionRun: run, executable: process.execPath, autonomyPlan: {},
      normalizedMission: { ...spec, workerContract, agentId: 'worker', missionId: 'worker-mission', workspaceRoot: root, toolLease: [], timeoutMs: 300000 } };
    await authority.seal(ctx);
    const input = { agentId: 'worker', runId: run.id, mission: JSON.parse(JSON.stringify(ctx.normalizedMission)) };
    assert.equal((await authority.assertRun(db, input)).status, 'authorized');
    const saved = await authority.read(db, run.id);
    assert.equal(saved.envelope.qualityElevation.contractDigest, spec.qualityElevation.digest);
    await rejectChangedQuality(authority, db, input);
  } finally { await db.close(); }
}

async function rejectChangedQuality(authority, db, input) {
  const mutate = [mission => { mission.qualityElevation = specification().qualityElevation; },
    mission => { mission.qualityRuntime.generatorModel = 'ollama://changed'; },
    mission => { delete mission.qualityElevation; delete mission.workerContract.qualityElevation; },
    mission => { delete mission.workerContract.qualityElevation; },
    mission => { mission.qualityRepair = { attempt: 2 }; }];
  for (const change of mutate) {
    const changed = structuredClone(input);
    change(changed.mission);
    await assert.rejects(authority.assertRun(db, changed), { code: 'EXECUTION_AUTHORITY_CONTEXT_CHANGED' });
  }
}

async function main() {
  missionFieldsSurviveBuilders(); persistedQualityCannotBeReassigned(); fleetScopesRemainSeparate(); publicAssignmentsRemainUsable();
  await topologyPersistsQuality();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-gqel-contracts-'));
  try { await authorityRejectsQualityMutation(root); }
  finally { await fs.rm(root, { recursive: true, force: true }); }
  console.log('GQEL native contracts: propagation, scope and sealed authority PASS. No LLM was called.');
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { main };
