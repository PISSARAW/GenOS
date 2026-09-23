'use strict';

/**
 * @file mutationEngine.js
 * @description Mutation engine for mathematical research lineages.
 * Implements mutation, recombination, exaptation, and horizontal gene transfer.
 *
 * HGT requires passing through the AEIS (Adaptive Epistemic Immune System) gate before assimilation.
 * MathematicalPlasmid carries full epistemic provenance: capability, validity domain,
 * proof receipt, semantic fingerprint, and compatibility requirements.
 */

const crypto = require('node:crypto');
const { createResearchLineage, deepClone } = require('./researchLineage');

const MUTATION_TYPES = Object.freeze(['point', 'insert', 'delete', 'swap', 'recombine', 'hgt']);
const PLASMID_TYPES = Object.freeze(['knowledge', 'lemma', 'strategy', 'representation', 'tactic', 'heuristic']);

function computeSemanticFingerprint(options = {}) {
  const capability = options._canonicalStatement || options.capability || '';
  return `sha256:${crypto.createHash('sha256').update(
    capability +
    JSON.stringify(options.validityDomain || {}) +
    (options._assumptions || []).join(',')
  ).digest('hex')}`;
}

/**
 * Create a MathematicalPlasmid for HGT.
 * A plasmid is a unit of epistemic transfer with full provenance.
 *
 * Sémantique du fingerprint :
 * - semanticFingerprint : identité de la CONNAISSANCE (théorème + domaine + hypothèses)
 * - id (eventId) : identité de l'ÉVÉNEMENT de transfert (hash avec source/cible/temps)
 */
