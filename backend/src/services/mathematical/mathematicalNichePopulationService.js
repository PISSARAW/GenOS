'use strict';

const { MathematicalPopulation } = require('./mathematicalPopulation');

class MathematicalNichePopulationService {
  constructor(opts = {}) {
    this.id = opts.id || `nps-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    this.niches = new Map();
    this.envMeanReturnRate = opts.envMeanReturnRate ?? 0.35;
    this.migrationHistory = [];
  }

  addNiche(niche) {
    if (!niche.population) {
      niche.population = new MathematicalPopulation({ niche });
    }
    this.niches.set(niche.id, niche);
    return niche;
  }

  allocateToBestNiche(lineage) {
    let bestNiche = null;
    let bestYield = -1;

    for (const [, niche] of this.niches) {
      if (!niche.resourceHistory || niche.resourceHistory.length === 0) continue;
      const lastReturn = niche.resourceHistory[niche.resourceHistory.length - 1];
      const marginalYield = lastReturn ? lastReturn.marginalYield : 0;
      if (marginalYield > bestYield) {
        bestYield = marginalYield;
        bestNiche = niche;
      }
    }

    // If no niche has history, pick the first one
    if (!bestNiche && this.niches.size > 0) {
      bestNiche = this.niches.values().next().value;
    }

    if (bestNiche) {
      bestNiche.addLineage(lineage);
      bestNiche.population.addLineage(lineage);
    }
    return bestNiche;
  }

  /**
   * Compute ecosystem-wide mean return rate from all niches.
   * MVT threshold = total info gain / total time across all patches.
   */
  computeEcosystemMeanReturnRate() {
    let totalInfoGain = 0;
    let totalTimeCost = 0;
    for (const [, niche] of this.niches) {
      for (const entry of niche.resourceHistory) {
        totalInfoGain += entry.infoGain;
        totalTimeCost += entry.timeCost;
      }
    }
    if (totalTimeCost > 0) {
      this.envMeanReturnRate = totalInfoGain / totalTimeCost;
    }
    return this.envMeanReturnRate;
  }

  evaluateAndMigrate() {
    // Update ecosystem mean return rate before evaluating
    this.computeEcosystemMeanReturnRate();

    const migrations = [];

    for (const [nicheId, niche] of this.niches) {
      if (!niche.population) continue;
      // Pass all niches for ecosystem rate computation
      const allNiches = [...this.niches.values()];
      const mvt = niche.evaluateMVT(this.envMeanReturnRate, allNiches);

      if (mvt.shouldDepart && niche.population.lineages.size > 0) {
        let targetNiche = null;
        let bestYield = -1;
        for (const [otherId, other] of this.niches) {
          if (otherId === nicheId) continue;
          if (!other.resourceHistory || other.resourceHistory.length === 0) continue;
          const lastReturn = other.resourceHistory[other.resourceHistory.length - 1];
          const marginalYield = lastReturn ? lastReturn.marginalYield : 0;
          if (marginalYield > bestYield) {
            bestYield = marginalYield;
            targetNiche = other;
          }
        }

        if (targetNiche) {
          const lineagesToMigrate = [...niche.population.lineages.values()].slice(0, 2);
          for (const lineage of lineagesToMigrate) {
            niche.population.migrateLineage(lineage.id, targetNiche.population);
            migrations.push({ from: nicheId, to: targetNiche.id, lineage: lineage.id });
          }
        }
      }
    }

    this.migrationHistory.push(...migrations);
    return migrations;
  }

  summary() {
    return {
      id: this.id,
      niches: this.niches.size,
      envMeanReturnRate: this.envMeanReturnRate,
      migrations: this.migrationHistory.length,
    };
  }
}

module.exports = { MathematicalNichePopulationService };
