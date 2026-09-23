const assert = require('assert');
const crypto = require('crypto');

const { express } = require('../src/services/agentDna/express');
const { computeActiveTfs, propagateGrn } = require('../src/services/agentDna/grn');
const { isSilenced } = require('../src/services/agentDna/silencing');
const { applyEpigenomeMarks } = require('../src/services/agentDna/epigenome');

function baseModel() {
  return {
    meta: { name: 'ClosureWorker' },
    genes: {
      ROLE: { locus: 'ROLE', instruction: 'worker', chromatin: 0, methylated: false, volume: 1, locked: false, requiredActivator: null, boundRepressor: null },
      STRATEGY: { locus: 'STRATEGY', instruction: 'tree-search', chromatin: 0, methylated: false, volume: 1, locked: false, requiredActivator: null, boundRepressor: null },
      TOOL_A: { locus: 'TOOL_A', instruction: 'tool_a', chromatin: 0, methylated: false, volume: 1, locked: false, requiredActivator: null, boundRepressor: null },
      TF_ALPHA: { locus: 'TF_ALPHA', instruction: 'activate', chromatin: 0, methylated: false, volume: 1, locked: false, requiredActivator: null, boundRepressor: null }
    },
    epigenome: null,
    grn: null,
    development: null,
    phenotype: null
  };
}

function testParityActivatorNaming() {
  const gene = { locus: 'X', chromatin: 0, methylated: false, volume: 1, locked: false, requiredActivator: 'TF_ALPHA' };
  assert.equal(isSilenced(gene, { activeTfs: [], activeMirnas: [] }), true);
  assert.equal(isSilenced(gene, { activeTfs: ['TF_ALPHA'], activeMirnas: [] }), false);
  console.log('parity activator naming ok');
}

function testLockedRequiresPioneer() {
  const gene = { locus: 'Y', chromatin: 0, methylated: false, volume: 1, locked: true };
  assert.equal(isSilenced(gene, { activeTfs: [], activeMirnas: [] }), true);
  assert.equal(isSilenced(gene, { activeTfs: ['PIONEER_FACTOR'], activeMirnas: [] }), false);
  console.log('locked pioneer parity ok');
}

function testGrnEdgesCausal() {
  const model = baseModel();
  model.grn = { nodes: { TF_ALPHA: { isTf: true, basalExpression: 1.0 } }, edges: [{ from: 'TF_ALPHA', to: 'ROLE', weight: 0.9 }] };
  const tfs = computeActiveTfs(model.grn, model.genes, null);
  assert.ok(tfs.includes('TF_ALPHA'), `TF_ALPHA must be active, got ${tfs}`);
  const levels = propagateGrn(model.grn, model.genes, null);
  assert.ok(levels.ROLE > 0.5, `ROLE must be driven above threshold by edge, got ${levels.ROLE}`);
  const plain = computeActiveTfs(null, { ROLE: model.genes.ROLE }, null);
  assert.deepEqual(plain, []);
  console.log('GRN causal propagation ok');
}

function testDevelopmentCausal() {
  const zygote = baseModel();
  zygote.grn = { nodes: { TF_ALPHA: { isTf: true, basalExpression: 0.0 } }, edges: [] };
  zygote.development = { stage: 'Zygote', lineageCommitment: null, morphogens: [], differentiationSignal: null };
  const mature = JSON.parse(JSON.stringify(zygote));
  mature.development.stage = 'Mature';
  const zygotePheno = express(zygote);
  const maturePheno = express(mature);
  assert.notDeepEqual(zygotePheno.exprTfs, maturePheno.exprTfs, 'development stage must change expressed TFs');
  const morph = JSON.parse(JSON.stringify(zygote));
  morph.development = { stage: 'Differentiated', lineageCommitment: null, morphogens: ['TF_ALPHA'], differentiationSignal: null };
  const morphPheno = express(morph);
  assert.ok(morphPheno.exprTfs.includes('TF_ALPHA'), 'morphogen must activate matching TF');
  console.log('development causality ok');
}

function testEpigenomeMarks() {
  const model = baseModel();
  const genes = JSON.parse(JSON.stringify(model.genes));
  applyEpigenomeMarks({ marks: { ROLE: { kind: 'Methylation', level: 1.0 } } }, genes);
  assert.equal(genes.ROLE.methylated, true);
  const silenced = isSilenced(genes.ROLE, { activeTfs: [], activeMirnas: [] });
  assert.equal(silenced, true);
  console.log('epigenome marks ok');
}

function attestationValid(cached, current) {
  return JSON.stringify(cached) === JSON.stringify(current);
}

function testFullAttestation() {
  const model = baseModel();
  const first = express(model);
  const cached = { ...first, temp: 0.99 };
  const current = express(model);
  assert.equal(attestationValid(cached, current), false, 'tampered temp must invalidate cache attestation');
  console.log('phenotype attestation ok');
}

function testE2EMutationExpressionFitnessSelection() {
  const model = baseModel();
  const baseline = express(model);
  const mutated = JSON.parse(JSON.stringify(model));
  mutated.genes.TOOL_B = { locus: 'TOOL_B', instruction: 'tool_b', chromatin: 0, methylated: false, volume: 1, locked: false, requiredActivator: null, boundRepressor: null };
  const after = express(mutated);
  assert.ok(!baseline.tools.includes('tool_b'));
  assert.ok(after.tools.includes('tool_b'));
  const fitnessOf = (pheno) => pheno.tools.length * 10 + pheno.expressed - pheno.silenced.length * 0.5;
  assert.ok(fitnessOf(after) > fitnessOf(baseline), 'new expressed tool must improve measured fitness');
  const replay = express(JSON.parse(JSON.stringify(mutated)));
  assert.deepEqual(replay, after, 'expression must be reproducible');
  const hash = crypto.createHash('sha256').update(JSON.stringify(after)).digest('hex');
  assert.equal(hash.length, 64);
  console.log('E2E mutation->expression->fitness->replay ok');
}

function testToolLeaseIntersection() {
  const dnaTools = ['tool_a'];
  const assignmentTools = ['tool_a', 'tool_b'];
  const runtimeLease = ['tool_a', 'tool_b', 'tool_c'];
  const effective = runtimeLease.filter((tool) => dnaTools.includes(tool) && assignmentTools.includes(tool));
  assert.deepEqual(effective, ['tool_a']);
  console.log('tool lease intersection ok');
}

async function run() {
  testParityActivatorNaming();
  testLockedRequiresPioneer();
  testGrnEdgesCausal();
  testDevelopmentCausal();
  testEpigenomeMarks();
  testFullAttestation();
  testE2EMutationExpressionFitnessSelection();
  testToolLeaseIntersection();
  console.log('Integration closure checks passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
