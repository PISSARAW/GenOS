'use strict';

/**
 * @file mathematicalNiche.js
 * @description MathematicalNiche — a sub-problem or representation family.
 * Has a resource gradient (MVT) and population of lineages working on it.
 */

const crypto = require('node:crypto');

function nicheId() {
  return `niche-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

class MathematicalNiche {
  constructor(options = {}) {
    this.id = options.id || nicheId();
    this.name = options.name || this.id;
    this.kind = options.kind || 'general';
    this.formulation = options.formulation || '';
    this.representation = options.representation || 'SAT';
    this.lineages = new Map();
    this.stigmergicTraces = [];
    this.resourceHistory = [];
    this.totalInfoGain = 0;
    this.createdAt = new Date().toISOString();
  }

  addLineage(lineage) {
    this.lineages.set(lineage.id, lineage);
    return lineage;
  }

  removeLineage(lineageId) {
    this.lineages.delete(lineageId);
  }

  addTrace(trace) {
    this.stigmergicTraces.push({
      ...trace,
      depositedAt: new Date().toISOString(),
    });
  }

  recordReturn(infoGain, timeCost) {
    const entry = {
      infoGain,
      timeCost,
      marginalYield: timeCost > 0 ? infoGain / timeCost : 0,
      recordedAt: new Date().toISOString(),
    };
    this.resourceHistory.push(entry);
    this.totalInfoGain += infoGain;
    return entry;
  }

  /**
   * Marginal Value Theorem evaluation.
   * Returns whether lineages should depart this niche.
   */
  evaluateMVT(envMeanReturnRate = 0.35) {
    if (this.resourceHistory.length < 2) {
      return { shouldDepart: false, reason: 'Insufficient history' };
    }
    const recent = this.resourceHistory.slice(-3);
    const avgMarginal = recent.reduce((s, r) => s + r.marginalYield, 0) / recent.length;
    return {
      shouldDepart: avgMarginal < envMeanReturnRate,
      marginalYield: avgMarginal,
      envThreshold: envMeanReturnRate,
      totalLineages: this.lineages.size,
    };
  }

  summary() {
    return {
      id: this.id,
      name: this.name,
      kind: this.representation,
      lineages: this.lineages.size,
      traces: this.stigmergicTraces.length,
      totalInfoGain: this.totalInfoGain,
    };
  }
}

function createMathematicalNiche(options) {
  return new MathematicalNiche(options);
}

module.exports = {
  MathematicalNiche,
  createMathematicalNiche,
  nicheId,
};
