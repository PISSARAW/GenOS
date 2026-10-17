'use strict';

const { TopologyController, executionModeFor, executionProofFor } = require('./topologyController');

class TrinityController extends TopologyController {
  constructor(node, runtime) {
    super(node, runtime);
    this.chambers = ['thesis', 'antithesis', 'synthesis'];
    this.currentPhase = 'thesis';
    this.hypotheses = [];
    this.evidence = [];
  }

  async compose(config = {}) {
    this.chambers = config.chambers || this.chambers;
    this.variant = config.variant || 'heterogeneous';
    return { chambers: this.chambers, variant: this.variant };
  }

  async execute(input) {
    const { hypotheses = [], evidence = [] } = input;
    this.hypotheses = hypotheses;
    this.evidence = evidence;

    for (const chamber of this.chambers) {
      this.currentPhase = chamber;
      const result = await this.runChamber(chamber, input);
      this.updateMetrics({ [chamber]: result });
    }
    const receipt = this.buildReceipt(input);
    return {
      verified_claims: verifiedClaims(input, receipt),
      candidate_claims: this.candidateClaimsFromConfidence(),
      competing_hypotheses: this.hypotheses,
      comparison_receipt: receipt,
      executionMode: executionModeFor(input),
      executionProof: executionProofFor(input)
    };
  }

  async runChamber(chamber, input) {
    const supplied = input.chamberResults?.[chamber] || workerChamber(input.workerResults, chamber);
    if (!supplied) return { phase: chamber, status: 'MISSING', evidenceRefs: [] };
    const report = supplied.evidenceReport || supplied;
    const refs = evidenceRefsOf(report, supplied);
    if (supplied.evidenceReport) {
      return { phase: chamber, status: refs.length ? 'VERIFIED' : 'UNVERIFIED', evidenceRefs: refs,
        workerId: supplied.workerId || null, artifactType: report.workerArtifact?.type || null };
    }
    const suppliedRefs = Array.isArray(supplied.evidenceRefs) ? supplied.evidenceRefs.filter(Boolean) : [];
    return { ...structuredClone(supplied), phase: chamber,
      status: suppliedRefs.length ? supplied.status || 'OBSERVED' : 'UNVERIFIED', evidenceRefs: suppliedRefs };
  }

  candidateClaimsFromConfidence() {
    return this.hypotheses.filter(h => h.confidence > 0.7);
  }

  buildReceipt(input) {
    const results = this.chambers.map((chamber) => this.metrics[chamber]);
    const complete = results.every((result) => result?.status === 'VERIFIED'
      && result.evidenceRefs.length > 0);
    const comparison = input.comparisonReceipt;
    const comparisonVerified = comparison?.status === 'VERIFIED'
      && Array.isArray(comparison.evidenceRefs) && comparison.evidenceRefs.length > 0;
    return { chambers: this.chambers, results, complete,
      comparisonVerified, qualified: complete && comparisonVerified,
      timestamp: new Date().toISOString() };
  }

  async observe() {
    const base = await super.observe();
    return {
      ...base,
      currentPhase: this.currentPhase,
      hypothesesCount: this.hypotheses.length,
      evidenceCount: this.evidence.length,
      chambers: this.chambers
    };
  }

  async proposeAdaptation() {
    const adaptations = [];

    if (this.hypotheses.length === 0) {
      adaptations.push({ type: 'CHANGE_VARIANT', to: 'adversarial', reason: 'No hypotheses generated' });
    }

    const collapsed = this.hypotheses.length > 0
      && this.hypotheses.filter(h => h.confidence > 0.9).length === this.hypotheses.length;
    if (collapsed) {
      adaptations.push({ type: 'CHANGE_VARIANT', to: 'adversarial', reason: 'Hypotheses collapsing' });
    }

    const noDiscriminatingEvidence = this.evidence.every(e => e.discriminatoryPower < 0.3);
    if (noDiscriminatingEvidence && this.hypotheses.length > 1) {
      adaptations.push({ type: 'SPLIT', reason: 'No discriminating evidence between hypotheses' });
    }

    const budgetExhausted = this.node.budget && this.node.budget.tokens <= 0;
    if (budgetExhausted) {
      adaptations.push({ type: 'RESIZE_POPULATION', size: 1, reason: 'Budget exhausted' });
    }

    const oneDominating = this.hypotheses.some(h => h.weight > 0.8);
    if (oneDominating) {
      adaptations.push({ type: 'CHANGE_VARIANT', to: 'adversarial', reason: 'One chamber dominating' });
    }

    return adaptations.length ? adaptations : null;
  }
}

function workerChamber(workerResults, chamber) {
  return (Array.isArray(workerResults) ? workerResults : []).find((result) =>
    result.chamber === chamber || result.role === chamber || result.evidenceReport?.chamber === chamber);
}

function evidenceRefsOf(report, supplied) {
  const refs = supplied.evidenceRefs || report.workerArtifact?.provenance?.evidenceRefs
    || report.workerArtifact?.provenance?.sourceRefs || [];
  return Array.isArray(refs) ? refs.filter(Boolean) : [];
}

function verifiedClaims(input, receipt) {
  if (!receipt.qualified || !Array.isArray(input.verifiedClaims)) return [];
  return input.verifiedClaims.filter((claim) => claim?.status === 'VERIFIED'
    && Array.isArray(claim.evidenceRefs) && claim.evidenceRefs.length > 0);
}

module.exports = { TrinityController };
