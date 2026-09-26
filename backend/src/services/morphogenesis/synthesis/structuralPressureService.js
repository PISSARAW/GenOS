'use strict';

const { MorphogenService } = require('./morphogenService');

class StructuralPressureService {
  constructor(opts = {}) {
    this.morphogen = new MorphogenService();
    this.evidenceAnalyzer = opts.evidenceAnalyzer;
    this.budgetTracker = opts.budgetTracker;
    this.coordinator = opts.coordinator;
  }

  async computePressures(context) {
    const pressures = {};

    if (context.evidence) {
      pressures.uncertainty = this.computeUncertainty(context.evidence);
      pressures.contradiction = this.computeContradiction(context.evidence);
      pressures.evidence_gap = this.computeEvidenceGap(context.evidence);
      pressures.novelty = this.computeNovelty(context.evidence);
    }

    if (context.graph && context.graph.nodes) {
      pressures.coupling = this.computeCoupling(context.graph);
      pressures.contention = this.computeContention(context.graph);
      pressures.diversity_loss = this.computeDiversityLoss(context.graph);
      pressures.coordination_cost = this.computeCoordinationCost(context.graph);
    }

    if (context.budget) {
      pressures.resource_pressure = this.computeResourcePressure(context.budget);
    }

    if (context.runtime) {
      pressures.staleness = this.computeStaleness(context.runtime);
      pressures.stall = this.computeStall(context.runtime);
      pressures.failure = this.computeFailureRate(context.runtime);
    }

    if (context.adversarial) {
      pressures.adversarial_pressure = this.computeAdversarialPressure(context.adversarial);
    }

    for (const [signal, value] of Object.entries(pressures)) {
      if (value !== undefined) this.morphogen.updateSignal(signal, value);
    }

    return { pressures: this.morphogen.getAllSignals(), dominant: this.morphogen.getDominantSignals() };
  }

  computeUncertainty(evidence) {
    if (!evidence || !evidence.length) return 1.0;
    const confidence = evidence.reduce((sum, e) => sum + (e.confidence || 0.5), 0) / evidence.length;
    return 1 - confidence;
  }

  computeContradiction(evidence) {
    if (!evidence || evidence.length < 2) return 0;
    let contradictions = 0;
    for (let i = 0; i < evidence.length; i++) {
      for (let j = i + 1; j < evidence.length; j++) {
        if (this.contradicts(evidence[i], evidence[j])) contradictions++;
      }
    }
    return Math.min(1, contradictions / (evidence.length * 0.5));
  }

  contradicts(e1, e2) {
    if (e1.statement && e2.statement) {
      return e1.statement.includes('not ') && e2.statement === e1.statement.replace('not ', '');
    }
    return false;
  }

  computeEvidenceGap(evidence) {
    if (!evidence || !evidence.length) return 1.0;
    const required = 5;
    return Math.max(0, 1 - evidence.length / required);
  }

  computeNovelty(evidence) {
    if (!evidence || !evidence.length) return 1.0;
    const uniqueSources = new Set(evidence.map(e => e.source)).size;
    return Math.min(1, uniqueSources / Math.max(1, evidence.length));
  }

  computeCoupling(graph) {
    if (!graph.nodes || !graph.edges) return 0;
    const edgeCount = graph.edges.length;
    const nodeCount = graph.nodes.length;
    if (nodeCount <= 1) return 0;
    const maxEdges = nodeCount * (nodeCount - 1) / 2;
    return Math.min(1, edgeCount / maxEdges);
  }

  computeContention(graph) {
    if (!graph.nodes || graph.nodes.length < 2) return 0;
    const sharedResources = graph.nodes.filter(n => n.budget && n.budget.shared).length;
    return Math.min(1, sharedResources / graph.nodes.length);
  }

  computeDiversityLoss(graph) {
    if (!graph.nodes || !graph.nodes.length) return 1;
    const topologies = new Set(graph.nodes.map(n => n.topology).filter(Boolean));
    return 1 - (topologies.size / Math.max(1, graph.nodes.length));
  }

  computeCoordinationCost(graph) {
    if (!graph.nodes || !graph.edges) return 0;
    const commEdges = graph.edges.filter(e => e.type === 'COMMUNICATES').length;
    return Math.min(1, commEdges / Math.max(1, graph.nodes.length));
  }

  computeResourcePressure(budget) {
    if (!budget || typeof budget !== 'object') return 0;
    const tokens = budget.tokens || 0;
    const maxTokens = budget.maxTokens || 10000;
    return Math.max(0, 1 - tokens / maxTokens);
  }

  computeStaleness(runtime) {
    if (!runtime.lastActivity) return 1;
    const age = Date.now() - new Date(runtime.lastActivity).getTime();
    return Math.min(1, age / (3600000 * 24));
  }

  computeStall(runtime) {
    if (!runtime.steps || runtime.steps < 2) return 0;
    return runtime.stalledSteps ? runtime.stalledSteps / runtime.steps : 0;
  }

  computeFailureRate(runtime) {
    if (!runtime.totalSteps || runtime.totalSteps === 0) return 0;
    return (runtime.failedSteps || 0) / runtime.totalSteps;
  }

  computeAdversarialPressure(adversarial) {
    if (!adversarial) return 0;
    return Math.min(1, (adversarial.attacks || 0) / 10);
  }

  getMorphogen() {
    return this.morphogen;
  }
}

module.exports = { StructuralPressureService };