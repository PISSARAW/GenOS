'use strict';

/**
 * GenotypeResolver — dynamic genome selection for niches.
 * Answers: "What type of organism do I need for this niche?"
 * Decides: reuse, clone, cross, mutate, graft, speciate.
 */

const REUSE_THRESHOLD = 80;
const GRAFT_THRESHOLD = 60;
const MUTATE_THRESHOLD = 40;
const CROSS_THRESHOLD = 30;
const MIN_CLONE_THRESHOLD = 20;

const TRAIT_WEIGHTS = Object.freeze({
  adversarial: 1.2, analytical: 1.0, creative: 1.0, autonomous: 1.1,
  collaborative: 0.9, resilient: 1.1, efficient: 1.0, expressive: 0.9
});

const CONSTRAINT_WEIGHTS = Object.freeze({
  'low latency': 1.3, 'high independence': 1.2, 'low correlation': 1.1,
  'high throughput': 1.1, 'low cost': 1.0, 'high accuracy': 1.2
});

function clamp01(value, fallback) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  return Math.max(0, Math.min(1, resolved));
}

function normalizeList(items) {
  if (!Array.isArray(items)) return [];
  return items.map((t) => String(t).toLowerCase().trim()).filter(Boolean);
}

function normalizeDomain(domain) {
  return String(domain || '').toLowerCase().trim();
}

function getPhenotype(genome) {
  return genome.phenotype || genome;
}

function extractGenomeTraits(genome) {
  const p = getPhenotype(genome);
  const traits = [p.role, p.strategy, ...(p.capabilities || []), ...(p.tools || [])];
  return traits.map((t) => String(t).toLowerCase().trim());
}

function extractGenomeDomain(genome) {
  return normalizeDomain(getPhenotype(genome).role);
}

function extractGenomeConstraints(genome) {
  const p = getPhenotype(genome);
  const constraints = [];
  if (p.temp != null && Number(p.temp) < 0.3) constraints.push('low latency');
  if ((p.capabilities || []).some((c) => /autonomous|independent/i.test(c))) {
    constraints.push('high independence');
  }
  return constraints;
}

function scoreTraitMatch(genomeTraits, requiredTraits) {
  if (requiredTraits.length === 0) return 1;
  const genomeSet = new Set(genomeTraits);
  let score = 0;
  for (const trait of requiredTraits) {
    if (genomeSet.has(trait)) score += TRAIT_WEIGHTS[trait] || 1.0;
  }
  const total = requiredTraits.reduce((s, t) => s + (TRAIT_WEIGHTS[t] || 1.0), 0);
  return score / total;
}

function scoreConstraintMatch(genomeConstraints, requiredConstraints) {
  if (requiredConstraints.length === 0) return 1;
  const genomeSet = new Set(genomeConstraints);
  let score = 0;
  for (const c of requiredConstraints) {
    if (genomeSet.has(c)) score += CONSTRAINT_WEIGHTS[c] || 1.0;
  }
  const total = requiredConstraints.reduce((s, c) => s + (CONSTRAINT_WEIGHTS[c] || 1.0), 0);
  return score / total;
}

function scoreDomainMatch(genomeDomain, requiredDomain) {
  if (!requiredDomain) return 1;
  if (!genomeDomain) return 0;
  if (genomeDomain === requiredDomain) return 1;
  if (genomeDomain.includes(requiredDomain) || requiredDomain.includes(genomeDomain)) return 0.7;
  return 0.2;
}

function scoreGenome(genome, requirements) {
  const reqTraits = normalizeList(requirements.traits);
  const reqConstraints = normalizeList(requirements.constraints);
  const reqDomain = normalizeDomain(requirements.domain);

  const genomeTraits = extractGenomeTraits(genome);
  const genomeDomain = extractGenomeDomain(genome);
  const genomeConstraints = extractGenomeConstraints(genome);

  const traitScore = scoreTraitMatch(genomeTraits, reqTraits);
  const constraintScore = scoreConstraintMatch(genomeConstraints, reqConstraints);
  const domainScore = scoreDomainMatch(genomeDomain, reqDomain);

  const rawScore = (traitScore * 0.4 + constraintScore * 0.35 + domainScore * 0.25) * 100;
  const score = Math.round(clamp01(rawScore / 100, 0) * 100);

  const gaps = [];
  const strengths = [];
  for (const trait of reqTraits) {
    if (!genomeTraits.includes(trait)) gaps.push(`missing trait: ${trait}`);
    else strengths.push(`has trait: ${trait}`);
  }
  for (const c of reqConstraints) {
    if (!genomeConstraints.includes(c)) gaps.push(`missing constraint: ${c}`);
    else strengths.push(`has constraint: ${c}`);
  }
  if (reqDomain && genomeDomain !== reqDomain) gaps.push(`domain mismatch: ${genomeDomain} vs ${reqDomain}`);
  else if (reqDomain) strengths.push(`domain match: ${reqDomain}`);

  return { score, gaps, strengths };
}

function findCompatibleGenomes(requirements, availableGenomes) {
  if (!Array.isArray(availableGenomes) || availableGenomes.length === 0) return [];
  return availableGenomes
    .map((genome) => {
      const scoring = scoreGenome(genome, requirements);
      return { genome, score: scoring.score, gaps: scoring.gaps, strengths: scoring.strengths };
    })
    .sort((a, b) => b.score - a.score);
}

