'use strict';

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

const RELEVANCE_RULES = [
  ['isInductive', /induc|recursif/i, 0.3],
  ['isEquality', /=/, 0.2],
  ['hasQuantifier', /forall|exists|∀|∃/i, 0.2],
  ['hasSum', /sum|∑/i, 0.1],
];

function computeScore(patchText, goalEpitopes) {
  let score = 0;
  for (const [epitope, pattern, weight] of RELEVANCE_RULES) {
    if (goalEpitopes[epitope] && pattern.test(patchText)) {
      score += weight;
    }
  }
  return score;
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

  recordReturn(infoGainDelta) {
    this.currentInfoGain += infoGainDelta;
    this.currentPatchTime += 1;
    this.totalInfoGain += infoGainDelta;
    return this.currentInfoGain;
  }

  forage(goal, limit = 5) {
    const goalEpitopes = extractEpitopes(goal);
    const epitopes = goalEpitopes.epitopes || {};
    const scored = [];
    for (const [, patch] of this.patches) {
      const patchText = `${patch.statement} ${patch.assumptions.join(' ')}`.toLowerCase();
      let score = computeScore(patchText, epitopes);
      if (patch.formalAnalogue) score += 0.3;
      const relevance = Math.min(1, score + (patch.relevanceScore || 0));
      scored.push({ patch, relevance });
    }
    scored.sort((a, b) => b.relevance - a.relevance);
    return scored.slice(0, limit).map(s => s.patch);
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
