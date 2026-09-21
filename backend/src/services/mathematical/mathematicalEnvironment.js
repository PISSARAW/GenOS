'use strict';

/**
 * @file mathematicalEnvironment.js
 * @description MathematicalEnvironment — the substrate for mathematical research.
 * Defines the contracts for problem, lineage, niche and proof artifact.
 * The Lean Gate is the selective environment (physics of the world), not the creative agent.
 */

const crypto = require('node:crypto');
const { createMathematicalNiche } = require('./mathematicalNiche');

function envId() {
  return `math-env-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

function normalizeStatement(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Mathematical statement is required.');
  }
  return value.trim();
}

function normalizeDomain(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Mathematical domain is required.');
  }
  return value.toLowerCase().trim();
}

class MathematicalEnvironment {
  constructor(options = {}) {
    this.id = options.id || envId();
    this.problem = {
      statement: normalizeStatement(options.problem?.statement || options.problem || ''),
      domain: normalizeDomain(options.problem?.domain || options.domain || 'general'),
      assumptions: options.problem?.assumptions || options.assumptions || [],
      constraints: options.problem?.constraints || options.constraints || [],
      knownResults: options.problem?.knownResults || options.knownResults || [],
      partialCandidates: options.problem?.partialCandidates || options.partialCandidates || [],
    };
    this.availableKnowledge = options.availableKnowledge || [];
    this.difficulty = options.difficulty || 0.5;
    this.budget = options.budget || { tokens: 10000, cpu: 3600, memory: 8192 };
    this.niches = new Map();
    this.lineages = new Map();
    this.artifacts = new Map();
    this.createdAt = new Date().toISOString();
  }

  addNiche(niche) {
    this.niches.set(niche.id, niche);
    return niche;
  }

  addLineage(lineage) {
    this.lineages.set(lineage.id, lineage);
    return lineage;
  }

  addArtifact(artifact) {
    this.artifacts.set(artifact.id, artifact);
    return artifact;
  }

  get Niches() {
    return [...this.niches.values()];
  }

  get Lineages() {
    return [...this.lineages.values()];
  }

  get Artifacts() {
    return [...this.artifacts.values()];
  }

  createNiche(options) {
    const niche = createMathematicalNiche(options);
    this.addNiche(niche);
    return niche;
  }

  summary() {
    return {
      id: this.id,
      problem: this.problem.statement,
      domain: this.problem.domain,
      niches: this.niches.size,
      lineages: this.lineages.size,
      artifacts: this.artifacts.size,
      budget: this.budget,
    };
  }
}

function createMathematicalEnvironment(options) {
  return new MathematicalEnvironment(options);
}

module.exports = {
  MathematicalEnvironment,
  createMathematicalEnvironment,
  envId,
};
