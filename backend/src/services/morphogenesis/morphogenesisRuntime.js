'use strict';

const { emit } = require('../agentOrchestrationState');

/**
 * Morphogenesis Runtime — orchestrates topology transitions for the collective.
 * Bridges strategy selection → AgentGit versioning → counterfactual testing → transition execution.
 */

class MorphogenesisRuntime {
  constructor() {
    this._transitionEngine = null;
    this._agentGit = null;
    this._counterfactual = null;
    this._computeSubstrate = null;
  }

  async init() {
    const { getDatabase } = require('../../db');
    const db = await getDatabase();
    this._db = db;

    // Lazy-load services (may not be available)
    try { this._transitionEngine = require('../morphogenesis/transitionEngineService'); } catch {}
    try { this._agentGit = require('../morphogenesis/agentGitService'); } catch {}
    try { this._counterfactual = require('../counterfactual/counterfactualPlanner'); } catch {}
    try { this._computeSubstrate = require('../../storage/compute/computeSubstrateResolver'); } catch {}
  }

  async prepareMorphology(strategyContract, options = {}) {
    const profile = strategyContract.profile || {};
    const strategyId = strategyContract.selected_strategy?.primary || 'deterministic_direct_path';

    const morphology = {
      topology: 'single_agent',
      strategy: strategyId,
      agents: [],
      relations: [],
      capabilities: [],
      transitionSequence: [],
      substrate: { planner: 'cpu', execution: 'cpu' },
    };

    if (strategyId.includes('fork') || strategyId.includes('counterfactual')) {
      const forkCount = profile.fork_count || profile.requested_workers || 3;
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
    if (!this._transitionEngine) {
      return this._executeSimple(morphology, options);
    }

    const transitionSpec = {
      targetTopology: morphology.topology,
      agents: morphology.agents,
      reason: options.reason || `morphogenesis strategy=${morphology.strategy}`,
      evidence: options.evidence || null,
    };

    if (this._agentGit) {
      transitionSpec.agentGit = {
        reason: transitionSpec.reason,
        evidence: transitionSpec.evidence,
        committedBy: options.orchestratorId || 'morphogenesis_runtime',
      };
    }

    const result = await this._transitionEngine.executeTransition(transitionSpec);

    return {
      applied: result?.applied || false,
      agents: morphology.agents,
      topology: morphology.topology,
      commitId: result?.commitId || null,
      transitionId: result?.transitionId || null,
    };
  }

  async _executeSimple(morphology, options) {
    emit(options.orchestratorId || 'morphogenesis', 'MORPHOGENESIS_SIMPLE', 'TOPOLOGY_CHANGE', `Applied ${morphology.topology} with ${morphology.agents.length} agents`, { topology: morphology.topology, agentCount: morphology.agents.length }, 'info');
    return {
      applied: true,
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
