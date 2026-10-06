'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
const contract = require('../src/services/trinityQualificationContract');
const dispatch = require('../src/services/trinityDispatchPreparation');
const bridge = require('../src/services/trinityQualificationDispatch');
const trinity = require('../src/services/trinityService');
const manifest = require('../src/services/trinityRunManifest');
const trace = require('../src/services/trinityTraceEvents');
const journal = require('../src/services/trinityExecutionJournal');

function makeContract(text = 'Justifie chaque résultat.') {
  return contract.create({ originalMission: 'Trouve les paires dont la somme vaut 22.',
    requirements: [{ id: 'r', text, kind: 'semantic', scope: 'fixture', verificationRefs: ['v'] }],
    fixtures: [{ id: 'f', description: 'Jeu borné déclaré.', input: { numbers: [3, 7, 8, 11, 15, 19], target: 22 },
      limitations: ['Ne prouve pas une méthode universelle.'], requirementIds: ['r'] }],
    verificationRefs: [{ id: 'v', verifierId: 'pairs', verifierVersion: '1', verifierDigest: contract.hashText('pairs-v1'),
      scope: 'fixture', requirementIds: ['r'], fixtureIds: ['f'] }],
    scope: { kind: 'fixture', limitations: ['Qualification limitée au jeu de nombres.'] },
    privateOracle: { expectedPairs: [[3, 19], [7, 15]], marker: 'PRIVATE_ORACLE_CANARY' } }).publicContract;
}

async function database() {
  const db = await sqlite.open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`CREATE TABLE trinity_experiments (id TEXT PRIMARY KEY, mission_id TEXT, domain TEXT,
    mission_snapshot_hash TEXT, design_json TEXT, isolation_policy_json TEXT, budget_policy_json TEXT,
    status TEXT, decision_json TEXT, failure_reason TEXT, updated_at TEXT);
    CREATE TABLE trinity_experiment_transitions (experiment_id TEXT, from_status TEXT, to_status TEXT,
      actor TEXT, reason TEXT, evidence_ref TEXT);
    CREATE TABLE trinity_worlds (id TEXT, world_number INTEGER, agent_id TEXT, experiment_id TEXT, snapshot_hash TEXT, workspace_root TEXT);`);
  return db;
}

async function qualificationDispatch(input) {
  const original = input.contract.originalMission.text;
  const members = trinity.compose(original, { variantId: 'controlled', qualificationContract: input.contract });
  assert.ok(members.every(member => member.mission.includes('Versioned public mission contract')));
  assert.ok(members.every(member => !member.mission.includes('PRIVATE_ORACLE_CANARY')));
  const request = { trinityContract: input.contract, executionBudget: { tokens: 900 } };
  const preparation = { context: { request, repoRoot: input.root, orchestratorId: 'parent' },
    parent: { workspace_root: input.source }, missionId: 'qualified', mission: original, members, selection: members[0].variantSelection };
  const sealed = await dispatch.prepare(input.db, preparation);
  assert.equal(sealed.design.qualificationStatus, 'contract_recorded');
  assert.equal(sealed.design.runManifest.payload.observedRuntime.status, 'unknown');
  assert.equal((await dispatch.prepare(input.db, preparation)).idempotent, true);
  await changedInputsRejected(input.db, preparation);
  return { preparation, sealed };
}

async function changedInputsRejected(db, input) {
  const changedContract = { ...input, context: { ...input.context, request: { ...input.context.request, trinityContract: makeContract('Une autre obligation.') } } };
  await assert.rejects(dispatch.prepare(db, changedContract), { code: 'TRINITY_EXPERIMENT_ID_CONFLICT' });
  const members = input.members.map(member => ({ ...member, mission: member.mission + '\nDIFFERENT PROMPT' }));
  await assert.rejects(dispatch.prepare(db, { ...input, members }), { code: 'TRINITY_EXPERIMENT_ID_CONFLICT' });
  await assert.rejects(dispatch.prepare(db, { ...input, mission: input.mission + ' Réponse attendue injectée.' }), { code: 'TRINITY_ORIGINAL_MISSION_CHANGED' });
}

