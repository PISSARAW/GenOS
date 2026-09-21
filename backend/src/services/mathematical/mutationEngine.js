'use strict';

/**
 * @file mutationEngine.js
 * @description Mutation engine for mathematical research lineages.
 * Implements mutation, recombination, exaptation, and horizontal gene transfer.
 *
 * HGT requires passing through the epistemic immune system before assimilation.
 */

const { createResearchLineage, deepClone } = require('./researchLineage');

const MUTATION_TYPES = Object.freeze(['point', 'insert', 'delete', 'swap', 'recombine', 'hgt']);

class MutationEngine {
  constructor(opts = {}) {
    this.mutationRate = opts.mutationRate || 0.1;
    this.recombinationRate = opts.recombinationRate || 0.2;
    this.hgtRate = opts.hgtRate || 0.05;
    this.exaptationRate = opts.exaptationRate || 0.1;
    this.history = [];
  }

  /**
   * Point mutation: change one strategy in a lineage.
   */
  pointMutate(lineage) {
    if (Math.random() > this.mutationRate) return null;
    const strategies = lineage.genome.strategies;
    if (strategies.length === 0) return null;
    const idx = Math.floor(Math.random() * strategies.length);
    const oldStrategy = strategies[idx];
    const alternatives = ['induction', 'contradiction', 'normalization', 'linarith', 'ring', 'omega', 'simp', 'rewrite', 'existing_theorem_retrieval', 'auxiliary_lemma_generation', 'representation_change'];
    const newStrategy = alternatives[Math.floor(Math.random() * alternatives.length)];
    strategies[idx] = newStrategy;
    const result = { type: 'point', lineageId: lineage.id, oldStrategy, newStrategy };
    this.history.push(result);
    return result;
  }

  /**
   * Recombination: combine strategies from two parent lineages.
   */
  recombine(parent1, parent2) {
    if (Math.random() > this.recombinationRate) return null;
    const childGenome = {
      strategies: [...new Set([...parent1.genome.strategies, ...parent2.genome.strategies])].slice(0, 5),
      representationOperators: [...new Set([...parent1.genome.representationOperators, ...parent2.genome.representationOperators])],
      researchPolicy: {
        explorationRate: (parent1.genome.researchPolicy.explorationRate + parent2.genome.researchPolicy.explorationRate) / 2,
        exploitationThreshold: (parent1.genome.researchPolicy.exploitationThreshold + parent2.genome.researchPolicy.exploitationThreshold) / 2,
        mutationRate: (parent1.genome.researchPolicy.mutationRate + parent2.genome.researchPolicy.mutationRate) / 2,
      },
    };
    const child = createResearchLineage({
      name: `recombined-${parent1.id}-${parent2.id}`,
      genome: childGenome,
      parents: [parent1.id, parent2.id],
    });
    const result = { type: 'recombine', parents: [parent1.id, parent2.id], childId: child.id };
    this.history.push(result);
    return { child, result };
  }

  /**
   * Exaptation: reuse a strategy from one context in a new context.
   */
  exapt(lineage, targetContext) {
    if (Math.random() > this.exaptationRate) return null;
    const strategies = lineage.genome.strategies;
    if (strategies.length === 0) return null;
    const exaptedStrategy = strategies[Math.floor(Math.random() * strategies.length)];
    const result = {
      type: 'exaptation',
      lineageId: lineage.id,
      strategy: exaptedStrategy,
      targetContext,
    };
    this.history.push(result);
    return result;
  }

  /**
   * Horizontal gene transfer with immune gate.
   * Returns a MathematicalPlasmid if successful, null if blocked.
   */
  horizontalGeneTransfer(sourceLineage, targetLineage, immuneReport) {
    if (Math.random() > this.hgtRate) return null;
    const sourceStrategies = sourceLineage.genome.strategies;
    if (sourceStrategies.length === 0) return null;

    // Immune gate: if blocked, transfer is rejected
    if (immuneReport && immuneReport.blocked) {
      return null;
    }

    const transferred = sourceStrategies[Math.floor(Math.random() * sourceStrategies.length)];

    // Create a plasmid with provenance and constraints
    const plasmid = {
      capability: transferred,
      source: sourceLineage.id,
      target: targetLineage.id,
      provenance: {
        transferredAt: new Date().toISOString(),
        sourceFitness: sourceLineage.fitness,
      },
      validityDomain: {
        assumptions: [],
        constraints: [],
      },
      proofReceipt: null,
      semanticFingerprint: null,
    };

    // Only transfer if not already present
    if (!targetLineage.genome.strategies.includes(transferred)) {
      targetLineage.genome.strategies.push(transferred);
    }

    const result = {
      type: 'hgt',
      source: sourceLineage.id,
      target: targetLineage.id,
      strategy: transferred,
      plasmid,
      immunePassed: immuneReport ? !immuneReport.blocked : true,
    };
    this.history.push(result);
    return result;
  }

  summary() {
    return {
      mutations: this.history.length,
      byType: MUTATION_TYPES.reduce((acc, t) => {
        acc[t] = this.history.filter(h => h.type === t).length;
        return acc;
      }, {}),
    };
  }
}

module.exports = { MutationEngine, MUTATION_TYPES };
