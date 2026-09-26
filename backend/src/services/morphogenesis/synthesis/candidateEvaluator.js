'use strict';

const { generateMorphologyCandidates } = require('./morphologyCandidateGenerator');
const { selectMinimumMorphology } = require('./minimalMorphologyPolicy');
const { compileMorphologyExpression } = require('../graph/compileFlatTopology');
const { MorphologyRuntime } = require('../runtime/morphologyRuntime');

class CandidateEvaluator {
  constructor(opts = {}) {
    this.runtime = opts.runtime || new MorphologyRuntime();
    this.weights = opts.weights || { cost: 0.3, quality: 0.4, evidence: 0.3 };
    this.minimumMorphologyPolicy = opts.minimumMorphologyPolicy;
  }

  async evaluate(candidates, context) {
    const evaluated = [];

    for (const candidate of candidates) {
      const score = await this.scoreCandidate(candidate, context);
      evaluated.push({ ...candidate, score, breakdown: score.breakdown });
    }

    evaluated.sort((a, b) => b.score.total - a.score.total);
    return evaluated;
  }

  async scoreCandidate(candidate, context) {
    const morphology = candidate.morphology;
    if (!morphology) return { total: 0, breakdown: {} };

    let costScore = 0, qualityScore = 0, evidenceScore = 0;

    if (this.runtime) {
      try {
        const graph = compileMorphologyExpression(morphology, { missionId: context.missionId, graphId: context.graphId });
        const result = await this.runtime.execute(graph, context.input);

        costScore = this.scoreCost(result, context);
        qualityScore = this.scoreQuality(result, candidate, context);
        evidenceScore = this.scoreEvidence(result, candidate, context);
      } catch (e) {
        costScore = 0.1;
        qualityScore = 0.1;
        evidenceScore = 0;
      }
    }

    const weights = this.weights;
    const total = costScore * weights.cost + qualityScore * weights.quality + evidenceScore * weights.evidence;

    return {
      total,
      breakdown: { cost: costScore, quality: qualityScore, evidence: evidenceScore },
      weights
    };
  }

  scoreCost(result, context) {
    if (!context.budget) return 0.5;
    const used = result?.budgetUsed?.tokens || 0;
    const available = context.budget?.tokens || 10000;
    if (used === 0) return 0.5;
    return Math.max(0, 1 - used / available);
  }

  scoreQuality(result, candidate, context) {
    if (!result) return 0.1;
    let score = 0.5;
    if (result.verifiedClaims) score += Math.min(0.3, result.verifiedClaims.length * 0.1);
    if (result.confidence) score += result.confidence * 0.2;
    if (candidate.evidence) score += 0.1;
    return Math.min(1, score);
  }

  scoreEvidence(result, candidate, context) {
    if (!result?.evidence?.length) return 0.2;
    const strength = result.evidence.reduce((sum, e) => sum + (e.strength || 0.5), 0) / result.evidence.length;
    return strength;
  }

  applyMinimumMorphologyPolicy(candidates, demand) {
    return selectMinimumMorphology(candidates, demand);
  }
}

class CandidatePruner {
  constructor(opts = {}) {
    this.maxCandidates = opts.maxCandidates || 10;
    this.minScore = opts.minScore || 0.1;
    this.diversityThreshold = opts.diversityThreshold || 0.7;
  }

  prune(candidates) {
    let filtered = candidates.filter(c => c.score?.total >= this.minScore);

    filtered = this.removeDominated(filtered);
    filtered = this.enforceDiversity(filtered);
    filtered = filtered.slice(0, this.maxCandidates);

    return filtered;
  }

  removeDominated(candidates) {
    const nonDominated = [];
    for (const c1 of candidates) {
      let dominated = false;
      for (const c2 of candidates) {
        if (c1 === c2) continue;
        if (this.dominates(c2, c1)) { dominated = true; break; }
      }
      if (!dominated) nonDominated.push(c1);
    }
    return nonDominated;
  }

  dominates(a, b) {
    return a.score.cost >= b.score.cost &&
           a.score.quality >= b.score.quality &&
           a.score.evidence >= b.score.evidence &&
           (a.score.cost > b.score.cost || a.score.quality > b.score.quality || a.score.evidence > b.score.evidence);
  }

  enforceDiversity(candidates) {
    if (candidates.length <= 1) return candidates;
    const diverse = [candidates[0]];
    for (let i = 1; i < candidates.length; i++) {
      const candidate = candidates[i];
      let similar = false;
      for (const existing of diverse) {
        if (this.similarity(candidate, existing) > this.diversityThreshold) {
          similar = true;
          break;
        }
      }
      if (!similar) diverse.push(candidate);
    }
    return diverse;
  }

  similarity(a, b) {
    if (!a.morphology || !b.morphology) return 0;
    const aStr = JSON.stringify(a.morphology);
    const bStr = JSON.stringify(b.morphology);
    const len = Math.max(aStr.length, bStr.length);
    if (len === 0) return 1;
    let matches = 0;
    for (let i = 0; i < len; i++) {
      if (aStr[i] === bStr[i]) matches++;
    }
    return matches / len;
  }
}

module.exports = { CandidateEvaluator, CandidatePruner };