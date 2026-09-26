'use strict';

const crypto = require('crypto');

const DIVERSITY_DIMENSIONS = [
  'provider', 'modelFamily', 'cognitiveRecipe', 'tools', 'lineage', 'errorCorrelation'
];

const MIN_DIVERSITY_THRESHOLD = 0.6;

function providerDistance(a, b) {
  if (a === b) return 0;
  const major = new Set(['openai', 'anthropic', 'google', 'cohere', 'mistral', 'local', 'ollama']);
  const aMajor = major.has(a.toLowerCase()) ? a.toLowerCase() : 'other';
  const bMajor = major.has(b.toLowerCase()) ? b.toLowerCase() : 'other';
  return aMajor === bMajor ? 0.3 : 1.0;
}

function modelFamilyDistance(a, b) {
  if (a === b) return 0;
  const families = {
    'gpt-4': 'gpt4', 'gpt-4o': 'gpt4', 'gpt-4-turbo': 'gpt4',
    'claude-3': 'claude3', 'claude-3-5': 'claude35', 'claude-3-opus': 'claude3',
    'gemini': 'gemini', 'mistral': 'mistral', 'llama': 'llama', 'qwen': 'qwen'
  };
  const aFam = families[a.toLowerCase()] || 'other';
  const bFam = families[b.toLowerCase()] || 'other';
  return aFam === bFam ? 0.2 : 0.8;
}

function cognitiveRecipeDistance(a, b) {
  if (a === b) return 0;
  const recipes = ['direct', 'planned', 'self_correcting', 'adversarial', 'counterfactual', 'novelty_seeking'];
  const aIdx = recipes.indexOf(a);
  const bIdx = recipes.indexOf(b);
  if (aIdx === -1 || bIdx === -1) return 0.5;
  return Math.abs(aIdx - bIdx) / (recipes.length - 1);
}

function toolsDistance(a, b) {
  const setA = new Set(Array.isArray(a) ? a : []);
  const setB = new Set(Array.isArray(b) ? b : []);
  if (setA.size === 0 && setB.size === 0) return 0;
  const union = new Set([...setA, ...setB]);
  const intersection = [...setA].filter(x => setB.has(x)).length;
  return 1 - intersection / union.size;
}

function lineageDistance(a, b) {
  if (!a || !b) return 0.5;
  if (a === b) return 0;
  const aParts = String(a).split('/');
  const bParts = String(b).split('/');
  const common = aParts.filter((v, i) => v === bParts[i]).length;
  return 1 - common / Math.max(aParts.length, bParts.length);
}

function errorCorrelationDistance(historyA, historyB) {
  if (!historyA?.length || !historyB?.length) return 0.5;
  const errorsA = new Set(historyA.flatMap(h => h.errorTypes || []));
  const errorsB = new Set(historyB.flatMap(h => h.errorTypes || []));
  if (errorsA.size === 0 && errorsB.size === 0) return 0;
  const union = new Set([...errorsA, ...errorsB]);
  const intersection = [...errorsA].filter(x => errorsB.has(x)).length;
  return 1 - intersection / union.size;
}

function computeDiversityScore(worldA, worldB, historicalMemory = {}) {
  const weights = { provider: 0.25, modelFamily: 0.20, cognitiveRecipe: 0.20, tools: 0.15, lineage: 0.10, errorCorrelation: 0.10 };
  const dims = {
    provider: providerDistance(worldA.provider, worldB.provider),
    modelFamily: modelFamilyDistance(worldA.modelFamily, worldB.modelFamily),
    cognitiveRecipe: cognitiveRecipeDistance(worldA.cognitiveRecipe, worldB.cognitiveRecipe),
    tools: toolsDistance(worldA.tools, worldB.tools),
    lineage: lineageDistance(worldA.lineage, worldB.lineage),
    errorCorrelation: errorCorrelationDistance(
      historicalMemory[worldA.agentId]?.history,
      historicalMemory[worldB.agentId]?.history
    )
  };
  let score = 0;
  for (const [dim, weight] of Object.entries(weights)) {
    score += dims[dim] * weight;
  }
  return { score: Number(score.toFixed(4)), dimensions: dims };
}

