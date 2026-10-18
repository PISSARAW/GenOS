'use strict';

const assert = require('node:assert/strict');
const { createCandidate, structuralSimilarity } = require('../src/services/morphogenesis/synthesis/morphologyCandidate');
const { generateCandidates } = require('../src/services/morphogenesis/synthesis/developmentalGenerator');
const { createMorphogenContext } = require('../src/services/morphogenesis/synthesis/morphogenContext');
const { CandidateEvaluator, CandidatePruner } = require('../src/services/morphogenesis/synthesis/candidateEvaluator');
const { CounterfactualSearch } = require('../src/services/morphogenesis/synthesis/morphologySynthesizer');

const SEED = { kind: 'TOPOLOGY', nodeKind: 'TOPOLOGY', topology: 'trinity',
  variant: 'default', mission: 'p0-search' };

function runtime() {
  return { execute: async () => ({ budgetUsed: { tokens: 10 },
    verifiedClaims: [{ id: 'claim' }], confidence: 0.8,
    evidence: [{ strength: 0.9 }] }) };
}

async function verifyCanonicalCandidateEvaluation() {
  const candidate = createCandidate({ expression: SEED, candidateId: 'canonical' });
  const [evaluated] = await new CandidateEvaluator({ runtime: runtime() })
    .evaluate([candidate], { missionId: 'p0', input: {}, budget: { tokens: 100 } });
  assert.ok(evaluated.score.total > 0);
  assert.equal(evaluated.status, 'evaluated');
  assert.equal(evaluated.observedUtility.evidence, 0.9);
}

function verifyDominanceAndStructuralDiversity() {
  const better = createCandidate({ expression: SEED, candidateId: 'better' });
  const worse = createCandidate({ expression: { ...SEED, topology: 'a_team' },
    candidateId: 'worse' });
  better.score = { total: 0.9, breakdown: { cost: 0.9, quality: 0.9, evidence: 0.9 } };
  worse.score = { total: 0.3, breakdown: { cost: 0.3, quality: 0.3, evidence: 0.3 } };
  assert.deepEqual(new CandidatePruner({ diversityThreshold: 1 }).prune([better, worse]), [better]);
  assert.ok(structuralSimilarity(better, worse) < 1);
}

function verifyMutationUsesCanonicalContract() {
  const [candidate] = generateCandidates(SEED, createMorphogenContext(), {
    count: 1, maxDepth: 1, generation: 1, parentCandidateId: 'seed',
    searchId: 'deterministic', random: () => 0.01
  });
  assert.equal(candidate.parentIds[0], 'seed');
  assert.equal(candidate.operator, 'MUTATION');
  assert.equal(candidate.mutations[0].type, 'ADD_NODE');
  assert.equal(candidate.expression.children.length, 1);
  assert.match(candidate.expression.children[0].nodeId, /^deterministic:1:0:/);
}

async function runSearch() {
  const search = new CounterfactualSearch({ maxIterations: 3, branchingFactor: 4,
    seed: 'replayable-p0', evaluator: { runtime: runtime() } });
  return search.search(SEED, { missionId: 'p0-search', input: {},
    budget: { tokens: 100 }, searchBudget: { candidates: 8 } });
}

async function verifyReplayableMultiGenerationLineage() {
  const first = await runSearch();
  const second = await runSearch();
  assert.ok(first.iterations >= 2);
  assert.ok(first.history.length >= 2);
  assert.ok(first.lineage.length > 2);
  assert.ok(first.lineage.slice(1).every((candidate) => candidate.parentIds.length === 1));
  assert.deepEqual(first.history, second.history);
  assert.deepEqual(first.lineage, second.lineage);
  assert.deepEqual(first.bestExpression, second.bestExpression);
}

async function main() {
  await verifyCanonicalCandidateEvaluation();
  verifyDominanceAndStructuralDiversity();
  verifyMutationUsesCanonicalContract();
  await verifyReplayableMultiGenerationLineage();
  console.log('Morphology search P0: canonical, evaluated, replayable lineage PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
