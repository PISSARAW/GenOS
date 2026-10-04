'use strict';

const { emit } = require('../agentOrchestrationState');

/**
 * Morphogenesis Runtime — prepares topology proposals for the collective.
 * Applying a transition requires the separately governed transition pipeline.
 */

const BIO_TOPOLOGY_ROLES = Object.freeze({
  rhizome: [
    { role: 'scout', modelTier: 'standard' },
    { role: 'forager', modelTier: 'standard' },
    { role: 'router', modelTier: 'frontier' },
  ],
  syncytium: [
    { role: 'soma', modelTier: 'frontier' },
    { role: 'dendrite', modelTier: 'standard' },
    { role: 'glia', modelTier: 'standard' },
  ],
  biocenose: [
    { role: 'representative', modelTier: 'standard' },
    { role: 'forager', modelTier: 'standard' },
    { role: 'compiler', modelTier: 'frontier' },
  ],
  holobionte: [
    { role: 'host', modelTier: 'frontier' },
    { role: 'symbiont', modelTier: 'standard' },
    { role: 'mediator', modelTier: 'frontier' },
  ],
  biome: [
    { role: 'environment', modelTier: 'standard' },
    { role: 'population', modelTier: 'standard' },
    { role: 'resource', modelTier: 'standard' },
  ],
  metapopulation: [
    { role: 'patch', modelTier: 'standard' },
    { role: 'migrant', modelTier: 'standard' },
    { role: 'coordinator', modelTier: 'frontier' },
  ],
});

function isBioTopology(strategyId) {
  return Object.keys(BIO_TOPOLOGY_ROLES).includes(strategyId.toLowerCase());
}

function getBioTopologyRoles(topology, count, profile) {
  const baseRoles = BIO_TOPOLOGY_ROLES[topology] || [];
  const roles = [];
  for (let i = 0; i < count; i++) {
    const base = baseRoles[i % baseRoles.length] || { role: `member_${i}`, modelTier: 'standard' };
    roles.push({ role: base.role, modelTier: base.modelTier });
  }
  return roles;
}

function deriveForkRoles(strategyId, count, profile) {
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

    const normalizedStrategy = strategyId.toLowerCase();

    if (normalizedStrategy.includes('fork') || normalizedStrategy.includes('counterfactual')) {
      const requestedForks = Number(profile.fork_count || profile.requested_workers || 3);
      const forkCount = Number.isInteger(requestedForks) ? Math.max(1, Math.min(64, requestedForks)) : 3;
      const roles = deriveForkRoles(normalizedStrategy, forkCount, profile);
      for (let i = 0; i < forkCount; i++) {
        morphology.agents.push({ role: roles[i] || `world_${i}`, modelTier: 'standard' });
      }
      morphology.topology = 'parallel_forks';
      morphology.agents.push({ role: 'verifier', modelTier: 'frontier' });
    } else if (normalizedStrategy.includes('trinity')) {
      morphology.topology = 'trinity';
      morphology.agents.push({ role: 'architect', modelTier: 'frontier' });
      morphology.agents.push({ role: 'implementer', modelTier: 'standard' });
      morphology.agents.push({ role: 'critic', modelTier: 'frontier' });
    } else if (isBioTopology(normalizedStrategy)) {
      const bioTopology = Object.keys(BIO_TOPOLOGY_ROLES).find(t => normalizedStrategy.includes(t)) || normalizedStrategy;
      morphology.topology = bioTopology;
      const workerCount = Number(profile.fork_count || profile.requested_workers || 3);
      const count = Number.isInteger(workerCount) ? Math.max(1, Math.min(64, workerCount)) : 3;
      const roles = getBioTopologyRoles(bioTopology, count, profile);
      for (let i = 0; i < count; i++) {
        morphology.agents.push({ role: roles[i].role, modelTier: roles[i].modelTier });
      }
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