function tripletDiversity(worlds, historicalMemory = {}) {
  const pairs = [[0, 1], [0, 2], [1, 2]];
  const pairScores = pairs.map(([i, j]) => computeDiversityScore(worlds[i], worlds[j], historicalMemory));
  const minScore = Math.min(...pairScores.map(p => p.score));
  const avgScore = pairScores.reduce((s, p) => s + p.score, 0) / pairScores.length;
  return {
    pairScores,
    minPairwiseDiversity: Number(minScore.toFixed(4)),
    avgPairwiseDiversity: Number(avgScore.toFixed(4)),
    passesThreshold: minScore >= MIN_DIVERSITY_THRESHOLD
  };
}

function optimizeTriplet(candidates, historicalMemory = {}, maxIterations = 1000) {
  if (candidates.length < 3) return { triplet: candidates, diversity: null, reason: 'insufficient_candidates' };
  let best = null;
  let bestScore = -1;
  const indices = Array.from({ length: candidates.length }, (_, i) => i);
  for (let iter = 0; iter < maxIterations; iter++) {
    const shuffled = [...indices].sort(() => Math.random() - 0.5);
    const triplet = shuffled.slice(0, 3).map(i => candidates[i]);
    const div = tripletDiversity(triplet, historicalMemory);
    if (div.minPairwiseDiversity > bestScore) {
      bestScore = div.minPairwiseDiversity;
      best = { triplet, diversity: div };
      if (bestScore >= MIN_DIVERSITY_THRESHOLD) break;
    }
  }
  return best || { triplet: candidates.slice(0, 3), diversity: tripletDiversity(candidates.slice(0, 3), historicalMemory), reason: 'no_improvement' };
}

function planDiverseWorlds(input) {
  const { candidates, historicalMemory, requiredDiversity = MIN_DIVERSITY_THRESHOLD, maxAttempts = 1000 } = input;
  const result = optimizeTriplet(candidates, historicalMemory, maxAttempts);
  if (!result.diversity?.passesThreshold) {
    return {
      success: false,
      reason: `Triplet diversity ${result.diversity?.minPairwiseDiversity || 0} below threshold ${requiredDiversity}`,
      triplet: result.triplet,
      diversity: result.diversity,
      recommendation: 'Add more diverse candidates or relax threshold'
    };
  }
  return {
    success: true,
    triplet: result.triplet,
    diversity: result.diversity,
    experimentalDesignId: `diversity-plan-v1-${crypto.randomBytes(8).toString('hex')}`
  };
}

function validateDiversity(worlds, historicalMemory = {}) {
  const div = tripletDiversity(worlds, historicalMemory);
  return {
    valid: div.passesThreshold,
    diversity: div,
    threshold: MIN_DIVERSITY_THRESHOLD,
    warnings: div.passesThreshold ? [] : [`Minimum pairwise diversity ${div.minPairwiseDiversity} below threshold ${MIN_DIVERSITY_THRESHOLD}`]
  };
}

function enforceProviderDiversity(worlds) {
  const list = Array.isArray(worlds) ? worlds : [];
  const providers = list.map((world) => String(world.provider || '').toLowerCase());
  const distinct = new Set(providers.filter(Boolean));
  const valid = distinct.size >= Math.min(3, list.length) && !providers.includes('');
  return {
    valid,
    providers,
    distinctProviders: [...distinct],
    warnings: valid ? [] : ['Each world must declare a different provider']
  };
}

module.exports = {
  planDiverseWorlds,
  validateDiversity,
  enforceProviderDiversity,
  computeDiversityScore,
  tripletDiversity,
  MIN_DIVERSITY_THRESHOLD,
  DIVERSITY_DIMENSIONS
};