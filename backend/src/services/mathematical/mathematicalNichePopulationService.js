'use strict';

const { MathematicalPopulation } = require('./mathematicalPopulation');

class MathematicalNichePopulationService {
  constructor(opts = {}) {
    this.id = opts.id || `nps-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    this.niches = new Map();
    this.envMeanReturnRate = opts.envMeanReturnRate || 0.35;
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

    if (bestNiche) {
      bestNiche.addLineage(lineage);
      bestNiche.population.addLineage(lineage);
    }
    return bestNiche;
  }

  evaluateAndMigrate() {
    const migrations = [];

    for (const [nicheId, niche] of this.niches) {
      if (!niche.population) continue;
      const mvt = niche.evaluateMVT(this.envMeanReturnRate);

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
