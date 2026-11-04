'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-topology-incarnation-'));
process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_DB_BACKUP_SKIP = '1';
process.env.GENOS_DB_PATH = path.join(root, 'test.db');
process.env.GENOS_STUDIO_ROOT = path.join(root, 'studio');
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'topology-incarnation-test-only';
process.env.GENOS_AGENT_DNA = '0';
process.env.NODE_ENV = 'test';
const database = require('../src/db');
const dna = require('../src/services/agentDna');
const store = require('../src/services/agentDnaStore');
const incarnation = require('../src/services/workerDnaIncarnation');
const expression = require('../src/services/workerGenomeExpression');
const scope = { organizationId: 'delegation-org', projectId: 'delegation-project' };

async function inputFor(db, id) {
  await require('../src/services/topologyWorkerPersistenceService').ensureTopologyWorker(db, {
    workerId: id, parentId: 'delegation-root', workspaceId: 'delegation-ws',
    role: 'literary_author', workerKind: 'creative_worker', mission: 'Write an original screenplay.' });
  return { agent: await db.get('SELECT * FROM agents WHERE id=?', id), mission: {
    agentId: id, missionId: 'delegation-mission', workerKind: 'creative_worker', role: 'literary_author', prompt: 'Write an original screenplay.',
    workerAssignment: { genomeRef: 'topology-dna' },
    toolLease: ['genos_snapshot', 'genos_inspect', 'genos_orchestrate'] } };
}

async function threeMembers(db) {
  for (const id of ['topology-author', 'topology-consumer', 'topology-replacement']) {
    const input = await inputFor(db, id);
    await incarnation.prepare(db, input);
    await require('../src/services/workerGenomeHydration').hydrate(db, input);
    assert.equal(input.mission.clinicalAdmission.checked, true);
    assert.ok(await require('../src/services/medical/clinicalStateService').getClinicalState(db, id));
    assert.ok(input.mission.prompt.includes('Inherited genome phenotype'));
    assert.ok(input.mission.toolLease.every(tool => input.mission.genome.tools.includes(tool)));
    assert.ok(!input.mission.toolLease.includes('genos_orchestrate'));
    assert.deepEqual(expression.samplingOptions(input.mission), {
      temperature: input.mission.genome.temp, topP: input.mission.genome.topP });
    const row = await db.get('SELECT * FROM agents WHERE id=?', id);
    const binding = incarnation.verifiedBinding(row, scope);
    assert.equal(binding.agentId, id);
    assert.equal(binding.genomeRef, 'topology-dna');
    const trace = await db.get('SELECT agent_id FROM agent_genome_selections WHERE id=?', binding.selectionId);
    assert.equal(trace.agent_id, id, 'The selection belongs to the actual worker, not its parent');
    const sealed = expression.authorityBinding(input.mission);
    assert.equal(sealed.dnaIncarnationHash.length, 64);
    const protocol = require('../src/services/runtimeProtocol');
    const transported = protocol.decodeMission(protocol.encodeMission(input.mission));
    assert.deepEqual(transported.dnaIncarnation, binding);
    expression.assertAuthority(sealed, transported);
    assert.throws(() => expression.assertAuthority(sealed, { ...input.mission,
      dnaIncarnation: { ...binding, genomeRef: 'substituted' } }), { code: 'EXECUTION_AUTHORITY_CONTEXT_CHANGED' });
  }
}

async function refusalCases(db) {
  const input = await inputFor(db, 'topology-author');
  await incarnation.prepare(db, input);
  const original = input.agent.metadata_json;
  const metadata = JSON.parse(original);
  metadata.dnaIncarnation.genes.temp = 0.99;
  await db.run('UPDATE agents SET metadata_json=? WHERE id=?', JSON.stringify(metadata), input.agent.id);
  await assert.rejects(incarnation.prepare(db, input), { code: 'WORKER_DNA_BINDING_INVALID' });
  await db.run('UPDATE agents SET metadata_json=? WHERE id=?', original, input.agent.id);
  await db.run("UPDATE agent_genomes SET status='candidate' WHERE id='topology-dna'");
  await assert.rejects(incarnation.prepare(db, input), { code: 'WORKER_DNA_SOURCE_CHANGED' });
  await db.run("UPDATE agent_genomes SET status='active' WHERE id='topology-dna'");
  await require('../src/services/agentDnaPolicy').setPolicy(db, scope, true);
  await assert.rejects(incarnation.prepare(db, input), { code: 'WORKER_DNA_UNTRUSTED' });
  await require('../src/services/agentDnaPolicy').setPolicy(db, scope, false);
  await assert.rejects(incarnation.prepare(db, { ...input,
    agent: { ...input.agent, workspace_id: 'foreign-workspace' } }), { code: 'WORKER_GENOME_SCOPE_MISMATCH' });
  const missing = await inputFor(db, 'topology-no-genome');
  missing.mission.workerAssignment.genomeRef = 'unknown-genome';
  await assert.rejects(incarnation.prepare(db, missing), { code: 'GENOME_BINDING_REJECTED' });
  await db.run("UPDATE clinical_states SET pathogen_burden=1,immune_titer=0 WHERE agent_id='topology-consumer'");
  const quarantined = await inputFor(db, 'topology-consumer');
  await assert.rejects(incarnation.prepare(db, quarantined), { code: 'AGENT_QUARANTINED' });
  assert.equal((await db.get("SELECT status FROM agents WHERE id='topology-consumer'")).status, 'blocked');
  assert.equal((await db.get("SELECT cell_cycle_state FROM clinical_states WHERE agent_id='topology-consumer'")).cell_cycle_state, 'arrested');
}

