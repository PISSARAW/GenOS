'use strict';

/**
 * @file researchLineage.js
 * @description ResearchLineage — a population of mathematical research strategies.
 * Genome = strategies, representation operators, research policies.
 * Phenotype = currently expressed topology, tools and methods.
 *
 * Deep clone prevents parent-child mutation aliasing.
 */

const crypto = require('node:crypto');

function lineageId() {
  return `lineage-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

const STRATEGY_TYPES = Object.freeze([
  'induction',
  'contradiction',
  'normalization',
  'linarith',
  'ring',
  'omega',
  'simp',
  'rewrite',
  'existing_theorem_retrieval',
  'auxiliary_lemma_generation',
  'representation_change',
]);

function deepClone(value) {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(deepClone);
  const cloned = {};
  for (const key of Object.keys(value)) {
    cloned[key] = deepClone(value[key]);
  }
  return cloned;
}

class ResearchLineage {
  constructor(options = {}) {
    this.id = options.id || lineageId();
    this.name = options.name || this.id;
    this.genome = {
      strategies: deepClone(options.genome?.strategies || options.strategies || ['induction']),
      representationOperators: deepClone(options.genome?.representationOperators || ['hybrid']),
      researchPolicy: deepClone(options.genome?.researchPolicy || {
        explorationRate: 0.3,
        exploitationThreshold: 0.7,
        mutationRate: 0.1,
      }),
    };
    this.phenotype = {
      activeTools: deepClone(options.phenotype?.activeTools || ['lean']),
      currentRepresentation: options.phenotype?.currentRepresentation || 'standard',
      expressedTopology: options.phenotype?.expressedTopology || 'linear',
    };
    this.generation = options.generation || 0;
    this.parents = deepClone(options.parents || []);
    this.fitness = options.fitness || null;
    this.createdAt = new Date().toISOString();
  }

  mutate(mutationRate = 0.1) {
    if (Math.random() < mutationRate) {
      const available = STRATEGY_TYPES.filter(s => !this.genome.strategies.includes(s));
      if (available.length > 0) {
        const newStrategy = available[Math.floor(Math.random() * available.length)];
        this.genome.strategies.push(newStrategy);
        return { mutated: true, added: newStrategy };
      }
    }
    return { mutated: false };
  }

  fork(newGenomeOverrides = {}) {
    return new ResearchLineage({
      name: `${this.name}-fork-${Date.now()}`,
      genome: { ...deepClone(this.genome), ...deepClone(newGenomeOverrides) },
      phenotype: deepClone(this.phenotype),
      generation: this.generation + 1,
      parents: [this.id, ...this.parents].slice(0, 2),
    });
  }

  summary() {
    return {
      id: this.id,
      name: this.name,
      generation: this.generation,
      strategies: this.genome.strategies,
      tools: this.phenotype.activeTools,
      fitness: this.fitness,
    };
  }
}

function createResearchLineage(options) {
  return new ResearchLineage(options);
}

module.exports = {
  ResearchLineage,
  createResearchLineage,
  STRATEGY_TYPES,
  lineageId,
  deepClone,
};
