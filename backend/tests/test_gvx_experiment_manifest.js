'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'p1-l01-test-key-only';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { migrateGvxLedger } = require('../src/db/migrations/migrateGvxLedger');
const protocol = require('../src/services/gvxExperimentProtocol');
const manifest = require('../src/services/gvxExperimentManifest');
const nursery = require('../src/services/gvxExperimentalNursery');
const registry = require('../src/services/gvxVerifierRegistry');
const values = require('../src/services/trinityProvenanceValues');
const fixture = require('./fixtures/gvxExperimentManifest.cjs');

function query(experimentId = fixture.input().experimentId) {
  const input = fixture.input();
  return { experimentId, scope: input.scope, entityId: input.entityId };
}

async function testRegistration(db) {
  const source = fixture.input();
  const started = await protocol.recordExperimentPlan(db, source);
  const plan = started.payload.plan;
  assert.equal(plan.protocolVersion, 2);
  assert.equal(manifest.verify(plan.experimentalManifest, fixture.context(plan)), true);
  const reordered = { ...source, controls: Object.fromEntries(Object.entries(source.controls).reverse()) };
  assert.equal((await protocol.recordExperimentPlan(db, reordered)).eventHash, started.eventHash);
  const read = await protocol.readExperimentManifest(db, query());
  assert.equal(read.status, 'linked');
  assert.deepEqual(read.manifest.payload.provenance, source.provenance);
  assert.equal(read.manifest.payload.scope.entityId, source.entityId);
  assert.equal(read.manifest.payload.worldBudget, source.worldBudget);
  assert.equal(await protocol.readExperimentManifest(db, { ...query(), scope: { ...source.scope, projectId: 'foreign' } }), null);
  return plan;
}

async function rejectPlanChange(db, plan) {
  const changed = structuredClone(plan);
  changed.controls.model = 'changed after admission';
  await assert.rejects(protocol.recordExperimentOutcomes(db, fixture.context(changed)), { code: 'GVX_EXPERIMENT_REGISTERED_PLAN_CHANGED' });
  const downgraded = structuredClone(plan);
  delete downgraded.experimentalManifest;
  downgraded.protocolVersion = 1;
  await assert.rejects(protocol.recordExperimentOutcomes(db, fixture.context(downgraded)), { code: 'GVX_EXPERIMENT_REGISTERED_PLAN_CHANGED' });
  await assert.rejects(protocol.recordExperimentOutcomes(db, fixture.context(plan, { candidateHash: values.hashBytes('foreign') })),
    { code: 'GVX_EXPERIMENT_MANIFEST_BINDING_CHANGED' });
  await assert.rejects(protocol.recordExperimentOutcomes(db, fixture.context(plan, { scope: { ...query().scope, projectId: 'foreign' } })),
    { code: 'GVX_EXPERIMENT_PLAN_NOT_REGISTERED' });
  const tampered = structuredClone(plan.experimentalManifest);
  tampered.payload.provenance.claims[0].statementHash = values.hashBytes('changed');
  assert.throws(() => manifest.verify(tampered), { code: 'GVX_EXPERIMENT_MANIFEST_CORRUPT' });
}

async function testFalseSuccess(db, plan) {
  const outcomes = plan.experimentDesign.arms.map(arm => ({ worldId: arm.worldId, status: 'completed', success: true, evidence: [] }));
  const event = await protocol.recordExperimentOutcomes(db, fixture.context(plan, { outcomes }));
  assert.equal(event.payload.assessment.status, 'blocked');
  assert.equal(event.payload.assessment.promotionAllowed, false);
  assert.equal(event.payload.manifestHash, plan.experimentalManifest.hash);
  const repeated = await protocol.recordExperimentOutcomes(db, fixture.context(plan, { outcomes }));
  assert.equal(repeated.eventHash, event.eventHash);
}

async function testLegacy(db) {
  const input = fixture.input();
  delete input.provenance;
  input.protocolVersion = 1;
  input.experimentId = 'legacy-experiment';
  const initial = await protocol.recordExperimentPlan(db, input);
  assert.equal((await protocol.readExperimentManifest(db, query(input.experimentId))).status, 'legacy_unlinked');
  const event = await protocol.recordExperimentOutcomes(db, fixture.context(initial.payload.plan));
  assert.equal(event.payload.assessment.status, 'inconclusive');
  assert.equal(event.payload.manifestHash, undefined);
  const unknown = { ...initial.payload.plan, experimentId: 'never-admitted' };
  await assert.rejects(protocol.recordExperimentOutcomes(db, fixture.context(unknown)), { code: 'GVX_EXPERIMENT_PLAN_NOT_REGISTERED' });
  await migrateGvxLedger(db);
  assert.equal((await protocol.readExperimentManifest(db, query())).status, 'linked');
}

async function expectInvalid(db, change, code) {
  const input = fixture.input();
  input.experimentId = 'invalid-not-written';
  change(input);
  await assert.rejects(protocol.recordExperimentPlan(db, input), { code });
  assert.equal(await protocol.readExperimentManifest(db, query(input.experimentId)), null);
}

