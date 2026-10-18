'use strict';

const assert = require('assert');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

const agentDna = require('../src/services/agentDna');
const store = require('../src/services/agentDnaStore');
const genomeContext = require('../src/services/morphogenesis/morphogenesisGenomeContext');
const resolver = require('../src/services/morphogenesis/genotypeResolverService');
const actions = require('../src/services/morphogenesis/morphogenesisPlanActions');
const planBinding = require('../src/services/morphogenesis/morphogenesisGenomePlanBinding');
const validation = require('../src/services/morphogenesis/morphogenesisPlanValidation');
const binding = require('../src/services/agents/agentGenomeBindingService');

const DNA_FILE = path.resolve(__dirname, '../../agents/dna/fondations/preuve_evidence.dna');

async function createSchema(db) {
  await db.exec(`CREATE TABLE agent_genomes (
    id TEXT PRIMARY KEY, agent_id TEXT, name TEXT NOT NULL, content_hash TEXT NOT NULL,
    genome_blob BLOB NOT NULL, phenotype_blob BLOB, source_manifest TEXT, source_doc TEXT,
    organization_id TEXT, project_id TEXT, status TEXT NOT NULL DEFAULT 'active', concept TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`);
}

async function seed(db) {
  const model = agentDna.decodeFile(DNA_FILE);
  await store.saveGenome(db, model, { id: 'active-evidence' });
  await store.saveGenome(db, model, { id: 'candidate-evidence', status: 'candidate' });
  await store.saveGenome(db, model, { id: 'tampered-evidence' });
  await db.run("UPDATE agent_genomes SET content_hash='forged' WHERE id='tampered-evidence'");
  return model;
}

async function testPortfolio(db, model) {
  const portfolio = await store.listGenomePortfolio(db, {});
  assert.equal(portfolio.status, 'ready');
  assert.deepEqual(portfolio.eligible.map((item) => item.id), ['active-evidence']);
  assert.equal(portfolio.eligible[0].contentHash, model.contentHash);
  assert.equal(portfolio.eligible[0].phenotypeHash.length, 64);
  assert.deepEqual(portfolio.excluded, [
    { id: 'tampered-evidence', reason: 'content_hash_mismatch' }
  ]);
}

async function testMissionContext(db) {
  const context = await genomeContext.loadMissionGenomeContext({ db, normalizedMission: {} });
  assert.equal(context.schema, genomeContext.SCHEMA);
  assert.equal(context.status, 'ready');
  assert.equal(context.eligible.length, 1);
  const input = genomeContext.enrichPlanningInput({ missionId: 'm1' }, context);
  assert.equal(input.availableGenomes[0].id, 'active-evidence');
  assert.equal(input.genomeContext.eligibleCount, 1);
}

async function testResolverAndActions(db) {
  const portfolio = await store.listGenomePortfolio(db, {});
  const genome = portfolio.eligible[0];
  const required = genome.capabilities.slice(0, 1);
  assert.ok(required.length > 0);
  const decision = await resolver.resolveGenotype({
    db,
    scope: {},
    requirements: { domain: genome.phenotype.role, traits: required },
    availableGenomes: portfolio.eligible
  });
  assert.equal(decision.action, 'reuse');
  assert.equal(decision.genomeRef, genome.id);
  assert.equal(decision.genomeContentHash, genome.contentHash);

  const planned = actions.planGenotypeActions({
    requiredCapabilities: required,
    availableGenomes: portfolio.eligible,
    targetAgents: [{ id: 'spawn:a_team:0', spawnIndex: 0, capabilities: [] }]
  });
  assert.equal(planned.length, 1);
  assert.equal(planned[0].action, 'reuse');
  assert.equal(planned[0].parentBindings[0].contentHash, genome.contentHash);
  assert.ok(planned[0].evidenceObligations.includes('parent_fingerprint_match'));
  const derived = actions.planGenotypeActions({
    requiredCapabilities: [required[0], 'new-capability'],
    availableGenomes: portfolio.eligible,
    targetAgents: [{ id: 'spawn:a_team:0', spawnIndex: 0, capabilities: [] }]
  });
  const plan = planBinding.bindGenomeActions({ spawnAgents: [{}], genotypeActions: derived });
  assert.equal(plan.genomeAdmission.status, 'candidate_required');
  assert.equal(plan.spawnAgents[0].genomeAdmission, 'candidate_required');
}

function testPlanValidation() {
  const valid = validation.validatePlan({ plan: {
    topologyChanges: [{}], spawnAgents: [{}], rollbackPlan: {},
    genomeContext: { status: 'ready' },
    genotypeActions: [{
      schema: actions.GENOME_ACTION_SCHEMA,
      action: 'reuse',
      parentBindings: [{ genomeRef: 'g1', contentHash: 'hash' }],
      evidenceObligations: ['parent_fingerprint_match']
    }]
  } });
  assert.equal(valid.valid, true);
  const rejected = validation.validatePlan({ plan: {
    topologyChanges: [{}], spawnAgents: [{}], rollbackPlan: {},
    genomeContext: { status: 'ready' },
    genotypeActions: [{
      schema: actions.GENOME_ACTION_SCHEMA,
      action: 'unresolved', parentBindings: [], evidenceObligations: ['admissible_parent_required']
    }]
  } });
  assert.equal(rejected.valid, false);
  assert.ok(rejected.errors.some((error) => error.includes('no admissible parent')));
}

async function testIncarnationBinding(db) {
  const request = {
    role: 'historian', mission: { prompt: 'historian evidence' },
    phenotype: { genomeRef: 'active-evidence' }, capabilityManifest: { owned: [] }
  };
  const selected = await binding.selectForIncarnation({ db, parent: { id: 'parent' }, request });
  assert.equal(selected.genomeRef, 'active-evidence');
  assert.equal(selected.genomeContentHash.length, 64);
  await assert.rejects(
    () => binding.selectForIncarnation({ db, parent: { id: 'parent' },
      request: { ...request, phenotype: { genomeRef: 'candidate-evidence' } } }),
    (error) => error.code === 'GENOME_BINDING_REJECTED'
  );
}

async function run() {
  process.env.GENOS_AGENT_DNA = '1';
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await createSchema(db);
    const model = await seed(db);
    await testPortfolio(db, model);
    await testMissionContext(db);
    await testResolverAndActions(db);
    testPlanValidation();
    await testIncarnationBinding(db);
  } finally {
    delete process.env.GENOS_AGENT_DNA;
    await db.close();
  }
  console.log('Morphogenesis AgentDNA bridge: PASS');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
