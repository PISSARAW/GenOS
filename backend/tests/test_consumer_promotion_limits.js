'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { closeDatabase } = require('../src/db');
const execution = require('../src/services/strategyExecutionService');
const gate = require('../src/services/strategyPromotionGate');
const { consume } = require('../src/services/promotionVerifierNonceService');
const nonceFixture = require('./helpers/promotionNonceFixture');

async function downstreamFailure(root) {
  const spec = await require('./helpers/consumerPromotionFixture.cjs').prepare(root);
  const original = gate.runPromotionPipeline;
  let ran = false;
  gate.runPromotionPipeline = async (promotion, primitives, evaluation) => {
    assert.equal(await nonceFixture.nonceCount(spec.db), 2);
    const result = await original(promotion, primitives, evaluation);
    assert.equal(result.success, true);
    ran = true;
    return { ...result, success: false, error: 'consumer-injected-after-real-pipeline' };
  };
  try {
    await assert.rejects(execution.approveRun(spec.db, spec.run.id, spec.options), /consumer-injected-after-real-pipeline/);
    assert.equal(ran, true);
    const saved = await spec.db.get('SELECT id FROM aeis_assurance_assemblies ORDER BY rowid DESC LIMIT 1');
    await closeDatabase();
    const input = { filename: spec.filename, assemblyId: saved.id, runId: spec.run.id, agentId: 'consumer-promotion-agent' };
    const child = spawnSync(process.execPath, [path.join(__dirname, 'helpers/consumerPromotionReader.cjs'), JSON.stringify(input)],
      { encoding: 'utf8', timeout: 60000, windowsHide: true, env: process.env });
    assert.equal(child.status, 0, child.stderr);
    process.stdout.write(child.stdout);
  } finally {
    gate.runPromotionPipeline = original;
    await closeDatabase();
  }
}

async function freshBatchBoundary(root) {
  const filename = path.join(root, 'fresh-nonces.db');
  const first = await nonceFixture.database(filename);
  const second = await nonceFixture.connect(filename);
  try {
    const inputs = [await nonceFixture.assembly(first), await nonceFixture.assembly(first)];
    const outcomes = await Promise.allSettled([consume(first, inputs[0]), consume(second, inputs[1])]);
    const fulfilled = outcomes.filter(result => result.status === 'fulfilled').length;
    assert.equal(fulfilled, 2, 'This consumer only reserves nonces; it does not claim a run execution lock');
    assert.equal(await nonceFixture.nonceCount(first), 4);
    console.log('Consumer promotion LIMIT: two fresh batches on two connections both reserved for the same awaiting run; serialization is not provided.');
    const id = inputs[0].gateContext.aeisEvaluation.persistedAssemblyId;
    await first.run("UPDATE aeis_assurance_assemblies SET payload_json = '{}' WHERE id = ?", id);
    await assert.rejects(require('../src/services/aeisAssemblyStore').readAssembly(first, id), /integrity failure/);
    console.log('Consumer promotion: altered persisted assembly is rejected: PASS');
  } finally {
    await second.close();
    await first.close();
  }
}

async function promotionMemory(root) {
  const spec = await require('./helpers/consumerPromotionFixture.cjs').prepare(root);
  try {
    await spec.db.run("INSERT INTO organizations (id, name) VALUES ('consumer-org', 'Consumer')");
    await spec.db.run("INSERT INTO projects (id, organization_id, name) VALUES ('consumer-project', 'consumer-org', 'Consumer')");
    await spec.db.run("UPDATE workspaces SET organization_id = 'consumer-org', project_id = 'consumer-project' WHERE id = 'consumer-ws'");
    const result = await execution.approveRun(spec.db, spec.run.id, spec.options);
    assert.equal(result.status, 'completed');
    const row = await spec.db.get(`SELECT * FROM genome_decisions WHERE created_by = 'consumer-promotion-agent'
      AND organization_id = 'consumer-org' AND project_id = 'consumer-project' ORDER BY rowid DESC LIMIT 1`);
    assert.ok(row, 'Promotion memory must use stable agent identity and its workspace tenant');
    assert.equal(row.evidence_status, 'linked');
    assert.doesNotMatch(row.content, /\[VERIFIED_SYSTEM_FACT\]/);
    const provenance = await spec.db.get('SELECT * FROM provenance_records WHERE id = ?', row.provenance_record_id);
    const parent = await spec.db.get('SELECT * FROM provenance_records WHERE payload_hash = ?', provenance.parent_hash);
    assert.equal(parent.subject_type, 'strategy_promotion');
    const payload = JSON.parse(parent.payload_json);
    assert.equal(payload.runId, spec.run.id);
    const assembly = await require('../src/services/aeisAssemblyStore').readAssembly(spec.db, payload.assemblyId);
    assert.equal(assembly.runId, spec.run.id);
    assert.equal(assembly.scopeId, 'consumer-org:consumer-project:consumer-ws');
    const foreign = await require('../src/services/vectorMemoryService').searchMemory('npm test',
      { organizationId: 'other-org', projectId: 'other-project', ownerId: 'consumer-promotion-agent' }, spec.db);
    assert.ok(!foreign.allScoredExperiences.some(item => item.id === row.id));
    await closeDatabase();
    const input = { filename: spec.filename, ids: [row.id, 'absent'], ownerId: 'consumer-promotion-agent' };
    const child = spawnSync(process.execPath, [path.join(__dirname, 'helpers/consumerMemoryReader.cjs'), JSON.stringify(input)],
      { encoding: 'utf8', timeout: 60000, windowsHide: true, env: { ...process.env, GENOS_DB_BOOTSTRAP_SKIP: '1' } });
    assert.equal(child.status, 0, child.stderr);
    const output = child.stdout.split('\n').find(line => line.startsWith('CONSUMER_MEMORY_RESULT='));
    const reread = JSON.parse(output.slice('CONSUMER_MEMORY_RESULT='.length));
    assert.equal(reread.records.length, 1);
    assert.equal(reread.links[0].provenance_record_id, row.provenance_record_id);
    assert.doesNotMatch(reread.injected, /\[VERIFIED_SYSTEM_FACT\]/);
    console.log('Consumer promotion memory: stable owner, tenant confinement and provenance to the sealed execution assembly: PASS');
  } finally { await closeDatabase(); }
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-consumer-promotion-'));
  process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'consumer-promotion-test-only';
  process.env.GENOS_ADMIN_PASSWORD ||= 'consumer-promotion-test-only';
  process.env.GENOS_STUDIO_ROOT = path.join(root, 'studio');
  process.env.NODE_ENV = 'test';
  try {
    await downstreamFailure(root);
    await freshBatchBoundary(root);
    const memoryRoot = path.join(root, 'memory');
    fs.mkdirSync(memoryRoot);
    await promotionMemory(memoryRoot);
  } finally {
    await closeDatabase();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
