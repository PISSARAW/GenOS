'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'p1-runtime-test-key-only';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { openDatabase } = require('./helpers/biologyDatabase');
const fixture = require('./helpers/biologicalWorkerFixture');
const manifestFixture = require('./fixtures/gvxExperimentManifest.cjs');
const execution = require('../src/services/strategyExecutionService');
const provenance = require('../src/services/gvxMissionProvenance');
const protocol = require('../src/services/gvxExperimentProtocol');
const artifacts = require('../src/services/gvxManifestArtifacts');
const values = require('../src/services/trinityProvenanceValues');
const science = require('../src/services/scientificEvidenceLedger');
const scope = { organizationId: 'org', projectId: 'project', entityId: 'worker' };

async function seed(db) {
  await fixture.workerSchema(db);
  await db.exec(`CREATE TABLE experiments (id TEXT PRIMARY KEY, workspace_id TEXT, experiment_type TEXT);
    INSERT INTO experiments VALUES ('source-exp', 'worker-workspace', 'scientific_experiment');`);
  await require('../src/db/migrations/migrateScientificEvidenceLedger').migrateScientificEvidenceLedger(db);
  const ledger = science.createScientificEvidenceLedger(db);
  await ledger.createExperiment({ experimentId: 'source-exp', title: 'Source experiment', proofLevel: 'L2', createdBy: 'researcher' });
  await ledger.recordClaim({ experimentId: 'source-exp', claimId: 'source-claim', statement: 'Subset-sum has a valid witness', createdBy: 'researcher' });
  return fixture.addWorker(db);
}

function procedure(filename, runId) {
  const child = spawnSync(process.execPath, [path.join(__dirname, 'helpers/biologicalWorkerProbe.cjs'), 'execute', filename, runId],
    { encoding: 'utf8', timeout: 30000 });
  assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout);
  assert.equal(result.result.output.sum, 5);
  return result;
}

async function measuredRun(db, filename, contractRecord) {
  const run = await execution.createExecutionRun(db, { agentId: 'worker', contractRecord, budget: { tokens: 0, deterministic: true } });
  const result = procedure(filename, run.id);
  const saved = await execution.recordExecutionEvent(db, 'worker', fixture.completion(run.id,
    { report: result.report, usage: { total_tokens: 0, cost_usd: 0 } }));
  return { run, receipt: saved.biologicalReceipt, binding: await provenance.readRun(db, { runId: run.id, scope }) };
}

async function runtimeInput(db, measured) {
  const input = manifestFixture.input();
  input.scope = { organizationId: scope.organizationId, projectId: scope.projectId };
  input.entityId = scope.entityId;
  input.experimentId = 'runtime-linked-experiment';
  const artifact = await artifacts.register(db, { scope, bytes: Buffer.from('Pinned protocol source'), kind: 'protocol' });
  input.provenance.mission = { id: measured.binding.mission.id, contractHash: measured.binding.mission.contractHash,
    runtime: 'genos-node', bindingHash: measured.binding.hash };
  input.provenance.run = { id: measured.run.id, parentRunId: null };
  input.provenance.lineage = [];
  input.provenance.claims = [{ id: 'source-claim', scientificExperimentId: 'source-exp',
    statementHash: values.hashBytes(Buffer.from('Subset-sum has a valid witness')), status: 'proposed',
    sourceRefs: [artifact.artifactId, measured.receipt.receiptId] }];
  input.provenance.hypotheses[0].claimIds = ['source-claim'];
  input.provenance.artifacts = [artifact];
  input.provenance.receiptRefs = [{ receiptId: measured.receipt.receiptId, sha256: measured.receipt.payloadHash }];
  return input;
}

function query(input) { return { scope: input.scope, entityId: input.entityId, experimentId: input.experimentId }; }

