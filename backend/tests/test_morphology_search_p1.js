'use strict';

const assert = require('node:assert/strict');
const { createCandidate } = require('../src/services/morphogenesis/synthesis/morphologyCandidate');
const { QualityDiversityArchive } = require('../src/services/morphogenesis/synthesis/qualityDiversityArchive');
const halving = require('../src/services/morphogenesis/synthesis/successiveHalving');
const { CandidatePruner } = require('../src/services/morphogenesis/synthesis/candidateEvaluator');
const { CounterfactualSearch } = require('../src/services/morphogenesis/synthesis/morphologySynthesizer');

function expression(topology, children = []) {
  return { kind: 'TOPOLOGY', nodeKind: 'TOPOLOGY', topology,
    variant: 'default', mission: 'p1-search', children };
}

function evaluated(id, topology, score) {
  return { ...createCandidate({ candidateId: id, expression: expression(topology) }),
    status: 'evaluated', score: { total: score,
      breakdown: { cost: score, quality: score, evidence: score } } };
}

function verifyArchiveKeepsQualityPerNiche() {
  const archive = new QualityDiversityArchive({ maxElites: 2 });
  assert.equal(archive.offer(evaluated('weak', 'trinity', 0.3)).accepted, true);
  const replacement = archive.offer(evaluated('strong', 'trinity', 0.8));
  assert.equal(replacement.replacedCandidateId, 'weak');
  assert.equal(archive.offer(evaluated('other', 'a_team', 0.7)).accepted, true);
  assert.equal(archive.offer(createCandidate({ candidateId: 'raw',
    expression: expression('rhizome') })).accepted, false);
  assert.deepEqual(archive.snapshot().elites.map((entry) => entry.candidateId),
    ['strong', 'other']);
  assert.equal(archive.snapshot().nichesCovered, 2);
}

function verifyHalvingPreservesNiches() {
  const candidates = [evaluated('a', 'trinity', 0.9), evaluated('b', 'trinity', 0.8),
    evaluated('c', 'a_team', 0.7), evaluated('d', 'rhizome', 0.6)];
  const budget = halving.createEvaluationBudget({ maxEvaluations: 8,
    eta: 2, minSurvivors: 2 });
  const selection = halving.selectSurvivors(candidates, { budget });
  assert.deepEqual(selection.survivorCandidateIds, ['a', 'c']);
  assert.deepEqual(selection.eliminatedCandidateIds, ['b', 'd']);
}

class CountingEvaluator {
  constructor() { this.count = 0; }

  async evaluate(candidates) {
    this.count += candidates.length;
    return candidates.map((candidate, index) => ({ ...candidate, status: 'evaluated',
      score: { total: 0.4 + candidate.generation * 0.05 - index * 0.001,
        breakdown: { cost: 0.7, quality: 0.6, evidence: 0.5 } } }));
  }
}

async function runBoundedSearch() {
  const evaluator = new CountingEvaluator();
  const search = new CounterfactualSearch({ maxIterations: 10, branchingFactor: 4,
    seed: 'p1-replay', evaluatorInstance: evaluator,
    prunerInstance: new CandidatePruner({ minScore: 0, maxCandidates: 8,
      diversityThreshold: 1 }) });
  const result = await search.search(expression('trinity'), { missionId: 'p1-search',
    input: {}, searchBudget: { maxEvaluations: 7, eta: 2, minSurvivors: 2,
      maxElites: 4, targetScore: 1, stagnationPatience: 4 } });
  return { evaluator, result };
}

async function verifyBudgetLineageAndReplay() {
  const first = await runBoundedSearch();
  const second = await runBoundedSearch();
  assert.equal(first.evaluator.count, 7);
  assert.deepEqual(first.result.history.map((round) => round.evaluatedCandidateIds.length), [4, 3]);
  assert.equal(first.result.evaluationBudget.consumed, 7);
  assert.equal(first.result.evaluationBudget.remaining, 0);
  assert.equal(first.result.lineage.length, 8);
  const firstSurvivors = new Set(first.result.history[0].survivorCandidateIds);
  assert.ok(first.result.lineage.slice(5).every((candidate) =>
    firstSurvivors.has(candidate.parentIds[0])));
  assert.ok(first.result.archive.nichesCovered >= 1);
  assert.ok(first.result.archive.elites.length <= 4);
  assert.deepEqual(first.result, second.result);
}

async function main() {
  verifyArchiveKeepsQualityPerNiche();
  verifyHalvingPreservesNiches();
  await verifyBudgetLineageAndReplay();
  console.log('Morphology search P1: QD archive, halving, budget and replay PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