async function biologicalCapture(db, contract) {
  const input = await inputFor(db, 'topology-replacement');
  await incarnation.prepare(db, input);
  await require('../src/services/workerGenomeHydration').hydrate(db, input);
  await require('../src/services/missionIdentityService').attachAgent(db, {
    missionId: 'delegation-mission', agentId: input.agent.id, role: 'literary_author' });
  const run = await require('../src/services/strategyExecutionService').createExecutionRun(db, {
    agentId: input.agent.id, missionId: 'delegation-mission', contractRecord: contract,
    budget: { tokens: 10000, costUsd: 1, latencyMs: 10000 } });
  const binding = await require('../src/services/biologicalWorkerStore').binding(db, run.id);
  assert.equal(binding.genome.dna.genomeRef, 'topology-dna');
  assert.equal(binding.genome.dna.contentHash, input.mission.dnaIncarnation.contentHash);
  assert.equal(binding.genome.dna.agentId, input.agent.id);
  assert.equal(binding.clinicalAdmission.signature, input.mission.clinicalAdmission.signature);
  await clinicalBinding(db, { input, run });
}

async function clinicalBinding(db, context) {
  const { input, run } = context;
  input.mission.workspaceRoot = root;
  input.mission.timeoutMs = 10000;
  input.mission.workerContract = JSON.parse(input.agent.metadata_json).workerContract;
  input.mission.toolLease = require('../src/services/toolLeasePolicy').derivePolicyLease({
    executionMode: 'worker', role: input.mission.role, capabilities: [] });
  expression.apply(input.mission, input.mission.genome);
  await require('../src/services/agentRuntimeAdapter/missionLease').enforceMissionToolLease({ db,
    agentId: input.agent.id, normalizedMission: input.mission, dispatchedAgent: input.agent });
  const authority = require('../src/services/missionEnvelopeAuthority');
  await authority.seal({ db, agentId: input.agent.id, normalizedMission: input.mission,
    dispatchedAgent: input.agent, executionRun: run, autonomyPlan: {}, authorityExecutable: process.execPath });
  const clinical = require('../src/services/workerClinicalAdmission');
  const expected = { runId: run.id, agentId: input.agent.id, missionId: 'delegation-mission', scope };
  const saved = await clinical.verifyRun(db, expected);
  const sealed = await authority.assertRun(db, { ...expected, mission: input.mission });
  assert.equal(sealed.envelope.clinicalAdmissionHash, saved.hash);
  await assert.rejects(authority.assertRun(db, { ...expected, mission: { ...input.mission,
    clinicalAdmission: { ...saved.record, stateDigest: 'substitution' } } }), { code: 'WORKER_CLINICAL_ADMISSION_INVALID' });
  await db.run('UPDATE immune_events SET event_json=? WHERE id=?', '{}', saved.record.scan.id);
  await assert.rejects(clinical.verifyRun(db, expected), { code: 'WORKER_CLINICAL_SOURCE_CHANGED' });
  await db.run('UPDATE immune_events SET event_json=? WHERE id=?', saved.record.scan.event_json, saved.record.scan.id);
  const historicalAt = new Date().toISOString();
  await new Promise(resolve => setTimeout(resolve, 1100));
  await require('../src/services/medical/immuneSurveillanceService').quarantine(db, input.agent.id,
    { reason: 'Native quarantine revokes the prior clinical admission' });
  await assert.rejects(authority.assertRun(db, expected), { code: 'WORKER_CLINICAL_ADMISSION_REVOKED' });
  await db.run("UPDATE agents SET status='idle' WHERE id=?", input.agent.id);
  await db.run("UPDATE clinical_states SET cell_cycle_state='G0' WHERE agent_id=?", input.agent.id);
  await assert.rejects(clinical.verifyRun(db, expected), { code: 'WORKER_CLINICAL_ADMISSION_REVOKED' });
  assert.equal((await clinical.verifyRun(db, { ...expected, at: historicalAt })).hash, saved.hash,
    'Historical verification does not turn a revoked admission into current authority');
}

async function main() {
  const db = await database.getDatabase();
  try {
    const contract = await require('./test_bounded_worker_delegation').seed(db, root);
    const model = dna.decodeFile(path.resolve(__dirname, 'fixtures/agent-dna-v1/preuve_evidence.dna'));
    await store.saveGenome(db, model, { id: 'topology-dna', ...scope });
    process.env.GENOS_AGENT_DNA = '1';
    await threeMembers(db);
    await biologicalCapture(db, contract);
    await refusalCases(db);
    console.log('Topology DNA incarnation, expression, clinical gate and biological capture: PASS');
  } finally { await database.closeDatabase(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