async function refusals(db, input) {
  const mutations = [
    ['GVX_MANIFEST_MISSION_BINDING_MISMATCH', value => { value.provenance.mission.bindingHash = 'f'.repeat(64); }],
    ['GVX_MANIFEST_RECEIPT_BINDING_MISMATCH', value => { value.provenance.receiptRefs[0].sha256 = 'f'.repeat(64); }],
    ['GVX_MANIFEST_ARTIFACT_CHANGED', value => { value.provenance.artifacts[0].kind = 'forged-kind'; }],
    ['GVX_MANIFEST_CLAIM_SCOPE_MISMATCH', value => { value.provenance.claims[0].scientificExperimentId = 'foreign-exp'; }],
    ['GVX_MANIFEST_CLAIM_CHANGED', value => { value.provenance.claims[0].statementHash = 'f'.repeat(64); }]
  ];
  for (const [code, mutate] of mutations) {
    const changed = structuredClone(input);
    changed.experimentId = `invalid-${code}`;
    mutate(changed);
    await assert.rejects(protocol.recordExperimentPlan(db, changed), { code });
    assert.equal(await protocol.readExperimentManifest(db, query(changed)), null);
  }
  const foreign = { ...input, scope: { ...input.scope, projectId: 'foreign' }, experimentId: 'foreign' };
  await assert.rejects(protocol.recordExperimentPlan(db, foreign), { code: 'GVX_MANIFEST_MISSION_BINDING_MISMATCH' });
}

async function inspectAndRetract(db, input) {
  const event = await protocol.recordExperimentPlan(db, input);
  const first = await protocol.readExperimentManifest(db, query(input));
  assert.equal(first.runtimeReferences.status, 'runtime_resolved');
  assert.equal(first.runtimeReferences.postconditions, 'not_evaluated');
  assert.equal(first.runtimeReferences.receipts[0].costs[0].quantity, 0);
  assert.equal(first.runtimeReferences.claimsActive, true);
  const ledger = science.createScientificEvidenceLedger(db);
  const claim = (await ledger.inspectExperiment({ experimentId: 'source-exp' })).claims[0];
  await ledger.recordClaimTransition({ experimentId: 'source-exp', claimId: claim.claimId,
    eventId: 'retract-source', expectedHeadHash: claim.lifecycle.headHash, status: 'retracted',
    rationale: 'Independent contradiction received', createdBy: 'reviewer' });
  const current = await protocol.readExperimentManifest(db, query(input));
  assert.equal(current.manifest.hash, first.manifest.hash, 'Sealed admission is preserved');
  assert.equal(current.runtimeReferences.claims[0].status, 'retracted');
  assert.equal(current.runtimeReferences.claimsActive, false);
  const finished = await protocol.recordExperimentOutcomes(db, { ...input, plan: event.payload.plan, outcomes: [] });
  assert.equal(finished.payload.assessment.status, 'blocked');
  assert.equal(finished.payload.assessment.reason, 'source-claim-inactive');
  assert.equal(finished.payload.assessment.promotionAllowed, false);
}

async function generalMission(db, contractRecord) {
  await db.run('INSERT INTO mission_agents VALUES (?, ?)', 'worker-mission', 'parent');
  const run = await execution.createExecutionRun(db, { agentId: 'parent', missionId: 'worker-mission', contractRecord });
  const observed = await provenance.readRun(db, { runId: run.id, scope: { ...scope, entityId: 'parent' } });
  assert.equal(observed.mission.id, 'worker-mission');
  assert.equal(observed.workerBindingHash, null);
  const legacy = await execution.createExecutionRun(db, { agentId: 'parent', contractRecord });
  assert.equal(await provenance.readRun(db, { runId: legacy.id, scope: { ...scope, entityId: 'parent' } }), null);
}

async function atomicRetraction(db, source) {
  const ledger = science.createScientificEvidenceLedger(db);
  await ledger.recordClaim({ experimentId: 'source-exp', claimId: 'race-claim',
    statement: 'Subset-sum has a valid witness', createdBy: 'researcher' });
  const input = structuredClone(source);
  input.experimentId = 'runtime-atomic';
  input.provenance.claims[0].id = 'race-claim';
  input.provenance.hypotheses[0].claimIds = ['race-claim'];
  const event = await protocol.recordExperimentPlan(db, input);
  const claim = (await ledger.inspectExperiment({ experimentId: 'source-exp' })).claims.find(item => item.claimId === 'race-claim');
  let enter;
  let resume;
  const entered = new Promise(resolve => { enter = resolve; });
  const paused = new Promise(resolve => { resume = resolve; });
  const original = db.run.bind(db);
  db.run = async (sql, ...args) => {
    if (sql.includes('INSERT OR IGNORE INTO gvx_development_events') && args[0] === 'gvx-experiment:runtime-atomic:finished') {
      enter(); await paused;
    }
    return original(sql, ...args);
  };
  let closing;
  let retracting;
  try {
    closing = protocol.recordExperimentOutcomes(db, { ...input, plan: event.payload.plan, outcomes: [] });
    await entered;
    let done = false;
    retracting = ledger.recordClaimTransition({ experimentId: 'source-exp', claimId: 'race-claim',
      eventId: 'race-retraction', expectedHeadHash: claim.lifecycle.headHash, status: 'retracted',
      rationale: 'Retraction concurrent with closure', createdBy: 'reviewer' }).then(value => { done = true; return value; });
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(done, false, 'Retraction waits while the closure holds its read/write transaction');
    const before = (await ledger.inspectExperiment({ experimentId: 'source-exp' })).claims.find(item => item.claimId === 'race-claim');
    assert.equal(before.lifecycle.status, 'proposed');
    resume();
    const finished = await closing;
    await retracting;
    assert.equal(finished.payload.runtimeReferences.claimsActive, true, 'The sealed decision reflects the state held until commit');
    const after = await protocol.readExperimentManifest(db, query(input));
    assert.equal(after.runtimeReferences.claimsActive, false, 'Subsequent reads expose the committed retraction');
  } finally {
    resume();
    await Promise.allSettled([closing, retracting]);
    db.run = original;
  }
}

