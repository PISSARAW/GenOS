'use strict';

/**
 * @file proofStrategyRepertoire.js
 * @description ProofStrategyRepertoire — maintains a population of proof strategies
 * and selects the most affine ones for a given goal's epitopes.
 * Clonal selection theory: select top clones, mutate, remember successes.
 */

const { extractEpitopes } = require('./goalEpitopeExtractor');

const STRATEGIES = Object.freeze([
  { name: 'induction', affinity: ['isInductive', 'hasQuantifier'] },
  { name: 'contradiction', affinity: ['hasNegation', 'hasImplication'] },
  { name: 'normalization', affinity: ['isEquality', 'hasFunction'] },
  { name: 'linarith', affinity: ['isInequality', 'isEquality'] },
  { name: 'ring', affinity: ['isEquality'] },
  { name: 'omega', affinity: ['isInequality', 'hasSum'] },
  { name: 'simp', affinity: ['isEquality', 'hasFunction'] },
  { name: 'rewrite', affinity: ['hasSum', 'hasProduct'] },
  { name: 'existing_theorem_retrieval', affinity: [] },
  { name: 'auxiliary_lemma_generation', affinity: ['hasAssumptions'] },
  { name: 'representation_change', affinity: ['hasFunction', 'hasSet'] },
]);

class ProofStrategyRepertoire {
  constructor(opts = {}) {
    this.strategies = opts.strategies || STRATEGIES.map(s => ({ ...s, successCount: 0, trialCount: 0, affinityScore: 0.5 }));
    this.catalog = new Map(this.strategies.map(s => [s.name, s]));
  }

  selectForGoal(goal, maxClones = 3) {
    const { epitopes, structureHints } = extractEpitopes(goal);
    const scored = this.strategies.map(s => {
      const matching = s.affinity.filter(a => epitopes[a]);
      const affinity = s.affinity.length > 0 ? matching.length / s.affinity.length : 0;
      const fit = affinity * 0.6 + s.affinityScore * 0.4;
      return { name: s.name, affinity, fit, successRate: s.trialCount > 0 ? s.successCount / s.trialCount : 0.5 };
    });
    scored.sort((a, b) => b.fit - a.fit);
    return scored.slice(0, maxClones);
  }

  recordOutcome(strategyName, success) {
    const s = this.catalog.get(strategyName);
    if (!s) return;
    s.trialCount += 1;
    s.successCount += success ? 1 : 0;
    s.affinityScore = s.trialCount > 0 ? s.successCount / s.trialCount : 0.5;
    return s;
  }

  mutate(rate = 0.1) {
    if (Math.random() >= rate) return null;
    const idx = Math.floor(Math.random() * this.strategies.length);
    const s = this.strategies[idx];
    const newStrategy = {
      name: `${s.name}_mut_${Date.now()}`,
      affinity: [...s.affinity],
      successCount: 0,
      trialCount: 0,
      affinityScore: 0.3,
    };
    if (newStrategy.affinity.length > 1 && Math.random() < 0.5) {
      newStrategy.affinity.splice(Math.floor(Math.random() * newStrategy.affinity.length), 1);
    }
    this.catalog.set(newStrategy.name, newStrategy);
    this.strategies.push(newStrategy);
    return newStrategy;
  }
}

module.exports = { ProofStrategyRepertoire, STRATEGIES };
