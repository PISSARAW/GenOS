'use strict';

/**
 * @file mathematicalCultureService.js
 * @description MathematicalCultureService — cultural transmission of lemmas, methods
 * and proofs between lineages. Distinguishes between theorems/lemmas (verified knowledge)
 * and heuristics/strategies (unverified cultural traits).
 *
 * Fidelity decreases with each generation but intentional transmission
 * selects useful knowledge. Unverified ideas circulate as heuristics only.
 */

const crypto = require('node:crypto');

function culturalArtifactId() {
  return `culture-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

const CULTURAL_TYPES = Object.freeze(['theorem', 'lemma', 'proof_pattern', 'heuristic', 'tactic', 'failed_approach']);

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
      verified: artifact.verified || false,
      createdAt: new Date().toISOString(),
      ...artifact,
    };
    this.artifacts.set(stored.id, stored);
    return stored;
  }

  /**
   * Transmit an artifact to a target lineage.
   * Theorems and lemmas require proof before transmission as facts.
   * Heuristics and strategies circulate freely but are marked unverified.
   */
  transmit(artifactId, targetLineage) {
    const artifact = this.artifacts.get(artifactId);
    if (!artifact) return null;

    const isFact = artifact.type === 'theorem' || artifact.type === 'lemma';
    const decay = isFact ? this.fidelityRate : 0.8;
    const newFidelity = artifact.fidelity * decay;

    // Verified facts become part of knowledge base
    // Unverified ideas become strategies
    if (isFact && artifact.verified) {
      // Add to lineage knowledge (not strategies)
      if (!targetLineage._knowledge) targetLineage._knowledge = [];
      targetLineage._knowledge.push({
        type: artifact.type,
        content: artifact.content,
        fidelity: newFidelity,
        source: artifact.id,
      });
    } else {
      // Add as strategy (unverified)
      if (!targetLineage.genome.strategies.includes(artifact.content)) {
        targetLineage.genome.strategies.push(artifact.content);
      }
    }

    const transmitted = {
      ...artifact,
      id: culturalArtifactId(),
      generation: artifact.generation + 1,
      fidelity: newFidelity,
      source: artifact.id,
      transmittedAt: new Date().toISOString(),
    };
    this.artifacts.set(transmitted.id, transmitted);

    this.transmissionHistory.push({
      from: artifactId,
      to: targetLineage.id,
      type: artifact.type,
      generation: transmitted.generation,
      fidelity: newFidelity,
      wasVerified: artifact.verified,
    });

    return transmitted;
  }

  /**
   * Selection: preferentially transmit artifacts with high utility.
   */
  selectForTransmission(artifactId, targetLineage) {
    const artifact = this.artifacts.get(artifactId);
    if (!artifact || artifact.fidelity < 0.3) return null;
    return this.transmit(artifactId, targetLineage);
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
