'use strict';

/**
 * @file mathematicalLiteratureForaging.js
 * @description MathematicalLiteratureForaging — treat the literature as a resource
 * landscape. Agents do vector search with Marginal Value Theorem.
 */

const { extractEpitopes } = require('./goalEpitopeExtractor');

class PatchResult {
  constructor(opts = {}) {
    this.id = opts.id || `patch-${Date.now()}`;
    this.statement = opts.statement || '';
    this.assumptions = opts.assumptions || [];
    this.validityDomain = opts.validityDomain || '';
    this.dependencies = opts.dependencies || [];
    this.knownApplications = opts.knownApplications || [];
    this.formalAnalogue = opts.formalAnalogue || null;
    this.source = opts.source || '';
    this.relevanceScore = opts.relevanceScore || 0;
    this.infoGain = opts.infoGain || 0;
  }
}

class LiteratureForager {
  constructor(opts = {}) {
    this.patches = new Map();
    this.currentPatchId = null;
    this.patchHistory = [];
    this.envMeanReturnRate = opts.envMeanReturnRate || 0.35;
    this.totalInfoGain = 0;
    this.currentInfoGain = 0;
    this.currentPatchTime = 0;
  }

  addPatch(patch) {
    this.patches.set(patch.id, patch);
    return patch;
  }

  enterPatch(patchId) {
    if (this.currentPatchId) {
      this.patchHistory.push({
        patchId: this.currentPatchId,
        infoGain: this.currentInfoGain,
        time: this.currentPatchTime,
      });
    }
    this.currentPatchId = patchId;
    this.currentInfoGain = 0;
    this.currentPatchTime = 0;
  }

  /**
   * Evaluate whether to depart the current patch (Marginal Value Theorem).
   */
  shouldDepart() {
    if (!this.currentPatchId || this.currentPatchTime === 0) {
      return { shouldDepart: false, reason: 'New patch or no time elapsed' };
    }
    const marginalYield = this.currentInfoGain / this.currentPatchTime;
    return {
      shouldDepart: marginalYield < this.envMeanReturnRate,
      marginalYield,
      envThreshold: this.envMeanReturnRate,
      infoGain: this.currentInfoGain,
      timeSpent: this.currentPatchTime,
    };
  }

  /**
   * Record information gain from the current patch.
   */
  recordReturn(infoGainDelta) {
    this.currentInfoGain += infoGainDelta;
    this.currentPatchTime += 1;
    this.totalInfoGain += infoGainDelta;
    return this.currentInfoGain;
  }

  /**
   * Foraging: find patches relevant to a goal.
   */
  forage(goal, limit = 5) {
    const goalEpitopes = extractEpitopes(goal);
    const scored = [];
    for (const [, patch] of this.patches) {
      const relevance = this.computeRelevance(patch, goalEpitopes);
      scored.push({ patch, relevance });
    }
    scored.sort((a, b) => b.relevance - a.relevance);
    return scored.slice(0, limit).map(s => s.patch);
  }

  computeRelevance(patch, goalEpitopes) {
    let score = 0;
    const patchText = `${patch.statement} ${patch.assumptions.join(' ')}`.toLowerCase();
    const epitopes = goalEpitopes.epitopes || {};

    if (epitopes.isInductive && /induc|recursif/i.test(patchText)) score += 0.3;
    if (epitopes.isEquality && /=/.test(patchText)) score += 0.2;
    if (epitopes.hasQuantifier && /forall|exists|∀|∃/i.test(patchText)) score += 0.2;
    if (epitopes.hasSum && /sum|∑/i.test(patchText)) score += 0.1;
    if (patch.formalAnalogue) score += 0.3;
    return Math.min(1, score + (patch.relevanceScore || 0));
  }

  summary() {
    return {
      patches: this.patches.size,
      history: this.patchHistory.length,
      totalInfoGain: this.totalInfoGain,
      currentPatch: this.currentPatchId,
    };
  }
}

module.exports = { LiteratureForager, PatchResult };
