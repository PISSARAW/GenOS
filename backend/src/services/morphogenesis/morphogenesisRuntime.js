'use strict';

const { emit } = require('../agentOrchestrationState');

/**
 * Morphogenesis Runtime — prepares topology proposals for the collective.
 * Applying a transition requires the separately governed transition pipeline.
 */

class MorphogenesisRuntime {
  constructor() {
    this._transitionEngine = null;
    this._agentGit = null;
    this._counterfactual = null;
    this._computeSubstrate = null;
  }

  async init() {
    try { this._computeSubstrate = require('../../storage/compute/computeSubstrateResolver'); } catch {}
  }

  async prepareMorphology(strategyContract, options = {}) {
    const profile = { ...(strategyContract.profile || {}), ...(options.profile || {}) };
    if (options.fork_count !== undefined) profile.fork_count = options.fork_count;
    if (Array.isArray(options.domains)) profile.domains = options.domains;
    const strategyId = strategyContract.selected_strategy?.primary || 'deterministic_direct_path';

    const morphology = {
      topology: 'single_agent',
      strategy: strategyId,
      agents: [],
      relations: [],
      capabilities: [],
      transitionSequence: [],
      primaryDomain: profile.primaryDomain || profile.domains?.[0] || null,
      domains: Array.isArray(profile.domains) ? [...profile.domains] : [],
      substrate: { planner: 'cpu', execution: 'cpu' },
    };

    if (strategyId.includes('fork') || strategyId.includes('counterfactual')) {
      const requestedForks = Number(profile.fork_count || profile.requested_workers || 3);
      const forkCount = Number.isInteger(requestedForks) ? Math.max(1, Math.min(64, requestedForks)) : 3;
      const roles = this._deriveRoles(strategyId, forkCount, profile);
      for (let i = 0; i < forkCount; i++) {
        morphology.agents.push({ role: roles[i] || `world_${i}`, modelTier: 'standard' });
      }
      morphology.topology = 'parallel_forks';
      morphology.agents.push({ role: 'verifier', modelTier: 'frontier' });
    } else if (strategyId.includes('trinity')) {
      morphology.topology = 'trinity';
      morphology.agents.push({ role: 'architect', modelTier: 'frontier' });
      morphology.agents.push({ role: 'implementer', modelTier: 'standard' });
      morphology.agents.push({ role: 'critic', modelTier: 'frontier' });
    } else {
      morphology.agents.push({ role: 'implementation', modelTier: profile.model_tier || 'standard' });
    }

    if (this._computeSubstrate) {
      const plan = { transitionSequence: morphology.agents.map(a => ({ action: 'incarnate' })) };
      const annotated = this._computeSubstrate.annotatePlanWithSubstrates(plan);
      morphology.substrate = { ...morphology.substrate, ...annotated };
    }

    return morphology;
  }

  _deriveRoles(strategyId, count, profile) {
    const domain = profile.primaryDomain || profile.domains?.[0] || 'engineering';
    if (strategyId.includes('scientific') || strategyId.includes('factorial')) {
      return ['control', ...Array.from({ length: count - 1 }, (_, i) => `variant_${i}`)];
    }
    if (strategyId.includes('security') || strategyId.includes('red_blue')) {
      return ['red_team', 'blue_team', 'observer'];
    }
    if (strategyId.includes('diagnos') || strategyId.includes('bisection')) {
      return ['diagnoser', 'executor', 'validator'];
    }
    return Array.from({ length: count }, (_, i) => `world_${i}`);
  }

  async executeMorphology(morphology, options = {}) {
    return this._executeSimple(morphology, options);
  }

  async _executeSimple(morphology, options) {
    emit(options.orchestratorId || 'morphogenesis', 'MORPHOGENESIS_PROPOSED', 'TOPOLOGY_CHANGE_UNAVAILABLE', `No transition engine is configured; ${morphology.topology} remains a proposal.`, { topology: morphology.topology, agentCount: morphology.agents.length, applied: false }, 'warning');
    return {
      applied: false,
      proposed: true,
      agents: morphology.agents,
      topology: morphology.topology,
    };
  }
}

let instance = null;

function getMorphogenesisRuntime() {
  if (!instance) instance = new MorphogenesisRuntime();
  return instance;
}

module.exports = { MorphogenesisRuntime, getMorphogenesisRuntime };
