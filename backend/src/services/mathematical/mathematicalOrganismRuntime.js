'use strict';

/**
 * @file mathematicalOrganismRuntime.js
 * @description MathematicalOrganismRuntime — the living engine that executes
 * the closed research loop: observe → question → allocate → explore → execute → verify → select → mutate → transmit → repeat.
 */

const crypto = require('node:crypto');
const { createMathematicalEnvironment } = require('./mathematicalEnvironment');
const { createResearchLineage } = require('./researchLineage');
const { createMathematicalNiche } = require('./mathematicalNiche');
const { MathematicalPopulation } = require('./mathematicalPopulation');
const { MathematicalNichePopulationService } = require('./mathematicalNichePopulationService');
const { LiteratureForager, PatchResult } = require('./mathematicalLiteratureForaging');
const { MutationEngine } = require('./mutationEngine');
const { MathematicalCulture } = require('./mathematicalCultureService');
const { QuestionogenesisEngine } = require('./questionogenesisService');
const { ProofStrategyRepertoire } = require('./proofStrategyRepertoire');
const { extractEpitopes } = require('./goalEpitopeExtractor');

const { LeanIncrementalGate } = require('../epistemicScheduler/leanIncrementalGate');
const { MathematicalDependencyGraph } = require('../epistemicScheduler/mathematicalDependencyGraph');
const { createFormalizationRegistry } = require('./formalizationArtifact');

const { observe, extractMotifs } = require('./mathematicalOrganismObserve');
const { question } = require('./mathematicalOrganismQuestion');
const { allocate, explore, verify } = require('./mathematicalOrganismExplore');
const { select, mutate, transmit, horizontalTransfer, evaluate, hasConverged, getSummary } = require('./mathematicalOrganismSelectMutate');
const { createConceptogenesisEngine } = require('./conceptogenesisService');
const { createSymbiontExecutor } = require('./symbiontExecutor');

