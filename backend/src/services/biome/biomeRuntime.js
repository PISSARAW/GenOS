'use strict';

const biomeVariantRuntime = require('./variants/variantRuntimeService');
const biomeVariantPolicy = require('./variants/variantPolicyService');
const biomeVariantOperations = require('./variants/variantSessionOperations');
const biofilmMatrix = require('../biofilmMatrixService');
const sessionPersistence = require('./biomeSessionPersistence');
const biomeSessionStore = require('./biomeSessionStore');

const DEFAULT_MAX_TICKS = 100;
const STOP_CONDITIONS = Object.freeze([
  'budget_exhausted',
  'convergence_reached',
  'max_ticks_reached',
  'extinction_event',
  'goal_achieved',
  'sterility_limit'
]);

function coordinationService() {
  return require('../biomeCoordinationService');
}

class BiomeRuntime {
  constructor(sessionId, variant, ecology, state = {}, options = {}) {
    this.sessionId = sessionId;
    this.variant = variant;
    this.ecology = ecology;
    this.state = state;
    this.tick = state.tick || 0;
    this.history = state.history || [];
    this.persistenceKey = `biome:${sessionId}:${variant}`;
    this.options = options;
    this.stopCondition = null;
    this.maxTicks = options.maxTicks || DEFAULT_MAX_TICKS;
  }

  static async create(mission, options = {}) {
    const variant = biomeVariantPolicy.select(mission, options);
    const session = await coordinationService().composeBiome(mission, options);
    return new BiomeRuntime(
      session.sessionId,
      session.variant,
      session.ecology,
      { tick: session.ecology.tick || 0, history: [] },
      options
    );
  }

  static async restore(sessionId, variant, db) {
    const record = await biomeSessionStore.load(db, sessionId);
    if (!record) {
      throw Object.assign(new Error(`Biome session '${sessionId}' not found in store.`), { code: 'BIOME_SESSION_NOT_FOUND' });
    }
    const session = sessionPersistence.rehydrate(record);
    return new BiomeRuntime(
      session.sessionId,
      session.variant,
      session.ecology,
      { tick: session.ecology.tick || 0, history: session.variantState?.history || [] },
      { db }
    );
  }

  async step(input = {}) {
    if (this.tick >= this.maxTicks) {
      this.stopCondition = 'max_ticks_reached';
      return this.createStepResult({ shouldStop: true, stopCondition: this.stopCondition });
    }

    this.tick++;

    const observations = await this.observe(input);
    const { state, decision, action } = await this.decider(observations, input);
    const actionResult = await this.agir(action, observations, input);
    const measurements = await this.mesurer(actionResult, observations);
    this.mettreAJour(state, decision, action, measurements);
    await this.persist();

    const shouldStop = this.checkStopConditions(measurements);
    if (shouldStop) this.stopCondition = shouldStop;

    return this.createStepResult({
      tick: this.tick,
      observations,
      decision,
      action,
      actionResult,
      measurements,
      shouldStop,
      stopCondition: this.stopCondition
    });
  }

  async run(input = {}, maxTicks = this.maxTicks) {
    const results = [];
    for (let i = 0; i < maxTicks; i++) {
      const result = await this.step(input);
      results.push(result);
      if (result.shouldStop) break;
    }
    return results;
  }

  async observe(input) {
    const snapshot = await coordinationService().sessionSnapshot(this.sessionId, this.options);
    return {
      environment: snapshot.environment,
      environmentConstraints: snapshot.environmentConstraints,
      resourcePool: snapshot.resourcePool,
      niches: snapshot.niches,
      populations: snapshot.populations,
      ecologicalState: snapshot.ecologicalState,
      matrixEntries: snapshot.entries,
      ...input.observations
    };
  }

