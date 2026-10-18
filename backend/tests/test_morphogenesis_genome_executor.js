'use strict';

const assert = require('assert');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

const agentDna = require('../src/services/agentDna');
const store = require('../src/services/agentDnaStore');
const executor = require('../src/services/morphogenesis/morphogenesisGenomeExecutorService');
const transitionPlan = require('../src/services/morphogenesis/morphogenesisGenomeTransitionPlan');
const transitionEngine = require('../src/services/morphogenesis/transitionEngineService');

const DNA_FILE = path.resolve(__dirname, '../../agents/dna/fondations/preuve_evidence.dna');

async function createSchema(db) {
  await db.exec(`CREATE TABLE agent_genomes (
    id TEXT PRIMARY KEY, agent_id TEXT, name TEXT NOT NULL, content_hash TEXT NOT NULL,
    genome_blob BLOB NOT NULL, phenotype_blob BLOB, source_manifest TEXT, source_doc TEXT,
    organization_id TEXT, project_id TEXT, status TEXT NOT NULL DEFAULT 'active', concept TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE agent_genome_innovations (
    id TEXT PRIMARY KEY, source_agent_id TEXT, base_genome_ref TEXT NOT NULL,
    candidate_genome_ref TEXT NOT NULL, concept TEXT, evidence_json TEXT,
    status TEXT NOT NULL DEFAULT 'candidate', organization_id TEXT, project_id TEXT,
    evaluation_json TEXT, decision_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`);
}

function genomeAction(model) {
  return {
    schema: 'genos.morphogenesis-genome-action/v1', action: 'speciate',
    targetAgentId: 'spawn:a_team:0',
    parentBindings: [{ genomeRef: 'parent', contentHash: model.contentHash }],
    concept: 'causal-analysis',
    grafts: [{ locus: 'CAP_CAUSAL_ANALYSIS', instruction: 'causal-analysis', plasmid: false }],
    expectedOutputStatus: 'candidate',
    evidenceObligations: ['parent_fingerprint_match', 'promotion_gate'],
    rollback: 'discard_candidate'
  };
}

function runOperationStub(db, model) {
  return async (_database, request) => {
    await store.saveGenome(db, model, { id: request.params.outputId,
      status: request.status, concept: request.concept });
    return { genomeRef: request.params.outputId, contentHash: model.contentHash,
      name: model.meta.name, operation: request.operation,
      genes: Object.keys(model.genes).length, status: request.status, dnaStatus: 'DRAFT' };
  };
}

async function testExecution(db, model) {
  const action = genomeAction(model);
  const input = { db, action, planId: 'plan-1', sourceAgentId: 'orchestrator', scope: {} };
  const receipt = await executor.executeGenomeAction(input,
    { runOperation: runOperationStub(db, model) });
  assert.equal(receipt.status, 'candidate_created');
  assert.equal(receipt.promoted, false);
  const row = await db.get('SELECT status FROM agent_genomes WHERE id=?', receipt.candidateGenomeRef);
  assert.equal(row.status, 'candidate');
  assert.equal(await store.selectGenome(db, { genomeRef: receipt.candidateGenomeRef }, {}), null);
  await db.run('DELETE FROM agent_genome_innovations WHERE id=?', receipt.innovationId);
  const recovered = await executor.executeGenomeAction(input,
    { runOperation: runOperationStub(db, model) });
  assert.equal(recovered.status, 'replayed');
  assert.ok(recovered.innovationId);
  const replay = await executor.executeGenomeAction(input,
    { runOperation: runOperationStub(db, model) });
  assert.equal(replay.status, 'replayed');
  const abandoned = await executor.abandonCandidate({
    db, receipt: { detail: receipt }, cause: 'rollback'
  });
  assert.equal(abandoned.abandoned, true);
  assert.equal((await db.get('SELECT status FROM agent_genomes WHERE id=?',
    receipt.candidateGenomeRef)).status, 'rejected');
}

async function testParentDrift(db, model) {
  const action = genomeAction(model);
  action.parentBindings[0].contentHash = 'changed-after-planning';
  await assert.rejects(
    () => executor.executeGenomeAction({ db, action, planId: 'plan-drift', scope: {} },
      { runOperation: runOperationStub(db, model) }),
    (error) => error.code === 'MORPHOGENESIS_GENOME_PARENT_CHANGED'
  );
}

function testTransitionAttachment(model) {
  const action = genomeAction(model);
  const mixed = transitionPlan.attachGenomeActions({ plan: {
    id: 'plan-1', genotypeActions: [action], actions: [{ type: 'spawn', role: 'worker' }]
  } });
  assert.equal(mixed.plan.actions[0].type, 'genome');
  assert.equal(mixed.plan.actions[1].type, 'spawn');
  assert.ok(transitionEngine.validatePlan(mixed.plan)
    .includes('derived genome preparation cannot share a transition with runtime actions'));
  const preparation = transitionPlan.attachGenomeActions({ plan: {
    id: 'plan-prepare', genotypeActions: [action], actions: []
  } });
  assert.deepEqual(transitionEngine.validatePlan(preparation.plan), []);
}

async function run() {
  process.env.GENOS_AGENT_DNA = '1';
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await createSchema(db);
    const model = agentDna.decodeFile(DNA_FILE);
    await store.saveGenome(db, model, { id: 'parent' });
    await testExecution(db, model);
    await testParentDrift(db, model);
    testTransitionAttachment(model);
  } finally {
    delete process.env.GENOS_AGENT_DNA;
    await db.close();
  }
  console.log('Morphogenesis genome executor: PASS');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
