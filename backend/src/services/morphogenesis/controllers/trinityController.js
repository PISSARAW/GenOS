'use strict';

const { TopologyController } = require('./topologyController');

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
      const result = await this.runChamber(chamber);
      this.updateMetrics({ [chamber]: result });
    }

    return {
      verified_claims: this.extractVerifiedClaims(),
      competing_hypotheses: this.hypotheses,
      comparison_receipt: this.buildReceipt()
    };
  }

  async runChamber(chamber) {
    switch (chamber) {
      case 'thesis':
        return { phase: 'thesis', hypotheses: this.hypotheses };
      case 'antithesis':
        return { phase: 'antithesis', counterarguments: this.generateCounterarguments() };
      case 'synthesis':
        return { phase: 'synthesis', synthesis: this.synthesize() };
      default:
        return { phase: chamber };
    }
  }

  generateCounterarguments() {
    return this.hypotheses.map(h => ({ hypothesis: h, counter: `Counter to ${h}` }));
  }

  synthesize() {
    return { merged: this.hypotheses.join(' + '), confidence: 0.8 };
  }

  extractVerifiedClaims() {
    return this.hypotheses.filter(h => h.confidence > 0.7);
  }

  buildReceipt() {
    return { chambers: this.chambers, timestamp: new Date().toISOString() };
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

    const collapsed = this.hypotheses.filter(h => h.confidence > 0.9).length === this.hypotheses.length;
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

module.exports = { TrinityController };