  async decider(observations, input) {
    const { ecology, variant, state, matrix } = this;
    const advanceInput = {
      ...input,
      observations,
      tick: this.tick,
      evidenceRefs: input.evidenceRefs || []
    };

    const result = biomeVariantRuntime.advance({
      ecology,
      variant,
      state,
      input: advanceInput,
      matrix
    });

    return {
      state: result.state || state,
      decision: result.decision,
      action: result.action
    };
  }

  async agir(action, observations, input) {
    if (!action || action.status === 'abstained') {
      return { status: 'abstained', reason: action?.reason };
    }

    const { ecology, variant, sessionId } = this;

    switch (action.type) {
      case 'RESOURCE_ECOSYSTEM_REGULATED':
      case 'RESOURCE_SCARCITY_ASSESSED': {
        const allocationResult = await coordinationService().allocateSessionResources(
          sessionId,
          input.populations || [],
          { ...input, totalBudget: input.totalBudget }
        );
        return { status: 'applied', allocation: allocationResult };
      }

      case 'EXPLORATION_POLICY_EVALUATED':
      case 'NICHE_CANDIDATES_RECORDED': {
        const discoverResult = await coordinationService().discoverSessionNiches(sessionId, [], {
          ...input,
          knowledgeSources: input.knowledgeSources
        });
        return { status: 'applied', discovery: discoverResult };
      }

      case 'QD_ELITE_ACCEPTED':
      case 'QD_CANDIDATE_REJECTED':
      case 'SUCCESSION_PHASE_ADVANCED':
      case 'SUCCESSION_PHASE_HELD':
      case 'ECOSYSTEM_RECOLONIZED':
      case 'DISTURBANCE_ASSESSED':
      case 'PERSISTENT_SEASON_COMMITTED':
      case 'BOUNDED_ENVIRONMENTS_EVALUATED':
      case 'OPEN_ENDED_PRESSURE_HALTED':
      case 'SAFE_ADVERSARIAL_ROUND_RECORDED':
      case 'KNOWLEDGE_SOURCE_INTEGRATED':
      case 'KNOWLEDGE_SOURCE_EXHAUSTED':
      case 'COMPUTE_PROVIDER_SELECTED':
      case 'COMPUTE_LOCALITY_MIGRATION':
      case 'COMPUTE_CAPACITY_INSUFFICIENT':
      case 'CROSS_SCALE_FEEDBACK_APPLIED':
      case 'CROSS_SCALE_EMERGENCE_DETECTED': {
        return { status: 'applied', action };
      }

      default: {
        const advanceResult = await coordinationService().advanceSessionVariant(sessionId, input, this.options);
        return { status: 'applied', advance: advanceResult };
      }
    }
  }

  async mesurer(actionResult, observations) {
    const { ecology, tick } = this;
    const populations = ecology.populations || [];
    const niches = ecology.niches || [];

    const measurements = {
      tick,
      populations: {
        count: populations.length,
        active: populations.filter(p => p.status !== 'extinct' && p.status !== 'dormant').length,
        extinct: populations.filter(p => p.status === 'extinct').length,
        totalIndividuals: populations.reduce((sum, p) => sum + (p.individuals?.length || 0), 0),
        totalProductivity: populations.reduce((sum, p) => sum + (p.productivity || 0), 0),
        byStatus: populations.reduce((acc, p) => {
          acc[p.status] = (acc[p.status] || 0) + 1;
          return acc;
        }, {})
      },
      niches: {
        count: niches.length,
        colonized: niches.filter(n => n.status === 'colonized').length,
        candidate: niches.filter(n => n.status === 'candidate').length,
        depleted: niches.filter(n => n.status === 'depleted').length
      },
      resources: {
        pool: { ...ecology.resourcePool },
        ...budgetMeasurements(actionResult, ecology)
      },
      diversity: {
        behavioral: biomeVariantOperations.ecosystemHealth(observations.populations?.map(p => p.label) || []).behavioralDiversity
      },
      actionResult
    };

    if (this.variant === 'successional') {
      measurements.successionPhase = ecology.ecologicalState?.successionPhase;
    }

    if (this.variant === 'persistent') {
      measurements.seasons = this.state.seasons?.length || 0;
    }

    if (this.variant === 'open_ended') {
      measurements.generationHistory = this.state.generationHistory?.length || 0;
      measurements.environmentArchive = this.state.environmentArchive?.length || 0;
    }

    return measurements;
  }

