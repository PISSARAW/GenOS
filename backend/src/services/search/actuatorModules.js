/**
 * Actuator Modules — Point 11.
 *
 * Encapsulation des 7 modules isolés pour le NaturalSearchActuator.
 * Brise la récursion CausalReplay→Actuator et connecte chaque
 * processus Actuator à son service Search* correspondant.
 */

const { mutateGenome, createRandomGenome } = require('./searchGenomeService');
const { createVariants, selectBestVariant } = require('./cognitiveAffinityService');
const { SearchPatchService } = require('./searchPatchService');
const { CausalReplayService } = require('./causalReplayService');
const { NegativeSearchMemory } = require('./negativeSearchMemoryService');
const { SearchEvolutionEngine } = require('./searchEvolutionService');
const { SearchCultureService } = require('./searchCultureService');
const { HypothesisLedger } = require('./hypothesisLedgerService');

class ActuatorModules {
  constructor(options = {}) {
    this.ledger = options.ledger || new HypothesisLedger({ budgetRatioThreshold: 0.8 });
    this.searchGenome = { genome: options.genome || createRandomGenome(), population: null };
    this.patchService = new SearchPatchService();
    this.causalReplay = new CausalReplayService();
    this.negativeMemory = new NegativeSearchMemory();
    this.evolutionEngine = new SearchEvolutionEngine({ populationSize: 6 });
    this.cultureService = new SearchCultureService();
    this.evolutionEngine.initialize();
  }

  // === FORAGE — searchPatchService ===
  ensurePatch(agentId) {
    let patch = this.patchService.patches.get(agentId);
    if (!patch) {
      patch = this.patchService.createPatch(agentId, 'search-region', { agentId });
    }
    return patch;
  }

  recordForageStep(patchId, infoGain, cost) {
    return this.patchService.recordStep(patchId, infoGain, cost);
  }

  shouldDepartPatch(patchId, elapsedTimeSec) {
    return this.patchService.shouldDepart(patchId, elapsedTimeSec);
  }

  // === CLONAL AFFINITY — cognitiveAffinityService ===
  createAffinityVariants(baseGenome, count, radius) {
    return createVariants(baseGenome || this.searchGenome.genome, count || 4, radius || 'minimal');
  }

  selectAffinityVariant(variants, agentId) {
    return selectBestVariant(variants, this.ledger, agentId);
  }

  // === HYPERMUTATION — searchGenomeService ===
  mutateGenome(radius) {
    const oldGenome = { ...this.searchGenome.genome };
    const mutated = mutateGenome(this.searchGenome.genome, radius || 'medium');
    this.searchGenome.genome = mutated;
    const lastMutation = mutated.mutations[mutated.mutations.length - 1];
    return {
      oldGenome,
      mutatedGenome: mutated,
      mutations: lastMutation ? lastMutation.changes : []
    };
  }

  // === EVOLUTION — searchEvolutionService ===
  evolveSearchPopulation(environment) {
    const result = this.evolutionEngine.evolve(environment || {});
    this.searchGenome.population = this.evolutionEngine.population;
    return result;
  }

  getBestGenome() {
    return this.evolutionEngine.getBestGenome();
  }

  // === CAUSAL REPLAY — causalReplayService (récursion brisée) ===
  async replayCausalEvents(agentId, failedHypothesis, events, ledger) {
    return this.causalReplay.replay(agentId, failedHypothesis, events, ledger || this.ledger);
  }

  // === NEGATIVE SEARCH MEMORY ===
  recordNegativeOutcome(agentId, hypothesis, evidence, environment) {
    return this.negativeMemory.recordFailure(agentId, hypothesis, evidence, environment);
  }

  isPathBlocked(agentId, hypothesisStatement) {
    return this.negativeMemory.isPathBlocked(agentId, hypothesisStatement);
  }

  // === CULTURAL TRANSMISSION ===
  compilePlasmid(searchGenome, validation) {
    return this.cultureService.compilePlasmid(searchGenome, validation);
  }

  transmitPlasmid(plasmidId, targetAgentId) {
    return this.cultureService.transmit(plasmidId, targetAgentId);
  }
}

module.exports = { ActuatorModules };