function recommendCross(genomeA, genomeB, requirements) {
  const scoreA = scoreGenome(genomeA, requirements);
  const scoreB = scoreGenome(genomeB, requirements);
  const reqTraits = normalizeList(requirements.traits);

  const traitsA = new Set(extractGenomeTraits(genomeA));
  const traitsB = new Set(extractGenomeTraits(genomeB));
  const uniqueA = [...traitsA].filter((t) => !traitsB.has(t) && reqTraits.includes(t));
  const uniqueB = [...traitsB].filter((t) => !traitsA.has(t) && reqTraits.includes(t));

  const crossScore = Math.round((scoreA.score + scoreB.score) / 2 + (uniqueA.length + uniqueB.length) * 10);
  const shouldCross = crossScore > Math.max(scoreA.score, scoreB.score) + 10;

  return {
    shouldCross,
    crossScore,
    parentA: { id: genomeA.id || genomeA.meta?.name, score: scoreA.score },
    parentB: { id: genomeB.id || genomeB.meta?.name, score: scoreB.score },
    complementaryTraits: [...uniqueA, ...uniqueB],
    sharedTraits: [...traitsA].filter((t) => traitsB.has(t)),
    reasoning: shouldCross ? 'Cross combines complementary traits' : 'Cross would not improve fitness'
  };
}

function makeDecision(action, genomeId, opts) {
  const o = typeof opts === 'object' && opts !== null ? opts : {};
  const conf = typeof opts === 'object' ? o.confidence : opts;
  return {
    action,
    genomeId,
    confidence: clamp01(conf, 0),
    reasoning: o.reasoning || '',
    ...(o.extra || {})
  };
}

function decideByScore(bestMatch, requirements, availableGenomes) {
  const { score, gaps } = bestMatch;
  const genomeId = bestMatch.genome.id || bestMatch.genome.meta?.name;
  const reqTraits = normalizeList(requirements.traits);
  const missingTraits = reqTraits.filter((t) => gaps.some((g) => g.includes(t)));

  if (score >= REUSE_THRESHOLD) {
    return makeDecision('reuse', genomeId, { confidence: score / 100, reasoning: `Score ${score}/100 — sufficient for reuse` });
  }

  if (score >= GRAFT_THRESHOLD && missingTraits.length > 0 && missingTraits.length <= 2) {
    return makeDecision('graft', genomeId, { confidence: score / 100, reasoning: `Score ${score}/100 — graft: ${missingTraits.join(', ')}` });
  }

  if (score >= MUTATE_THRESHOLD) {
    return makeDecision('mutate', genomeId, { confidence: score / 100, reasoning: `Score ${score}/100 — mutate to close gaps` });
  }

  if (score >= CROSS_THRESHOLD && availableGenomes.length >= 2) {
    return tryCross(bestMatch, availableGenomes, requirements);
  }

  if (score >= MIN_CLONE_THRESHOLD) {
    return makeDecision('clone', genomeId, { confidence: score / 100, reasoning: `Score ${score}/100 — clone as starting point` });
  }

  return makeDecision('speciate', null, { confidence: 0.3, reasoning: `Score ${score}/100 — speciate new genome` });
}

function tryCross(bestMatch, availableGenomes, requirements) {
  const bestId = bestMatch.genome.id || bestMatch.genome.meta?.name;
  const second = availableGenomes.find((g) => (g.id || g.meta?.name) !== bestId);
  if (!second) return makeDecision('clone', bestId, { confidence: bestMatch.score / 100, reasoning: 'No second genome for cross' });
  const cross = recommendCross(bestMatch.genome, second, requirements);
  if (!cross.shouldCross) return makeDecision('clone', bestId, { confidence: bestMatch.score / 100, reasoning: 'Cross not beneficial' });
  return makeDecision('cross', bestId, { confidence: cross.crossScore / 100, reasoning: cross.reasoning, extra: { parentId: second.id || second.meta?.name } });
}

function decideAction(bestMatch, requirements, availableGenomes) {
  if (!bestMatch) return makeDecision('speciate', null, { confidence: 0.3, reasoning: 'No compatible genomes — speciate' });
  return decideByScore(bestMatch, requirements, availableGenomes);
}

async function resolveGenotype(ctx) {
  const { requirements, availableGenomes, db } = ctx;
  if (!requirements) return makeDecision('speciate', null, { confidence: 0, reasoning: 'No requirements provided' });

  const genomes = Array.isArray(availableGenomes) ? availableGenomes : [];
  const matches = findCompatibleGenomes(requirements, genomes);
  const decision = decideAction(matches[0] || null, requirements, genomes);

  if (db && decision.genomeId) {
    await enrichFromStore(db, decision, requirements);
  }
  return decision;
}

async function enrichFromStore(db, decision, requirements) {
  try {
    const { workerGenesForAssignment } = require('./agentDnaStore');
    const selection = await workerGenesForAssignment(db, {
      role: requirements.domain || 'worker',
      capabilities: requirements.traits || [],
      mission: requirements.mission || '',
      genomeRef: decision.genomeId
    }, {});
    if (selection) {
      decision.genomeRef = selection.genomeRef;
      decision.genes = selection.genes;
      decision.selectionId = selection.selectionId;
    }
  } catch (_) { /* Best effort */ }
}

module.exports = {
  resolveGenotype,
  scoreGenome,
  findCompatibleGenomes,
  recommendCross,
  decideAction,
  _internals: {
    normalizeList, normalizeDomain, extractGenomeTraits, extractGenomeDomain,
    extractGenomeConstraints, scoreTraitMatch, scoreConstraintMatch, scoreDomainMatch,
    TRAIT_WEIGHTS, CONSTRAINT_WEIGHTS, REUSE_THRESHOLD, GRAFT_THRESHOLD,
    MUTATE_THRESHOLD, CROSS_THRESHOLD
  }
};