  mettreAJour(state, decision, action, measurements) {
    this.state = state;
    this.ecology.tick = this.tick;

    this.history.push({
      tick: this.tick,
      timestamp: new Date().toISOString(),
      variant: this.variant,
      decision,
      action,
      measurements: {
        populationCount: measurements.populations.count,
        nicheCount: measurements.niches.count,
        budgetPressure: measurements.resources.budgetPressure,
        diversity: measurements.diversity.behavioral
      }
    });

    if (this.history.length > 1000) {
      this.history = this.history.slice(-1000);
    }

    this.state.history = this.history;
  }

  checkStopConditions(measurements) {
    const { ecology, variant, state } = this;

    if (measurements.resources.budgetPressure >= 1.0) {
      return 'budget_exhausted';
    }

    if (measurements.populations.extinct > 0 && measurements.populations.active === 0) {
      return 'extinction_event';
    }

    if (variant === 'open_ended') {
      const sterileStreak = (state.generationHistory || []).slice(-5).every(h => !h.promoted);
      if (sterileStreak && (state.generationHistory?.length || 0) >= 5) {
        return 'sterility_limit';
      }
    }

    if (variant === 'successional' && ecology.ecologicalState?.successionPhase === 'stabilizer') {
      const stability = measurements.diversity.behavioral;
      if (stability && stability >= 0.5) {
        return 'convergence_reached';
      }
    }

    if (measurements.resources.budgetTotal > 0 && measurements.resources.budgetUsed === 0 && this.tick > 10) {
      return 'goal_achieved';
    }

    return null;
  }

  async persist() {
    if (!this.options.db) return;

    const session = {
      sessionId: this.sessionId,
      biomeId: this.sessionId,
      revision: this.ecology.tick,
      ecology: this.ecology,
      mode: 'biome',
      mission: this.ecology.missionId,
      variant: this.variant,
      variantPolicy: biomeVariantPolicy.resolve(this.variant),
      variantState: this.state,
      persistenceKey: this.persistenceKey,
      organization: this.ecology.organization || 'energy_huddle',
      mechanisms: ['resource_allocation', 'optimal_foraging', 'quorum_sensing'],
      capabilityContract: this.ecology.capabilityContract,
      matrix: this.ecology.matrix,
      members: this.ecology.members
    };

    await sessionPersistence.persist(session, this.options.db);
  }

  createStepResult(data) {
    return {
      sessionId: this.sessionId,
      variant: this.variant,
      tick: this.tick,
      ...data
    };
  }

  getState() {
    return {
      sessionId: this.sessionId,
      variant: this.variant,
      tick: this.tick,
      ecology: this.ecology,
      state: this.state,
      history: this.history,
      stopCondition: this.stopCondition
    };
  }
}

function budgetMeasurements(actionResult, ecology) {
  const allocation = actionResult?.allocation;
  const budgetTotal = allocation?.spendableBudget ?? allocation?.totalBudget ?? ecology.ecologicalState?.tokensBudget ?? 0;
  const entries = Array.isArray(allocation?.allocations) ? allocation.allocations : null;
  const budgetUsed = entries
    ? entries.reduce((sum, entry) => sum + (Number(entry.budget) || 0), 0)
    : ecology.ecologicalState?.tokensUsed || 0;
  return { budgetUsed, budgetTotal, budgetPressure: budgetTotal > 0 ? budgetUsed / budgetTotal : 0 };
}

module.exports = { BiomeRuntime, STOP_CONDITIONS };
