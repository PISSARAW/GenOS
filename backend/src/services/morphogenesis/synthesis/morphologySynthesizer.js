'use strict';

const { MorphologyRuntime } = require('../runtime/morphologyRuntime');
const { compileMorphologyExpression } = require('../graph/compileFlatTopology');
const { developmentalGenerator, generateCandidates, MORPHOGEN_SIGNALS } = require('./developmentalGenerator');
const { MorphogenService } = require('./morphogenService');
const { StructuralPressureService } = require('./structuralPressureService');
const { CandidateEvaluator, CandidatePruner } = require('./candidateEvaluator');
const { selectMinimumMorphology } = require('./minimalMorphologyPolicy');
const { createCandidate, createSeededRandom } = require('./morphologyCandidate');
const { QualityDiversityArchive } = require('./qualityDiversityArchive');
const halving = require('./successiveHalving');

function distributeOffspring(parents, total) {
  const allocations = parents.map((parent) => ({ parent, count: 0, offset: 0 }));
  for (let index = 0; index < total; index++) allocations[index % parents.length].count += 1;
  let offset = 0;
  for (const allocation of allocations) {
    allocation.offset = offset;
    offset += allocation.count;
  }
  return allocations.filter((allocation) => allocation.count > 0);
}

function generateOffspring(input = {}) {
  return distributeOffspring(input.parents, input.count).flatMap((allocation) =>
    generateCandidates(allocation.parent.expression, input.morphogen, {
      count: allocation.count, random: input.random, generation: input.generation,
      parentCandidateId: allocation.parent.candidateId, searchId: input.searchId,
      searchBudget: input.searchBudget, candidateOffset: allocation.offset
    }));
}

function searchBudget(context, runtime) {
  const declared = context.searchBudget || {};
  return halving.createEvaluationBudget({ ...declared,
    defaultLimit: runtime.maxIterations * runtime.branchingFactor });
}

class CounterfactualSearch {
  constructor(opts = {}) {
    this.runtime = opts.runtime || new MorphologyRuntime();
    this.morphogen = new MorphogenService(opts.morphogen);
    this.pressure = new StructuralPressureService(opts.pressure);
    this.evaluator = opts.evaluatorInstance || new CandidateEvaluator(opts.evaluator);
    this.pruner = opts.prunerInstance || new CandidatePruner(opts.pruner);
    this.maxIterations = opts.maxIterations || 5;
    this.branchingFactor = opts.branchingFactor || 3;
    this.seed = opts.seed || 'counterfactual-search';
  }