function createMathematicalPlasmid(options = {}) {
  const vd = options.validityDomain || {};
  const c = options.compatibility || {};
  return {
    id: `plasmid-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    type: options.type || 'strategy',
    capability: options.capability || '',
    source: options.source || '',
    target: options.target || null,
    provenance: Object.assign({
      transferredAt: new Date().toISOString(),
      sourceFitness: options.sourceFitness || null,
      sourceGeneration: options.sourceGeneration || 0,
      originalDiscovery: options.originalDiscovery || null,
    }, options.provenance),
    validityDomain: { assumptions: vd.assumptions || [], constraints: vd.constraints || [], domain: vd.domain || 'general' },
    proofReceipt: options.proofReceipt || null,
    semanticFingerprint: options.semanticFingerprint || computeSemanticFingerprint(options),
    compatibility: { requiredFitness: c.requiredFitness ?? 0.1, excludedDomains: c.excludedDomains || [], requiredRepresentations: c.requiredRepresentations || [] },
    assimilationStatus: 'pending',
  };
}

function checkSourceFitness(sourceLineage, plasmid) {
  const sourceFitness = sourceLineage.fitness;
  if (!sourceFitness || (sourceFitness.P ?? 0) < (plasmid.compatibility.requiredFitness ?? 0.1)) {
    return { blocked: true, reason: 'insufficient_source_verification', sourceFitness: sourceFitness?.P || 0 };
  }
  return { blocked: false };
}

function checkProofReceipt(plasmid) {
  if (plasmid.proofReceipt) {
    const receipt = plasmid.proofReceipt;
    if (receipt.status !== 'passed') {
      return { blocked: true, reason: 'invalid_proof_receipt', receiptStatus: receipt.status };
    }
    const SHA256 = /^sha256:[a-f0-9]{64}$/;
    if (!SHA256.test(receipt.receiptDigest || '')) {
      return { blocked: true, reason: 'invalid_receipt_digest' };
    }
  } else if (plasmid.type === 'lemma' || plasmid.type === 'knowledge') {
    return { blocked: true, reason: 'lemma_requires_proof_receipt' };
  }
  return { blocked: false };
}

function checkFitnessCompatibility(sourceLineage, targetLineage, plasmid) {
  const targetFitness = targetLineage.fitness;
  const sourceFitness = sourceLineage.fitness;
  if (targetFitness && sourceFitness) {
    const sourceAvg = Object.values(sourceFitness).reduce((a, b) => a + b, 0) / 7;
    const targetAvg = Object.values(targetFitness).reduce((a, b) => a + b, 0) / 7;
    if (sourceAvg < targetAvg * 0.5) {
      return { blocked: true, reason: 'parasitic_transfer_risk', sourceAvg, targetAvg };
    }
  }
  return { blocked: false };
}

/**
 * AEIS (Adaptive Epistemic Immune System) gate for HGT.
 * Checks compatibility, verifies proof receipt, prevents contamination.
 */
function aeisGate(sourceLineage, targetLineage, plasmid) {
  // 1. Source fitness verification
  const fitnessCheck = checkSourceFitness(sourceLineage, plasmid);
  if (fitnessCheck.blocked) return fitnessCheck;

  // 2. Proof receipt validity
  const receiptCheck = checkProofReceipt(plasmid);
  if (receiptCheck.blocked) return receiptCheck;

  // 3. Semantic fingerprint uniqueness (prevent duplicate transfer)
  if (targetLineage._assimilatedPlasmids?.includes(plasmid.semanticFingerprint)) {
    return { blocked: true, reason: 'already_assimilated', fingerprint: plasmid.semanticFingerprint };
  }

  // 4. Fitness compatibility check
  const compatCheck = checkFitnessCompatibility(sourceLineage, targetLineage, plasmid);
  if (compatCheck.blocked) return compatCheck;

  return { blocked: false, plasmid };
}

class MutationEngine {
  constructor(opts = {}) {
    this.mutationRate = opts.mutationRate ?? 0.1;
    this.recombinationRate = opts.recombinationRate ?? 0.2;
    this.hgtRate = opts.hgtRate ?? 0.05;
    this.exaptationRate = opts.exaptationRate ?? 0.1;
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

    if (immuneReport && immuneReport.blocked) {
      return null;
    }

    const capability = proofArtifact.statement || proofArtifact._formalResult?.canonicalStatement || '';
    if (!capability) return null;

    const plasmidType = proofArtifact.type === 'theorem' || proofArtifact.type === 'lemma' ? 'knowledge' : 'strategy';
    const canonicalStmt = proofArtifact._formalResult?.canonicalStatement || capability;
    const vDomain = proofArtifact._formalResult?.validityDomain || {};
    const assumptions = proofArtifact._formalResult?.assumptions || [];
    const semanticFp = `sha256:${crypto.createHash('sha256').update(
      canonicalStmt + JSON.stringify(vDomain) + assumptions.join(',')
    ).digest('hex')}`;

    const plasmid = createMathematicalPlasmid({
      type: plasmidType,
      capability,
      source: sourceLineage.id,
      target: targetLineage.id,
      sourceFitness: sourceLineage.fitness,
      sourceGeneration: sourceLineage.generation,
      proofReceipt: proofArtifact._leanReceipt,
      semanticFingerprint: semanticFp,
      _canonicalStatement: canonicalStmt,
      _assumptions: assumptions,
      validityDomain: {
        assumptions: assumptions,
        constraints: vDomain.constraints || [],
        domain: proofArtifact.domain || 'general',
      },
      compatibility: {
        requiredFitness: 0.1,
        excludedDomains: [],
        requiredRepresentations: proofArtifact._formalResult?.provenance?.transformations?.includes('lean') ? ['lean'] : [],
      },
    });

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
    if (plasmidType === 'knowledge') {
      if (!targetLineage._knowledge) targetLineage._knowledge = [];
      const alreadyAssimilated = targetLineage._knowledge?.some(
        k => k.semanticFingerprint === plasmid.semanticFingerprint
      );
      if (!alreadyAssimilated) {
        targetLineage._knowledge.push({
          type: plasmidType,
          content: capability,
          fidelity: 1.0,
          source: plasmid.source,
          proofArtifact: proofArtifact,
          semanticFingerprint: plasmid.semanticFingerprint,
          validityDomain: plasmid.validityDomain,
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
  computeSemanticFingerprint,
};
