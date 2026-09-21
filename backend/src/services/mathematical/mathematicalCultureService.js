'use strict';

/**
 * @file mathematicalCultureService.js
 * @description MathematicalCultureService — cultural transmission of lemmas, methods
 * and proofs between lineages. Fidelity decreases with each generation but
 * intentional transmission selects useful knowledge.
 */

const crypto = require('node:crypto');

function culturalArtifactId() {
  return `culture-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

const CULTURAL_TYPES = Object.freeze(['lemma', 'method', 'heuristic', 'proof_pattern', 'representation']);

class MathematicalCulture {
  constructor(opts = {}) {
    this.id = opts.id || `culture-${Date.now()}`;
    this.artifacts = new Map();
    this.transmissionHistory = [];
    this.fidelityRate = opts.fidelityRate != null ? opts.fidelityRate : 0.9;
  }

  addArtifact(artifact) {
    const stored = {
      id: artifact.id || culturalArtifactId(),
      type: artifact.type || 'heuristic',
      content: artifact.content || '',
      source: artifact.source || null,
      generation: 0,
      fidelity: 1.0,
      createdAt: new Date().toISOString(),
      ...artifact,
    };
    this.artifacts.set(stored.id, stored);
    return stored;
  }

  /**
   * Transmit an artifact to a target lineage.
   * Fidelity decreases with each transmission generation.
   */
  transmit(artifactId, targetLineage, opts = {}) {
    const artifact = this.artifacts.get(artifactId);
    if (!artifact) return null;
    const intentional = opts.intentional !== false;
    const decay = intentional ? 0.95 : 0.8;
    const newFidelity = artifact.fidelity * decay;
    const transmitted = {
      ...artifact,
      id: culturalArtifactId(),
      generation: artifact.generation + 1,
      fidelity: newFidelity,
      source: artifact.id,
      transmittedAt: new Date().toISOString(),
    };
    this.artifacts.set(transmitted.id, transmitted);
    targetLineage.genome.strategies.push(transmitted.content);
    this.transmissionHistory.push({
      from: artifactId,
      to: targetLineage.id,
      generation: transmitted.generation,
      fidelity: newFidelity,
    });
    return transmitted;
  }

  /**
   * Selection: preferentially transmit artifacts with high utility.
   */
  selectForTransmission(artifactId, targetLineage) {
    const artifact = this.artifacts.get(artifactId);
    if (!artifact || artifact.fidelity < 0.3) return null;
    return this.transmit(artifactId, targetLineage, { intentional: true });
  }

  summary() {
    return {
      artifacts: this.artifacts.size,
      transmissions: this.transmissionHistory.length,
      avgFidelity: this.artifacts.size > 0
        ? [...this.artifacts.values()].reduce((s, a) => s + a.fidelity, 0) / this.artifacts.size
        : 0,
    };
  }
}

module.exports = { MathematicalCulture, CULTURAL_TYPES };
