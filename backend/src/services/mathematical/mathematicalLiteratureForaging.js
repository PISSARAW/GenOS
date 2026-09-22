'use strict';

const { extractEpitopes } = require('./goalEpitopeExtractor');
const { createHash } = require('node:crypto');

class PatchResult {
  constructor(opts = {}) {
    this.id = opts.id || `patch-${Date.now()}`;
    this.statement = opts.statement || '';
    this.assumptions = opts.assumptions || []; // Array of { id, statement, type }
    this.validityDomain = opts.validityDomain || { statement: '', constraints: [] };
    this.dependencies = opts.dependencies || [];
    this.knownApplications = opts.knownApplications || [];
    this.formalAnalogue = opts.formalAnalogue || null;
    this.source = opts.source || '';
    this.relevanceScore = opts.relevanceScore || 0;
    this.infoGain = opts.infoGain || 0;
    this.provenance = opts.provenance || { source: 'unknown', digest: '' };
  }

  /**
   * Check if this patch's assumptions are compatible with the current problem context.
   * @param {Object} context - Current problem context with assumptions
   * @returns {Object} Compatibility result { compatible: boolean, conflicts: [], score: number }
   */
  checkAssumptionsCompatibility(context) {
    const conflicts = [];
    let compatibleCount = 0;
    const contextAssumptions = context.assumptions || [];

    // If patch has no assumptions, it's universally applicable
    if (this.assumptions.length === 0) {
      return { compatible: true, conflicts: [], score: 1.0 };
    }

    for (const patchAssumption of this.assumptions) {
      const patchAssumptionText = typeof patchAssumption === 'string' ? patchAssumption : patchAssumption.statement;

      // Check if context satisfies this assumption
      const satisfied = contextAssumptions.some(ctxAssumption => {
        const ctxText = typeof ctxAssumption === 'string' ? ctxAssumption : ctxAssumption.statement;
        // Simple semantic matching - could be enhanced with formal verification
        return this.assumptionsMatch(patchAssumptionText, ctxText);
      });

      if (satisfied) {
        compatibleCount++;
      } else {
        conflicts.push({
          assumption: patchAssumptionText,
          reason: 'Not satisfied in current context',
        });
      }
    }

    const compatibilityScore = this.assumptions.length > 0
      ? compatibleCount / this.assumptions.length
      : 1.0;

    return {
      compatible: conflicts.length === 0,
      conflicts,
      score: compatibilityScore,
      satisfiedCount: compatibleCount,
      totalCount: this.assumptions.length,
    };
  }

  /**
   * Simple assumption matching - can be replaced with formal logic
   */
  assumptionsMatch(patchAssumption, contextAssumption) {
    const patch = patchAssumption.toLowerCase();
    const context = contextAssumption.toLowerCase();

    // Exact match
    if (patch === context) return true;

    // Common mathematical assumptions
    const equivalenceMap = {
      'n > 2': ['n > 2', 'n >= 3', 'n > 2'],
      'n even': ['n even', 'n is even', '2 | n', 'n % 2 = 0'],
      'n odd': ['n odd', 'n is odd', 'n % 2 = 1'],
      'prime': ['prime', 'is prime'],
      'finite': ['finite', 'bounded'],
      'infinite': ['infinite', 'unbounded'],
      'compact': ['compact', 'closed and bounded'],
      'connected': ['connected'],
      'continuous': ['continuous', 'continous'],
      'differentiable': ['differentiable', 'smooth'],
    };

    for (const [key, variants] of Object.entries(equivalenceMap)) {
      if (variants.some(v => patch.includes(v)) && variants.some(v => context.includes(v))) {
        return true;
      }
    }

    // Substring match as fallback
    return patch.includes(context) || context.includes(patch);
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
    this.problemContext = opts.problemContext || { assumptions: [], domain: 'general' };
  }

  setProblemContext(context) {
    this.problemContext = context;
  }

  addPatch(patch) {
    if (!(patch instanceof PatchResult)) {
      patch = new PatchResult(patch);
    }
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

  /**
   * Forage for relevant patches with semantic applicability checking.
   * @param {string|Object} goal - Goal statement or object with statement/assumptions
   * @param {number} limit - Maximum results
   * @returns {Array} Sorted patches with applicability scores
   */
  forage(goal, limit = 5) {
    const goalEpitopes = extractEpitopes(goal);
    const epitopes = goalEpitopes.epitopes || {};

    // Extract assumptions from goal if available
    const goalAssumptions = (typeof goal === 'object' && goal.assumptions) ? goal.assumptions : this.problemContext.assumptions;
    const context = { ...this.problemContext, assumptions: goalAssumptions };

    const scored = [];
    for (const [, patch] of this.patches) {
      // 1. Lexical relevance (existing)
      const patchText = `${patch.statement} ${patch.assumptions.map(a => typeof a === 'string' ? a : a.statement).join(' ')}`.toLowerCase();
      let score = computeScore(patchText, epitopes);
      if (patch.formalAnalogue) score += 0.3;

      // 2. Semantic applicability (NEW) - check assumptions compatibility
      const applicability = patch.checkAssumptionsCompatibility(context);
      const applicabilityScore = applicability.score;

      // 3. Validity domain overlap
      const domainOverlap = this.computeDomainOverlap(patch.validityDomain, context);

      // 4. Combined relevance with semantic weighting
      const relevance = Math.min(1,
        (score + (patch.relevanceScore || 0)) * 0.4 +      // Lexical similarity
        applicabilityScore * 0.4 +                           // Assumptions compatibility
        domainOverlap * 0.2                                  // Validity domain overlap
      );

      scored.push({
        patch,
        relevance,
        applicability,
        domainOverlap,
        breakdown: {
          lexical: score,
          applicability: applicabilityScore,
          domain: domainOverlap,
        },
      });
    }

    scored.sort((a, b) => b.relevance - a.relevance);
    return scored.slice(0, limit).map(s => ({
      ...s.patch,
      _foragingScore: s.relevance,
      _applicability: s.applicability,
      _domainOverlap: s.domainOverlap,
      _breakdown: s.breakdown,
    }));
  }

  /**
   * Compute overlap between patch validity domain and current context.
   */
  computeDomainOverlap(patchDomain, context) {
    if (!patchDomain || !patchDomain.constraints || patchDomain.constraints.length === 0) {
      return 1.0; // No constraints = universal
    }

    const contextConstraints = context.validityDomain?.constraints || context.constraints || [];
    if (contextConstraints.length === 0) {
      return 0.5; // Unknown context
    }

    let matches = 0;
    for (const patchConstraint of patchDomain.constraints) {
      const satisfied = contextConstraints.some(ctxConstraint =>
        patchConstraint.toLowerCase().includes(ctxConstraint.toLowerCase()) ||
        ctxConstraint.toLowerCase().includes(patchConstraint.toLowerCase())
      );
      if (satisfied) matches++;
    }

    return matches / patchDomain.constraints.length;
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
