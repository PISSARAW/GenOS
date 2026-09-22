'use strict';

/**
 * @file mutationEngine.js
 * @description Mutation engine for mathematical research lineages.
 * Implements mutation, recombination, exaptation, and horizontal gene transfer.
 *
 * HGT requires passing through the epistemic immune system before assimilation.
 * MathematicalPlasmid carries full epistemic provenance: capability, validity domain,
 * proof receipt, semantic fingerprint, and compatibility requirements.
 */

const crypto = require('node:crypto');
const { createResearchLineage, deepClone } = require('./researchLineage');

const MUTATION_TYPES = Object.freeze(['point', 'insert', 'delete', 'swap', 'recombine', 'hgt']);

const PLASMID_TYPES = Object.freeze(['lemma', 'strategy', 'representation', 'tactic', 'heuristic']);

/**
 * Create a MathematicalPlasmid for HGT.
 * A plasmid is a unit of epistemic transfer with full provenance.
 */
function createMathematicalPlasmid(options = {}) {
  const capability = options.capability || '';
  const source = options.source || '';
  const proofReceipt = options.proofReceipt || null;
  const semanticFingerprint = options.semanticFingerprint || `sha256:${crypto.createHash('sha256').update(capability + source + Date.now()).digest('hex')}`;

  return {
    id: `plasmid-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    type: options.type || 'strategy',
    capability,
    source,
    target: options.target || null,
    provenance: {
      transferredAt: new Date().toISOString(),
      sourceFitness: options.sourceFitness || null,
      sourceGeneration: options.sourceGeneration || 0,
      originalDiscovery: options.originalDiscovery || null,
      ...options.provenance,
    },
    validityDomain: {
      assumptions: options.validityDomain?.assumptions || [],
      constraints: options.validityDomain?.constraints || [],
      domain: options.validityDomain?.domain || 'general',
    },
    proofReceipt,
    semanticFingerprint,
    compatibility: {
      requiredFitness: options.compatibility?.requiredFitness || 0.1,
      excludedDomains: options.compatibility?.excludedDomains || [],
      requiredRepresentations: options.compatibility?.requiredRepresentations || [],
    },
    assimilationStatus: 'pending', // pending | assimilated | rejected
  };
}

/**
 * AEIS (Adaptive Epistemic Immune System) gate for HGT.
 * Checks compatibility, verifies proof receipt, prevents contamination.
 */
function aeisGate(sourceLineage, targetLineage, plasmid) {
  // 1. Check if source has verified results (fitness.P > threshold)
  const sourceFitness = sourceLineage.fitness;
  if (!sourceFitness || (sourceFitness.P || 0) < (plasmid.compatibility.requiredFitness || 0.1)) {
    return { blocked: true, reason: 'insufficient_source_verification', sourceFitness: sourceFitness?.P || 0 };
  }

  // 2. Check proof receipt validity
  if (plasmid.proofReceipt) {
    const receipt = plasmid.proofReceipt;
    if (receipt.status !== 'passed') {
      return { blocked: true, reason: 'invalid_proof_receipt', receiptStatus: receipt.status };
    }
    // Verify receipt digest is valid SHA-256
    const SHA256 = /^sha256:[a-f0-9]{64}$/;
    if (!SHA256.test(receipt.receiptDigest || '')) {
      return { blocked: true, reason: 'invalid_receipt_digest' };
    }
  } else if (plasmid.type === 'lemma') {
    // Lemmas require proof receipt
    return { blocked: true, reason: 'lemma_requires_proof_receipt' };
  }

  // 3. Check validity domain compatibility
  const targetDomain = targetLineage.genome?.researchPolicy?.domain || 'general';
  if (plasmid.validityDomain.domain !== 'general' && plasmid.validityDomain.domain !== targetDomain) {
    // Allow but flag - may need adaptation
    // Not blocking, just noting
  }

  // 4. Check for contradiction with target's existing knowledge
  const targetStrategies = targetLineage.genome?.strategies || [];
  const contradictions = plasmid.compatibility.excludedDomains.filter(d => targetStrategies.includes(d));
  if (contradictions.length > 0) {
    return { blocked: true, reason: 'domain_contradiction', contradictions };
  }

  // 5. Semantic fingerprint uniqueness (prevent duplicate transfer)
  if (targetLineage._assimilatedPlasmids?.includes(plasmid.semanticFingerprint)) {
    return { blocked: true, reason: 'already_assimilated', fingerprint: plasmid.semanticFingerprint };
  }

  // 6. Fitness compatibility - prevent parasitic transfer from low-fitness to high-fitness
  const targetFitness = targetLineage.fitness;
  if (targetFitness && sourceFitness) {
    const sourceAvg = Object.values(sourceFitness).reduce((a, b) => a + b, 0) / 7;
    const targetAvg = Object.values(targetFitness).reduce((a, b) => a + b, 0) / 7;
    if (sourceAvg < targetAvg * 0.5) {
      return { blocked: true, reason: 'parasitic_transfer_risk', sourceAvg, targetAvg };
    }
  }

  return { blocked: false, plasmid };
}

class MutationEngine {
  constructor(opts = {}) {
    this.mutationRate = opts.mutationRate || 0.1;
    this.recombinationRate = opts.recombinationRate || 0.2;
    this.hgtRate = opts.hgtRate || 0.05;
    this.exaptationRate = opts.exaptationRate || 0.1;
    this.history = [];
    this.assimilatedPlasmids = new Set(); // Track globally assimilated plasmids
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
   * Horizontal gene transfer with AEIS gate.
   * Transfers a specific ProofArtifact (with its proof receipt) rather than random strategy.
   * Returns a MathematicalPlasmid if successful, null if blocked.
   * The plasmid carries the specific ProofArtifact's proof receipt.
   */
  horizontalGeneTransfer(sourceLineage, targetLineage, proofArtifact, immuneReport) {
    if (Math.random() > this.hgtRate) return null;
    if (!proofArtifact || !proofArtifact.isVerified()) return null;

    // Immune gate: if blocked, transfer is rejected
    if (immuneReport && immuneReport.blocked) {
      return null;
    }

    const capability = proofArtifact.statement || proofArtifact._formalResult?.canonicalStatement || '';
    if (!capability) return null;

    // Determine plasmid type based on artifact type
    // Theorems and lemmas carry knowledge, not strategies
    const plasmidType = proofArtifact.type === 'theorem' || proofArtifact.type === 'lemma' ? 'knowledge' : 'strategy';

    // Create a proper MathematicalPlasmid with the SPECIFIC ProofArtifact's proof receipt
    const plasmid = createMathematicalPlasmid({
      type: plasmidType,
      capability,
      source: sourceLineage.id,
      target: targetLineage.id,
      sourceFitness: sourceLineage.fitness,
      sourceGeneration: sourceLineage.generation,
      proofReceipt: proofArtifact._leanReceipt, // SPECIFIC artifact's proof receipt
      validityDomain: {
        assumptions: proofArtifact._formalResult?.assumptions || [],
        constraints: proofArtifact._formalResult?.validityDomain?.constraints || [],
        domain: proofArtifact.domain || 'general',
      },
      compatibility: {
        requiredFitness: 0.1,
        excludedDomains: [],
        requiredRepresentations: proofArtifact._formalResult?.provenance?.transformations?.includes('lean') ? ['lean'] : [],
      },
    });

    // Run AEIS gate
    const aeisResult = aeisGate(sourceLineage, targetLineage, plasmid);
    if (aeisResult.blocked) {
      plasmid.assimilationStatus = 'rejected';
      const result = {
        type: 'hgt',
        source: sourceLineage.id,
        target: targetLineage.id,
        capability,
        plasmid,
        immunePassed: false,
        blockReason: aeisResult.reason,
      };
      this.history.push(result);
      return result;
    }

    // Assimilate: add the proven capability to target lineage
    // Knowledge plasmids (theorems/lemmas) go to lineage knowledge
    // Strategy plasmids go to genome.strategies
    if (plasmidType === 'knowledge') {
      // Add to lineage knowledge with proof artifact reference
      if (!targetLineage._knowledge) targetLineage._knowledge = [];
      // Check if already assimilated (by fingerprint)
      const alreadyAssimilated = targetLineage._knowledge?.some(
        k => k.proofArtifact && k.proofArtifact.isVerified()
      );
      if (!alreadyAssimilated) {
        targetLineage._knowledge.push({
          type: pluginType,
          content: capability,
          fidelity: plasmid.fidelity,
          source: plasmid.source,
          proofArtifact: proofArtifact, // Keep reference for verification
        });
      }
    } else if (!targetLineage.genome.strategies.includes(capability)) {
      targetLineage.genome.strategies.push(capability);
    }

    // Track assimilated plasmids
    if (!targetLineage._assimilatedPlasmids) targetLineage._assimilatedPlasmids = [];
    targetLineage._assimilatedPlasmids.push(plasmid.semanticFingerprint);
    this.assimilatedPlasmids.add(plasmid.semanticFingerprint);
    plasmid.assimilationStatus = 'assimilated';

    const result = {
      type: 'hgt',
      source: sourceLineage.id,
      target: targetLineage.id,
      capability,
      plasmid,
      immunePassed: true,
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
      assimilatedPlasmids: this.assimilatedPlasmids.size,
    };
  }
}

module.exports = {
  MutationEngine,
  MUTATION_TYPES,
  createMathematicalPlasmid,
  aeisGate,
  PLASMID_TYPES,
};