function runtimeId() {
  return `math-org-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

class MathematicalOrganismRuntime {
  constructor(options = {}) {
    this.id = options.id || runtimeId();
    this.environment = options.environment || null;
    this.nicheService = new MathematicalNichePopulationService({
      envMeanReturnRate: options.envMeanReturnRate || 0.35,
    });
    this.culture = new MathematicalCulture({ fidelityRate: options.fidelityRate || 0.9 });
    this.mutationEngine = new MutationEngine({
      mutationRate: options.mutationRate || 0.1,
      recombinationRate: options.recombinationRate || 0.2,
      hgtRate: options.hgtRate || 0.05,
      exaptationRate: options.exaptationRate || 0.1,
    });
    this.questionogenesis = new QuestionogenesisEngine();
    this.conceptogenesis = createConceptogenesisEngine({ miner: { confidenceThreshold: 0.15 } });
    this.strategyRepertoire = new ProofStrategyRepertoire();
    this.forager = new LiteratureForager({ envMeanReturnRate: options.envMeanReturnRate || 0.35 });
    this.leanGate = options.leanGate || null;
    this.dependencyGraph = new MathematicalDependencyGraph();
    this.formalizationRegistry = createFormalizationRegistry();
    this.symbiontExecutor = createSymbiontExecutor();
    this.generation = 0;
    this.budget = options.budget || { tokens: 10000, cpu: 3600 };
    this.spent = { tokens: 0, cpu: 0 };
    this.history = [];
    this.running = false;
    this.currentStep = 0;
    this.metrics = {
      totalVerified: 0,
      totalFailed: 0,
      totalQuestions: 0,
      totalMutations: 0,
      totalTransmissions: 0,
      totalHGT: 0,
    };
    // Attach helper functions for module access
    this._extractMotifs = require('./mathematicalOrganismObserve').extractMotifs;
    this.extractMotifs = this._extractMotifs;
    this._observe = require('./mathematicalOrganismObserve').observe;
    this.getSummary = () => require('./mathematicalOrganismSelectMutate').getSummary(this);
  }

  initialize(problem, options = {}) {
    this.environment = createMathematicalEnvironment({
      problem,
      budget: this.budget,
      domain: options.domain || problem.domain || 'general',
    });

    const initialNiches = options.initialNiches || [
      { name: 'SAT', representation: 'SAT' },
      { name: 'Algebraic', representation: 'algebraic' },
      { name: 'Analytic', representation: 'analytic' },
    ];

    for (const nicheOpts of initialNiches) {
      const niche = this.environment.createNiche(nicheOpts);
      this.nicheService.addNiche(niche);
      this.forager.addPatch(new PatchResult({
        id: `patch-${nicheOpts.name.toLowerCase()}-1`,
        statement: `Known results in ${nicheOpts.representation} for ${problem.statement}`,
        relevanceScore: 0.5,
      }));
    }

    const initialStrategies = options.initialStrategies || [
      ['induction', 'existing_theorem_retrieval'],
      ['contradiction', 'auxiliary_lemma_generation'],
      ['representation_change', 'normalize'],
    ];

    for (let i = 0; i < initialStrategies.length; i++) {
      const lineage = createResearchLineage({
        name: `founder-${i}`,
        strategies: initialStrategies[i],
      });
      lineage.fitness = { P: 0.1, N: 0.5, I: 0.5, A: 0, T: 0.5, R: 0.5, C: 1 };
      this.environment.addLineage(lineage);
      this.nicheService.allocateToBestNiche(lineage);
    }

    this.history.push({ event: 'initialized', problem, step: this.currentStep, timestamp: new Date().toISOString() });
    return this;
  }

  setLeanGate(leanGate) {
    this.leanGate = leanGate;
  }

  async step() {
    if (this.spent.tokens >= this.budget.tokens || this.spent.cpu >= this.budget.cpu) {
      this.history.push({ event: 'budget_exhausted', step: this.currentStep, timestamp: new Date().toISOString() });
      return false;
    }

    this.currentStep++;
    this.generation++;

    const observations = observe(this);
    const questions = question(this, observations);
    allocate(this);
    const attempts = await explore(this, questions);
    const verified = await verify(this, attempts);
    select(this);
    mutate(this);
    // M3 : Symbiosis — exécute les solveurs liés aux représentations de niches
    // Chaque niche avec reconnue comme type de solveur appelle son symbionte
    const symbiontResults = await this.executeSymbionts(observations);

    // M7: Conceptogenesis - invent new concepts from observations
    const concepts = await this.conceptogenesis.inventConcepts(observations.anomalies.map(a => ({
      type: a.type || 'unexpected_invariant',
      description: a.description || '',
      source: a.source || null,
      confidence: a.confidence != null ? a.confidence : 0.5,
      // Structured data for ConceptMiner (point 8 fix)
      context: a.context || {},
      output: a.output || {},
    })), {
      problem: this.environment?.problem,
      targetDomain: this.environment?.problem?.domain,
    });

    // Point 7 : M7 causal — les concepts produits ont un effet sur l'écologie
    for (const concept of concepts) {
      if (!concept) continue;

      // Si le concept est une représentation mutante, créer une niche
      if (concept.type === 'representation' && concept.target) {
        const existingNiche = [...this.nicheService.niches.values()].find(n => n.representation === concept.target);
        if (!existingNiche) {
          const newNiche = this.environment.createNiche({
            name: `Concept-${concept.target}`,
            representation: concept.target,
            formulation: `Concept-driven niche: ${concept.original} → ${concept.target}`,
          });
          this.nicheService.addNiche(newNiche);
        }
      }

      // Si le concept est un invariant structurel, créer une obligation
      if (concept.type === 'structural_invariant' || concept.type === 'numerical_invariant') {
        // L'invariant devient une question pour la questionogenesis
        this.questionogenesis.observeAnomaly({
          type: 'invariant_opportunity',
          description: concept.statement,
          confidence: concept.confidence || 0.5,
          niche: null,
        });
      }
    }

    this.metrics.totalConcepts = (this.metrics.totalConcepts || 0) + concepts.length;
    this.history.push({
      event: 'conceptogenesis',
      step: this.currentStep,
      conceptsGenerated: concepts.length,
      timestamp: new Date().toISOString(),
    });
    transmit(this, verified);
    horizontalTransfer(this);
    evaluate(this);

    this.metrics.totalVerified += verified.length;
    this.history.push({ event: 'step_complete', step: this.currentStep, verified: verified.length, timestamp: new Date().toISOString() });

    if (hasConverged(this)) {
      this.history.push({ event: 'converged', step: this.currentStep, timestamp: new Date().toISOString() });
      return false;
    }

    return true;
  }

  async run(maxSteps = 100) {
    this.running = true;
    for (let i = 0; i < maxSteps && this.running; i++) {
      const continueRun = await this.step();
      if (!continueRun) break;
    }
    this.running = false;
    return getSummary(this);
  }

  /**
   * M3 : Execute symbiont solvers for niches that match known solver types.
   * Each niche representation (SAT, SMT, CP-SAT, ILP, etc.) calls its symbionte.
   */
  async executeSymbionts(observations) {
    if (!this.symbiontExecutor) return [];

    const results = [];
    const knownSolvers = this.symbiontExecutor.listSolvers();

    for (const obs of observations.niches) {
      const representation = obs.representation;
      if (!knownSolvers.includes(representation)) continue;

      try {
        const problem = { statement: obs.formulation || representation };
        const result = await this.symbiontExecutor.execute(representation, problem, {
          certificationRequired: false,
        });
        results.push({ niche: obs.id, representation, result });
        this.history.push({
          event: 'symbiont_execution',
          step: this.currentStep,
          solver: representation,
          status: result.status,
          timestamp: new Date().toISOString(),
        });
      } catch (e) {
        results.push({ niche: obs.id, representation, error: e.message });
      }
    }

    return results;
  }
}

function createMathematicalOrganismRuntime(options) {
  return new MathematicalOrganismRuntime(options);
}

module.exports = {
  MathematicalOrganismRuntime,
  createMathematicalOrganismRuntime,
};