  async search(seedExpression, context) {
    if (context.spiral) return require('./spiralSearch').search(this, seedExpression, context);
    const searchId = context.searchId || context.missionId || 'counterfactual-search';
    const random = createSeededRandom(context.seed ?? this.seed);
    const budget = searchBudget(context, this);
    const archive = new QualityDiversityArchive(context.searchBudget || {});
    const seedCandidate = createCandidate({ expression: seedExpression,
      candidateId: `${searchId}:seed`, operator: 'SEED' });
    const searchState = {
      iteration: 0,
      currentBest: { ...seedCandidate, score: { total: 0, breakdown: {} } },
      history: [],
      morphogenSnapshots: [],
      lineage: [seedCandidate],
      parents: [seedCandidate],
      stagnantRounds: 0
    };

    await this.pressure.computePressures(context);

    for (let iter = 0; iter < this.maxIterations; iter++) {
      searchState.iteration = iter;

      const evaluationCount = halving.reserveEvaluations(budget, this.branchingFactor);
      if (!evaluationCount) break;
      const candidates = generateOffspring({ parents: searchState.parents,
        count: evaluationCount, morphogen: this.morphogen.context, random,
        generation: iter + 1, searchId, searchBudget: context.searchBudget });

      const evaluated = await this.evaluator.evaluate(candidates, context);
      searchState.lineage.push(...evaluated);
      archive.addAll(evaluated);
      const pruned = this.pruner.prune(evaluated);

      if (pruned.length === 0) break;

      const best = pruned[0];
      const previousScore = searchState.currentBest.score.total;
      if (best.score.total > searchState.currentBest.score.total) {
        searchState.currentBest = best;
      }
      searchState.stagnantRounds = searchState.currentBest.score.total > previousScore
        ? 0 : searchState.stagnantRounds + 1;
      const selection = halving.selectSurvivors(pruned, {
        budget, archiveOptions: context.searchBudget || {}
      });
      searchState.parents = selection.survivors;

      searchState.history.push({ iteration: iter, candidates: pruned.length,
        candidateIds: pruned.map((candidate) => candidate.candidateId),
        evaluatedCandidateIds: evaluated.map((candidate) => candidate.candidateId),
        survivorCandidateIds: selection.survivorCandidateIds,
        eliminatedCandidateIds: selection.eliminatedCandidateIds,
        selectedCandidateId: searchState.currentBest.candidateId,
        bestScore: searchState.currentBest.score.total,
        budget: halving.budgetSnapshot(budget) });
      searchState.morphogenSnapshots.push(this.morphogen.getAllSignals());

      if (this.shouldStop(searchState, context)) break;
    }

    return {
      bestExpression: searchState.currentBest.expression,
      bestScore: searchState.currentBest.score.total,
      bestCandidate: searchState.currentBest,
      iterations: searchState.history.length,
      history: searchState.history,
      lineage: searchState.lineage,
      archive: archive.snapshot(),
      evaluationBudget: halving.budgetSnapshot(budget),
      morphogenHistory: searchState.morphogenSnapshots
    };
  }

  shouldStop(searchState, context) {
    const target = Number(context.searchBudget?.targetScore ?? 0.9);
    const patience = Math.max(1, Number(context.searchBudget?.stagnationPatience) || 2);
    if (searchState.currentBest.score.total >= target) return true;
    return searchState.stagnantRounds >= patience;
  }
}

class MorphologySynthesizer {
  constructor(opts = {}) {
    this.developmentalGenerator = developmentalGenerator;
    this.morphogen = new MorphogenService(opts.morphogen);
    this.pressure = new StructuralPressureService(opts.pressure);
    this.evaluator = new CandidateEvaluator(opts.evaluator);
    this.pruner = new CandidatePruner(opts.pruner);
    this.counterfactualSearch = new CounterfactualSearch(opts.search);
    this.runtime = opts.runtime || new MorphologyRuntime();
  }

  async synthesize(missionProfile, context) {
    await this.pressure.computePressures({ ...context, problemProfile: missionProfile });

    const seedExpression = this.createSeedExpression(missionProfile);

    const searchResult = await this.counterfactualSearch.search(seedExpression, context);

    const finalCandidates = this.evaluator.applyMinimumMorphologyPolicy(
      [searchResult.bestExpression].map(e => ({ morphology: e, score: searchResult.bestScore })),
      missionProfile.demand || {}
    );

    const finalExpression = finalCandidates.valid ? finalCandidates.selected.candidate.morphology : searchResult.bestExpression;

    const graph = compileMorphologyExpression(finalExpression, {
      missionId: context.missionId,
      graphId: context.graphId,
      globalBudget: context.budget,
      globalInvariants: context.globalInvariants
    });

    return {
      expression: finalExpression,
      graph,
      searchResult,
      morphogenState: this.morphogen.getAllSignals(),
      pressure: this.pressure.morphogen.getAllSignals()
    };
  }

  createSeedExpression(profile) {
    const topology = profile.baseTopology || 'a_team';
    return { kind: 'TOPOLOGY', topology, variant: profile.variant || 'adaptive', nodeKind: 'TOPOLOGY', scope: 'mission', mission: profile.mission };
  }
}

module.exports = {
  CounterfactualSearch,
  MorphologySynthesizer,
  MorphogenService,
  StructuralPressureService,
  CandidateEvaluator,
  CandidatePruner,
  MORPHOGEN_SIGNALS
};
