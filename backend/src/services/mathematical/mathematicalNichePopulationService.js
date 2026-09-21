'use strict';

/**
 * @file mathematicalNichePopulationService.js
 * @description MathematicalNichePopulationService — manages populations within
 * niches with Marginal Value Theorem migration.
 * When a niche's marginal yield drops below envMeanReturnRate, migrate lineages
 * to better niches.
 */

const { createMathematicalPopulation } = require('./mathematicalPopulation');

class MathematicalNichePopulationService {
  constructor(opts = {}) {
    this.id = opts.id || `nps-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    this.niches = new Map();
    this.envMeanReturnRate = opts.envMeanReturnRate || 0.35;
    this.migrationHistory = [];
  }

  addNiche(niche) {
    if (!niche.population) {
      niche.population = createMathematicalPopulation({ niche });
    }
    this.niches.set(niche.id, niche);
    return niche;
  }

  /**
   * Allocate a lineage to the niche with the best current marginal yield.
   */
  allocateToBestNiche(lineage) {
    let bestNiche = null;
    let bestYield = -1;

    for (const [, niche] of this.niches) {
      const lastReturn = niche.resourceHistory[niche.resourceHistory.length - 1];
      const marginalYield = lastReturn ? lastReturn.marginalYield : 0.5;
      if (marginalYield > bestYield) {
        bestYield = marginalYield;
        bestNiche = niche;
      }
    }

    if (bestNiche) {
      bestNiche.addLineage(lineage);
      bestNiche.population.addLineage(lineage);
    }
    return bestNiche;
  }

  /**
   * Evaluate all niches and migrate those below envMeanReturnRate.
   */
  evaluateAndMigrate() {
    const migrations = [];

    for (const [nicheId, niche] of this.niches) {
      if (!niche.population) continue;
      const mvt = niche.evaluateMVT(this.envMeanReturnRate);

      if (mvt.shouldDepart && niche.population.lineages.size > 0) {
        // Find the best target niche
        let targetNiche = null;
        let bestYield = -1;
        for (const [otherId, other] of this.niches) {
          if (otherId === nicheId) continue;
          const lastReturn = other.resourceHistory[other.resourceHistory.length - 1];
          const marginalYield = lastReturn ? lastReturn.marginalYield : 0.5;
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