async function runtimeCaptured(input) {
  await input.db.run('INSERT INTO trinity_worlds VALUES (?, ?, ?, ?, ?, ?)', ['w1', 1, 'worker', 'qualified', input.sealed.snapshotHash, input.sealed.snapshotRoot]);
  const runtime = { db: input.db, agentId: 'worker', executionRun: { id: 'actual-run-1' },
    dispatchedAgent: { organization_id: 'tenant' }, normalizedMission: {
      missionScope: { missionId: 'qualified', trinityExperimentId: 'qualified' }, role: 'direct', workerKind: 'proposal',
      workspaceRoot: input.sealed.snapshotRoot, prompt: input.member.mission + '\nACTUAL RUNTIME RULE',
      orchestratorAgentId: 'parent', toolLease: ['genos_search_failures'], localModel: 'configured-route' } };
  const captured = await bridge.recordStarted(runtime);
  assert.equal(captured.payload.correlation.runId, 'actual-run-1');
  assert.equal(captured.payload.correlation.tenantId, 'tenant');
  assert.equal(captured.payload.observedRuntime.status, 'unknown');
  assert.deepEqual(await manifest.read(input.db, captured.payload.correlation), captured);
  assert.deepEqual(await bridge.recordStarted(runtime), captured);
  await runtimeScopeRejected(runtime);
  const changed = { ...runtime, normalizedMission: { ...runtime.normalizedMission, prompt: 'changed runtime prompt' } };
  await assert.rejects(bridge.recordStarted(changed), { code: 'TRINITY_REPLAY_MANIFEST_CHANGED' });
  const events = await trace.read(input.db, { missionId: 'qualified', workerId: 'worker' });
  assert.equal(events[0].details.manifestHash, captured.hash);
  await require('../src/services/trinityRuntimeTrace').observe(runtime, { id: 'event-1', eventType: 'EVIDENCE_REPORT', payload: { outcome: 'success' } });
  const observed = await trace.read(input.db, { missionId: 'qualified', workerId: 'worker' });
  assert.equal(observed[1].details.eventType, 'EVIDENCE_REPORT');
  assert.equal(observed[1].details.decisionAuthority, 'none');
  assert.equal(observed[1].status, 'observed');
  assert.notEqual(captured.payload.inputHashes.publicPrompt, input.sealed.design.runManifest.payload.inputHashes.publicPrompt);
  const candidate = { answer: 'Une sortie locale.' };
  assert.equal(contract.verify(input.contract, candidate).status, 'candidate');
}

async function runtimeScopeRejected(runtime) {
  const wrongMission = { ...runtime.normalizedMission, missionScope: { missionId: 'foreign', trinityExperimentId: 'qualified' } };
  const wrongParent = { ...runtime.normalizedMission, orchestratorAgentId: 'foreign-parent' };
  const wrongRoot = { ...runtime.normalizedMission, workspaceRoot: path.join(os.tmpdir(), 'foreign-workspace') };
  for (const normalizedMission of [wrongMission, wrongParent, wrongRoot]) {
    await assert.rejects(bridge.recordStarted({ ...runtime, normalizedMission }), { code: 'TRINITY_WORKER_SCOPE_INVALID' });
  }
  await runtimeObservationScopeRejected(runtime, { wrongParent, wrongRoot });
}

async function runtimeObservationScopeRejected(runtime, mutations) {
  const observer = require('../src/services/trinityRuntimeTrace');
  const event = { id: 'scope-negative', eventType: 'EVIDENCE_REPORT', payload: {} };
  const wrongExperiment = { ...runtime.normalizedMission, missionScope: { missionId: 'qualified', trinityExperimentId: 'foreign-experiment' } };
  const contexts = [
    { ...runtime, agentId: 'foreign-worker' },
    { ...runtime, normalizedMission: wrongExperiment },
    { ...runtime, normalizedMission: mutations.wrongParent },
    { ...runtime, normalizedMission: mutations.wrongRoot },
    { ...runtime, dispatchedAgent: { organization_id: 'foreign-tenant' } }
  ];
  for (const context of contexts) await assert.rejects(observer.observe(context, event), { code: 'TRINITY_WORKER_SCOPE_INVALID' });
  const rows = await trace.read(runtime.db, { missionId: 'qualified' });
  assert.equal(rows.some(row => row.details.sourceEventId === event.id), false);
}

