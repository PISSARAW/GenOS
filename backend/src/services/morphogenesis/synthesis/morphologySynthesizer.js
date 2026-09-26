'use strict';

const { MorphologyRuntime } = require('../runtime/morphologyRuntime');
const { compileMorphologyExpression } = require('../graph/compileFlatTopology');
const { developmentalGenerator, generateCandidates, MORPHOGEN_SIGNALS } = require('./developmentalGenerator');
const { MorphogenService } = require('./morphogenService');
const { StructuralPressureService } = require('./structuralPressureService');
const { CandidateEvaluator, CandidatePruner } = require('./candidateEvaluator');
const { selectMinimumMorphology } = require('./minimalMorphologyPolicy');

class CounterfactualSearch {
  constructor(opts = {}) {
    this.runtime = opts.runtime || new MorphologyRuntime();
    this.morphogen = new MorphogenService(opts.morphogen);
    this.pressure = new StructuralPressureService(opts.pressure);
    this.evaluator = new CandidateEvaluator(opts.evaluator);
    this.pruner = new CandidatePruner(opts.pruner);
    this.maxIterations = opts.maxIterations || 5;
    this.branchingFactor = opts.branchingFactor || 3;
  }

  async search(seedExpression, context) {
    const searchState = {
      iteration: 0,
      currentBest: { expression: seedExpression, score: 0 },
      history: [],
      morphogenSnapshots: []
    };

    await this.pressure.computePressures(context);

    for (let iter = 0; iter < this.maxIterations; iter++) {
      searchState.iteration = iter;

      const candidates = generateCandidates(searchState.currentBest.expression, this.morphogen.context, { count: this.branchingFactor });

      const evaluated = await this.evaluator.evaluate(candidates, context);
      const pruned = this.pruner.prune(evaluated);

      if (pruned.length === 0) break;

      const best = pruned[0];
      if (best.score.total > searchState.currentBest.score) {
        searchState.currentBest = { expression: best.expression, score: best.score.total };
      }

      searchState.history.push({ iteration: iter, candidates: pruned.length, bestScore: searchState.currentBest.score });
      searchState.morphogenSnapshots.push(this.morphogen.getAllSignals());

      if (this.shouldStop(searchState, context)) break;
    }

    return {
      bestExpression: searchState.currentBest.expression,
      bestScore: searchState.currentBest.score,
      iterations: searchState.iteration + 1,
      history: searchState.history,
      morphogenHistory: searchState.morphogenSnapshots
    };
  }

  shouldStop(searchState, context) {
    if (searchState.currentBest.score > 0.9) return true;
    if (searchState.iteration > 0 && searchState.history[searchState.iteration].bestScore <= searchState.history[searchState.iteration - 1].bestScore) return true;
    return false;
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