async function lineage(db, source, contractRecord) {
  const parent = await protocol.readExperimentManifest(db, query(source));
  const run = await execution.createExecutionRun(db, { agentId: 'worker', contractRecord });
  const binding = await provenance.readRun(db, { runId: run.id, scope });
  const input = structuredClone(source);
  input.experimentId = 'runtime-descendant';
  input.provenance.mission.bindingHash = binding.hash;
  input.provenance.run = { id: run.id, parentRunId: source.provenance.run.id };
  input.provenance.lineage = [{ runId: source.provenance.run.id, manifestHash: parent.manifest.hash }];
  await protocol.recordExperimentPlan(db, input);
  assert.equal((await protocol.readExperimentManifest(db, query(input))).runtimeReferences.lineage.length, 1);
  input.experimentId = 'unknown-parent';
  input.provenance.lineage[0].manifestHash = 'f'.repeat(64);
  await assert.rejects(protocol.recordExperimentPlan(db, input), { code: 'GVX_MANIFEST_PARENT_UNRESOLVED' });
}

async function readChild(filename) {
  const db = openDatabase(filename);
  try {
    const read = await protocol.readExperimentManifest(db, { scope, entityId: 'worker', experimentId: 'runtime-linked-experiment' });
    console.log(JSON.stringify({ pid: process.pid, referenceStatus: read.runtimeReferences.status,
      claimStatus: read.runtimeReferences.claims[0].status, receipts: read.runtimeReferences.receipts.length,
      artifacts: read.runtimeReferences.artifacts.length, postconditions: read.runtimeReferences.postconditions }));
  } finally { await db.close(); }
}

function freshProcess(filename) {
  const child = spawnSync(process.execPath, [__filename, '--read', filename], { encoding: 'utf8', timeout: 30000 });
  assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout);
  assert.notEqual(result.pid, process.pid);
  assert.equal(result.referenceStatus, 'runtime_resolved');
  assert.equal(result.claimStatus, 'retracted');
  assert.equal(result.receipts, 1);
  assert.equal(result.artifacts, 1);
  assert.equal(result.postconditions, 'not_evaluated');
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-p1-runtime-'));
  process.env.GENOS_GVX_ARTIFACT_ROOT = path.join(root, 'artifacts');
  const filename = path.join(root, 'runtime.db');
  const db = openDatabase(filename);
  try {
    const contractRecord = await seed(db);
    const measured = await measuredRun(db, filename, contractRecord);
    const input = await runtimeInput(db, measured);
    await refusals(db, input);
    await inspectAndRetract(db, input);
    await atomicRetraction(db, input);
    await lineage(db, input, contractRecord);
    await generalMission(db, contractRecord);
    freshProcess(filename);
    const budget = JSON.stringify({ tokens: 9999 });
    await db.run('UPDATE strategy_execution_runs SET budget_json = ? WHERE id = ?', budget, measured.run.id);
    await assert.rejects(protocol.readExperimentManifest(db, query(input)), { code: 'GVX_RUN_BINDING_CHANGED' });
  } finally { await db.close(); await fs.rm(root, { recursive: true, force: true }); }
  console.log('P1 runtime provenance: actual mission and runs, executed procedure receipt, artifacts, dynamic retraction, restart, scope and alteration refusals passed.');
}

const job = process.argv[2] === '--read' ? readChild(process.argv[3]) : main();
job.catch(error => { console.error(error); process.exitCode = 1; });
