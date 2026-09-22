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
    let verified = false;
    let proofReceipt = null;
    let formalResult = null;

    // Reject forged verified: true without a real ProofArtifact.isVerified()
    if (artifact.verified === true && !artifact.proofArtifact) {
      throw new Error('Verified artifacts require a ProofArtifact with isVerified() === true. Forged verified is forbidden.');
    }

    // Derive verified from proofArtifact.isVerified() automatically
    // It is forbidden to simply pass verified: true — the API must derive it
    if (artifact.proofArtifact) {
      verified = artifact.proofArtifact.isVerified();
      if (verified) {
        proofReceipt = artifact.proofArtifact._leanReceipt;
      }
    }

    // Fallback supprimé : seul ProofArtifact.isVerified() fait autorité.
    // Le fallback formalResult.status === 'verified' contourne la preuve Lean
    // et permet à un agent de forger son autorité épistémique sans receipt kernel.
    // Si le fallback est réintroduit plus tard, il devra vérifier un LeanIncrementalGate receipt.

    const stored = {
      ...artifact,
      id: artifact.id || culturalArtifactId(),
      type: artifact.type || 'heuristic',
      content: artifact.content || '',
      source: artifact.source || null,
      generation: artifact.generation !== undefined ? artifact.generation : 0,
      fidelity: artifact.fidelity !== undefined ? artifact.fidelity : 1.0,
      verified,
      proofReceipt,
      formalResult,
      createdAt: new Date().toISOString(),
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
    // Use configured fidelityRate for facts, slightly lower for heuristics
    const factDecay = this.fidelityRate;
    const heuristicDecay = Math.max(0.5, this.fidelityRate - 0.1); // At least 0.5
    const decay = isFact ? factDecay : heuristicDecay;
    const newFidelity = artifact.fidelity * decay;

    // Verified facts become part of knowledge base
    // Unverified ideas become strategies
    if (isFact && artifact.verified) {
      // Only transmit as verified knowledge when we have a genuine ProofArtifact
      // that has passed Lean verification. A formalResult with status 'verified'
      // but no ProofArtifact or without a real Lean receipt is not sufficient —
      // it could be a forged or self-declared verification.
      const hasRealProof = Boolean(
        artifact.proofArtifact
        && typeof artifact.proofArtifact.isVerified === 'function'
        && artifact.proofArtifact.isVerified()
      );
      if (!hasRealProof) {
        // Fall through: treat as unverified strategy
        if (!targetLineage.genome.strategies.includes(artifact.content)) {
          targetLineage.genome.strategies.push(artifact.content);
        }
      } else {
        // Add to lineage knowledge (not strategies)
        if (!targetLineage._knowledge) targetLineage._knowledge = [];
        targetLineage._knowledge.push({
          type: artifact.type,
          content: artifact.content,
          verified: artifact.verified,
          proofArtifact: artifact.proofArtifact,
          semanticFingerprint: artifact.proofArtifact && artifact.proofArtifact._formalResult
            ? artifact.proofArtifact._formalResult.semanticFingerprint
            : null,
          validityDomain: artifact.proofArtifact && artifact.proofArtifact._formalResult
            ? artifact.proofArtifact._formalResult.validityDomain
            : null,
          fidelity: newFidelity,
          source: artifact.id,
        });
      }
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