async function testInvalidReferences(db) {
  await expectInvalid(db, input => { delete input.provenance; }, 'GVX_EXPERIMENT_INVALID');
  await expectInvalid(db, input => { input.protocolVersion = 3; }, 'GVX_EXPERIMENT_INVALID');
  await expectInvalid(db, input => { input.provenance.claims[0].status = 'verified'; }, 'GVX_EXPERIMENT_MANIFEST_INVALID');
  await expectInvalid(db, input => { input.provenance.hypotheses[0].claimIds = ['absent']; }, 'GVX_EXPERIMENT_REFERENCE_UNKNOWN');
  await expectInvalid(db, input => { input.provenance.interventions[0].armId = 'foreign'; }, 'GVX_EXPERIMENT_REFERENCE_UNKNOWN');
  await expectInvalid(db, input => { input.provenance.claims[0].sourceRefs = ['unknown-receipt']; }, 'GVX_EXPERIMENT_REFERENCE_UNKNOWN');
  await expectInvalid(db, input => { input.provenance.claims.push(input.provenance.claims[0]); }, 'GVX_EXPERIMENT_REFERENCE_DUPLICATE');
  await expectInvalid(db, input => { input.provenance.interventions[1].armId = 'baseline'; }, 'GVX_EXPERIMENT_INTERVENTION_MISSING');
  await expectInvalid(db, input => { input.provenance.lineage[0].runId = input.provenance.run.id; }, 'GVX_EXPERIMENT_LINEAGE_SELF_REFERENCE');
  await expectInvalid(db, input => { input.provenance.lineage = []; }, 'GVX_EXPERIMENT_PARENT_REFERENCE_MISSING');
}

function nurseryOptions(db) {
  const bytes = Buffer.from('retained experimental artifact');
  return { db, input: { ...fixture.input(), experimentId: 'integrated-nursery' },
    verifierRegistry: registry.fromTrustedRegistry(['artifact-integrity-v1']),
    createIsolatedWorld: async ({ arm }) => ({ worldId: arm.worldId, isolationId: arm.isolationId }),
    artifactReader: async () => bytes,
    runWorld: async () => ({ status: 'completed', cost: 1, evidence: [{
      requirement: 'artifact-integrity', verifierId: 'artifact-integrity-v1',
      artifactRef: 'fixture-artifact', artifactHash: values.hashBytes(bytes)
    }] }) };
}

async function testNurseryResume(db) {
  const options = nurseryOptions(db);
  const executed = [];
  let interrupted = false;
  const run = options.runWorld;
  options.runWorld = async input => {
    const registered = await protocol.readExperimentManifest(db, query(options.input.experimentId));
    assert.equal(registered.status, 'linked', 'admission manifest precedes execution');
    executed.push(input.arm.role);
    if (input.arm.role === 'candidate' && !interrupted) {
      interrupted = true;
      throw Object.assign(new Error('test interruption'), { code: 'TEST_INTERRUPTION' });
    }
    return run(input);
  };
  await assert.rejects(nursery.run(options), { code: 'TEST_INTERRUPTION' });
  const result = await nursery.run(options);
  assert.deepEqual(executed, ['baseline', 'candidate', 'candidate']);
  assert.equal(result.assessment.status, 'ready_for_independent_review');
  assert.equal(result.promotionAllowed, false, 'artifact integrity alone is not promotion');
  await nursery.run(options);
  assert.equal(executed.length, 3, 'completed arm records are reused');
}

function freshProcess(filename) {
  const child = spawnSync(process.execPath, [__filename, '--read', filename], { encoding: 'utf8', timeout: 30000 });
  assert.equal(child.status, 0, child.stdout + child.stderr);
  const observed = JSON.parse(child.stdout.trim());
  assert.notEqual(observed.processId, process.pid);
  assert.equal(observed.status, 'linked');
  assert.equal(observed.missionId, fixture.input().provenance.mission.id);
  assert.deepEqual(observed.claimStatuses, ['proposed', 'rejected', 'retracted']);
}

async function readChild(filename) {
  const db = await open({ filename, driver: sqlite3.Database });
  try {
    const observed = await protocol.readExperimentManifest(db, query());
    console.log(JSON.stringify({ processId: process.pid, status: observed.status,
      missionId: observed.manifest.payload.provenance.mission.id,
      claimStatuses: observed.manifest.payload.provenance.claims.map(claim => claim.status) }));
  } finally { await db.close(); }
}

async function testDatabaseTamper(filename) {
  const db = await open({ filename, driver: sqlite3.Database });
  try {
    await db.exec('DROP TRIGGER gvx_events_no_update');
    await db.run('UPDATE gvx_development_events SET payload_json=? WHERE id=?', '{}', `gvx-experiment:${query().experimentId}:started`);
    await assert.rejects(protocol.readExperimentManifest(db, query()), { code: 'GVX_LEDGER_CHAIN_INVALID' });
  } finally { await db.close(); }
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-p1-l01-'));
  const filename = path.join(root, 'experimental.db');
  const db = await open({ filename, driver: sqlite3.Database });
  try {
    await migrateGvxLedger(db);
    const plan = await testRegistration(db);
    await rejectPlanChange(db, plan);
    await testFalseSuccess(db, plan);
    await testLegacy(db);
    await testInvalidReferences(db);
    await testNurseryResume(db);
  } finally { await db.close(); }
  try {
    freshProcess(filename);
    await testDatabaseTamper(filename);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
  console.log('P1 L01 manifest: durable linked provenance, registered-plan binding, refusals, legacy compatibility and nursery resume passed.');
}

const job = process.argv[2] === '--read' ? readChild(process.argv[3]) : main();
job.catch(error => { console.error(error); process.exitCode = 1; });