async function failureAndReplay(db) {
  const context = { db, missionId: 'failure-trace', configuration: { budget: 90 } };
  await assert.rejects(journal.phase(context, 'validation', async () => { throw Object.assign(new Error('stop'), { code: 'SENTINEL_HALTED' }); }));
  let runs = 0;
  const execute = async () => { runs += 1; return { localPass: true }; };
  await journal.phase(context, 'validation', execute);
  await journal.phase(context, 'validation', execute);
  assert.equal(runs, 1);
  const events = await trace.read(db, { missionId: context.missionId });
  assert.deepEqual(events.map(event => event.status), ['started', 'failed', 'started', 'completed', 'replayed']);
  assert.equal(events[1].details.errorCode, 'SENTINEL_HALTED');
  assert.notEqual(events[0].stageId, events[2].stageId);
}

async function legacyObservation(db) {
  const record = { value: { old: true }, digest: journal.digest({ old: true }) };
  await db.run('INSERT INTO trinity_runtime_journal VALUES (?, ?, ?, ?)', ['old', 'comparison', journal.digest({}), JSON.stringify(record)]);
  const result = await journal.phase({ db, missionId: 'old', configuration: {} }, 'comparison', async () => { throw new Error('must not execute'); });
  assert.deepEqual(result, record.value);
  const events = await trace.read(db, { missionId: 'old' });
  assert.deepEqual(events.map(event => event.status), ['observed']);
  assert.equal(events[0].details.qualification, 'legacy-cache-observation');
  assert.equal(events[0].details.cutoff.missionSeq, 0);
}

async function prelaunchRefusal(input) {
  const previousModels = process.env.GENOS_TRINITY_MODELS;
  process.env.GENOS_TRINITY_MODELS = '';
  try {
    await assert.rejects(require('../bin/topologyTrinityHandler.cjs').handle({ db: input.db,
      context: { request: { mission: 'Calcule mentalement 19 × 27.', variant_id: 'heterogeneous', trinityMissionId: 'diversity-refusal' },
        repoRoot: input.root, orchestratorId: 'parent' },
      ensureParent: async () => ({}), workerGarage: { state: async () => ({ available: 3 }) },
      buildNCEEnrichments: async () => null }), { code: 'TRINITY_DIVERSITY_BELOW_THRESHOLD' });
    const events = await trace.read(input.db, { missionId: 'diversity-refusal' });
    assert.deepEqual(events.map(event => event.status), ['started', 'failed']);
    assert.equal(events[1].details.errorCode, 'TRINITY_DIVERSITY_BELOW_THRESHOLD');
    assert.equal(await input.db.get('SELECT id FROM trinity_experiments WHERE id=?', 'diversity-refusal'), undefined);
  } finally {
    if (previousModels === undefined) delete process.env.GENOS_TRINITY_MODELS;
    else process.env.GENOS_TRINITY_MODELS = previousModels;
  }
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'trinity-l1-integration-'));
  const db = await database();
  try {
    const source = path.join(root, 'source');
    await fs.mkdir(source);
    await fs.writeFile(path.join(source, 'candidate.js'), 'module.exports = [];');
    const publicContract = makeContract();
    const { preparation, sealed } = await qualificationDispatch({ root, source, db, contract: publicContract });
    await runtimeCaptured({ db, sealed, member: preparation.members[0], contract: publicContract });
    await failureAndReplay(db);
    await legacyObservation(db);
    await prelaunchRefusal({ db, root });
    console.log('Trinity L1: real preparation, contract/prompt conflicts, actual runtime manifest, failed/retried/replayed phases and legacy cutoff: PASS');
  } finally {
    await db.close();
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    await fs.rm(root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
