/**
 * Negative Search Memory — Phase 10.
 *
 * Chaque échec confirmé produit :
 * - negative knowledge (phéromone répulsive)
 * - lineage scar
 * - portée, confiance, TTL, conditions
 */

class NegativeSearchMemory {
  constructor() {
    this.trails = new Map();
  }

  recordFailure(agentId, hypothesis, evidence, environment) {
    const id = `neg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const trail = {
      id,
      agentId,
      hypothesisId: hypothesis.id,
      statement: hypothesis.statement,
      evidence: evidence.ref,
      evidenceStrength: evidence.strength,
      environment: environment.signature,
      conditions: environment.conditions,
      scope: environment.scope || 'agent',
      confidence: this.calculateConfidence(evidence),
      ttl: this.calculateTTL(evidence),
      createdAt: Date.now(),
      active: true
    };
    this.trails.set(id, trail);
    return trail;
  }

  calculateConfidence(evidence) {
    return Math.min(1, (evidence.strength || 0.5) * (evidence.reliability || 0.7));
  }

  calculateTTL(evidence) {
    const baseTTL = 3600000; // 1 hour
    return baseTTL * (evidence.strength || 0.5);
  }

  getActiveTrails(agentId) {
    return Array.from(this.trails.values())
      .filter(t => t.agentId === agentId && t.active && Date.now() < t.createdAt + t.ttl);
  }

  isPathBlocked(agentId, hypothesisStatement) {
    const activeTrails = this.getActiveTrails(agentId);
    return activeTrails.some(t => t.statement === hypothesisStatement);
  }

  evaporate() {
    const now = Date.now();
    for (const [id, trail] of this.trails) {
      if (now > trail.createdAt + trail.ttl) {
        this.trails.delete(id);
      }
    }
  }
}

module.exports = { NegativeSearchMemory }
