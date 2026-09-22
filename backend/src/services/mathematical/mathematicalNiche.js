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
    // Single source of truth: population owns lineages
    // niche.lineages is a view/accessor to population.lineages
    this._lineages = new Map(); // Legacy, deprecated - use population
    this.stigmergicTraces = [];
    this.resourceHistory = [];
    this.totalInfoGain = 0;
    this.createdAt = new Date().toISOString();
  }

  // Population reference (set by NichePopulationService)
  set population(pop) {
    this._population = pop;
  }

  get population() {
    return this._population;
  }

  /**
   * Get lineages from population (single source of truth).
   * Falls back to internal _lineages for backward compatibility.
   */
  get lineages() {
    if (this._population && this._population.lineages) {
      return this._population.lineages;
    }
    return this._lineages;
  }

  addLineage(lineage) {
    // Add to population if available (single source of truth)
    if (this._population) {
      this._population.addLineage(lineage);
    }
    // Also keep in internal map for backward compatibility
    this._lineages.set(lineage.id, lineage);
    return lineage;
  }

  removeLineage(lineageId) {
    if (this._population) {
      this._population.lineages.delete(lineageId);
    }
    this._lineages.delete(lineageId);
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
   * If envMeanReturnRate not provided, computes from ecosystem history.
   */
  evaluateMVT(envMeanReturnRate = null, allNiches = null) {
    if (this.resourceHistory.length < 2) {
      return { shouldDepart: false, reason: 'Insufficient history' };
    }
    const recent = this.resourceHistory.slice(-3);
    const avgMarginal = recent.reduce((s, r) => s + r.marginalYield, 0) / recent.length;

    // If no env rate provided, compute from own history as fallback
    const threshold = envMeanReturnRate !== null
      ? envMeanReturnRate
      : this.computeEcosystemMeanReturnRate(allNiches);

    return {
      shouldDepart: avgMarginal < threshold,
      marginalYield: avgMarginal,
      envThreshold: threshold,
      totalLineages: this.lineages.size,
    };
  }

  /**
   * Compute ecosystem mean return rate from all niches' resource history.
   * This is the true MVT threshold: average yield across all patches including travel time.
   * @param {Array} allNiches - Array of all niches in the ecosystem
   * @returns {number} Ecosystem mean return rate
   */
  computeEcosystemMeanReturnRate(allNiches = null) {
    // If niches provided, compute global average
    if (allNiches && allNiches.length > 0) {
      let totalInfoGain = 0;
      let totalTimeCost = 0;
      for (const niche of allNiches) {
        for (const entry of niche.resourceHistory) {
          totalInfoGain += entry.infoGain;
          totalTimeCost += entry.timeCost;
        }
      }
      if (totalTimeCost > 0) {
        return totalInfoGain / totalTimeCost;
      }
    }

    // Fallback: use own historical average
    if (this.resourceHistory.length > 0) {
      const totalGain = this.resourceHistory.reduce((s, r) => s + r.infoGain, 0);
      const totalTime = this.resourceHistory.reduce((s, r) => s + r.timeCost, 0);
      if (totalTime > 0) return totalGain / totalTime;
    }

    // Ultimate fallback
    return 0.35;
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
