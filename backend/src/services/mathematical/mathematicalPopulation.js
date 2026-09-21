'use strict';

class MathematicalPopulation {
  constructor(opts = {}) {
    this.id = opts.id || 'pop-' + Date.now();
    this.niche = opts.niche || null;
    this.lineages = new Map();
    this.generation = 0;
    this.fitnessHistory = [];
    this.extinctCount = 0;
    this.dormantCount = 0;
    this.budget = opts.budget || { tokens: 10000, cpu: 3600 };
    this.createdAt = new Date().toISOString();
  }

  addLineage(lineage) {
    this.lineages.set(lineage.id, lineage);
    return lineage;
  }

  evaluateFitness(lineage, metrics = {}) {
    const P = Math.min(1, (metrics.verifiedObligations || 0) / Math.max(1, metrics.totalObligations || 1));
    const N = metrics.novelty != null ? metrics.novelty : 0.5;
    const I = metrics.informationGain != null ? metrics.informationGain : 0.5;
    const A = Math.min(1, (metrics.affordancesCreated || 0) / 5);
    const T = metrics.transferability != null ? metrics.transferability : 0.5;
    const R = metrics.resistanceToFalsification || 0.5;
    const C = 1 - Math.min(1, (metrics.cost || 0) / Math.max(1, this.budget.tokens));
    const fitness = { P, N, I, A, T, R, C };
    lineage.fitness = fitness;
    return fitness;
  }

  static dominates(a, b) {
    const keys = ['P', 'N', 'I', 'A', 'T', 'R', 'C'];
    let atLeastOneBetter = false;
    for (const k of keys) {
      if (a[k] < b[k]) return false;
      if (a[k] > b[k]) atLeastOneBetter = true;
    }
    return atLeastOneBetter;
  }

  /**
   * Non-dominated sorting (NSGA-II style) for Pareto selection.
   * Returns topK lineages from the best Pareto fronts.
   */
  selectTop(topK = 3) {
    const entries = [];
    for (const [, entry] of this.lineages) {
      entries.push(entry);
    }
    if (entries.length <= topK) return entries;

    // Non-dominated sorting
    const fronts = [];
    const dominatedBy = new Map();
    const dominatesCount = new Map();

    for (const entry of entries) {
      dominatedBy.set(entry.id, []);
      dominatesCount.set(entry.id, 0);
    }

    for (let i = 0; i < entries.length; i++) {
      for (let j = 0; j < entries.length; j++) {
        if (i === j) continue;
        const a = entries[i].fitness || {};
        const b = entries[j].fitness || {};
        if (MathematicalPopulation.dominates(a, b)) {
          dominatedBy.get(entries[i].id).push(entries[j].id);
        } else if (MathematicalPopulation.dominates(b, a)) {
          dominatesCount.set(entries[i].id, dominatesCount.get(entries[i].id) + 1);
        }
      }
    }

    // Build fronts
    let remaining = new Set(entries.map(e => e.id));
    while (remaining.size > 0) {
      const front = [];
      for (const id of remaining) {
        if (dominatesCount.get(id) === 0) {
          front.push(entries.find(e => e.id === id));
        }
      }
      if (front.length === 0) break;
      fronts.push(front);
      for (const entry of front) {
        remaining.delete(entry.id);
        for (const dominatedId of dominatedBy.get(entry.id)) {
          dominatesCount.set(dominatedId, dominatesCount.get(dominatedId) - 1);
        }
      }
    }

    const selected = [];
    for (const front of fronts) {
      if (selected.length + front.length <= topK) {
        selected.push(...front);
      } else {
        const remainingSlots = topK - selected.length;
        selected.push(...front.slice(0, remainingSlots));
        break;
      }
    }
    return selected;
  }

  extinguish(threshold = 0.1, maxGenerationsBelow = 3) {
    const extinct = [];
    for (const [id, lineage] of this.lineages) {
      const fitness = lineage.fitness || { P: 0 };
      const minFitness = Math.min(...Object.values(fitness));
      if (minFitness < threshold) {
        lineage._belowThresholdGenerations = (lineage._belowThresholdGenerations || 0) + 1;
        if (lineage._belowThresholdGenerations >= maxGenerationsBelow) {
          this.lineages.delete(id);
          extinct.push(id);
          this.extinctCount += 1;
        }
      }
    }
    return extinct;
  }

  dormant(lineageId) {
    const l = this.lineages.get(lineageId);
    if (!l) return null;
    l._dormant = true;
    l._dormantSince = new Date().toISOString();
    this.dormantCount += 1;
    return l;
  }

  migrateLineage(lineageId, targetPopulation) {
    const l = this.lineages.get(lineageId);
    if (!l) return null;
    this.lineages.delete(lineageId);
    l._migratedFrom = this.id;
    targetPopulation.addLineage(l);
    return l;
  }

  summary() {
    return {
      id: this.id,
      niche: this.niche?.id || null,
      lineages: this.lineages.size,
      generation: this.generation,
      extinct: this.extinctCount,
      dormant: this.dormantCount,
    };
  }
}

module.exports = { MathematicalPopulation };
