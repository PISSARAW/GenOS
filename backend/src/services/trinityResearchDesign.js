'use strict';

const crypto = require('node:crypto');
const CHAMBERS = ['direct', 'structured', 'falsification'];

function entropy(probabilities) {
  return -probabilities.reduce((sum, p) => sum + (p > 0 ? p * Math.log2(p) : 0), 0);
}

function validDistribution(values) {
  return Array.isArray(values) && values.length > 0 && values.length <= 64 && values.every(p => Number.isFinite(p) && p >= 0 && p <= 1)
    && Math.abs(values.reduce((sum, p) => sum + p, 0) - 1) < 1e-8;
}

function informationGain(input) {
  const { priors, likelihoods } = input;
  if (!validDistribution(priors || []) || likelihoods?.length !== priors.length) return null;
  if (!likelihoods.every(row => Array.isArray(row) && row.length === likelihoods[0]?.length && validDistribution(row))) return null;
  const outcomes = likelihoods[0].map((_, y) => priors.reduce((sum, p, h) => sum + p * likelihoods[h][y], 0));
  const conditionalEntropy = outcomes.reduce((sum, p, y) => p === 0 ? sum
    : sum + p * entropy(priors.map((prior, h) => prior * likelihoods[h][y] / p)), 0);
  return entropy(priors) - conditionalEntropy;
}

function similarity(left, right) {
  const a = new Set(left), b = new Set(right);
  const union = new Set([...a, ...b]);
  return union.size ? [...a].filter(value => b.has(value)).length / union.size : 1;
}

function utility(triplet, config) {
  const space = new Set(config.solutionSpace || []);
  if (!space.size || triplet.some(candidate => !validResearchCandidate(candidate))) return null;
  const covered = new Set(triplet.flatMap(candidate => candidate.research.coverage).filter(item => space.has(item)));
  const pairs = [[0, 1], [0, 2], [1, 2]];
  const overlap = pairs.reduce((sum, [a, b]) => sum + similarity(triplet[a].assumptions, triplet[b].assumptions), 0) / 3;
  const information = require('./trinityMutualInformation').tripletRedundancy(triplet, config);
  if (config.redundancyPolicy === 'mutual_information' && information === null) return null;
  const redundancy = information ?? overlap;
  return scoreUtility({ triplet, config, covered, space, overlap, information, redundancy });
}

function scoreUtility(input) {
  const { triplet, config, covered, space, overlap, information, redundancy } = input;
  const tokens = triplet.reduce((sum, candidate) => sum + candidate.research.tokens, 0);
  const latency = Math.max(...triplet.map(candidate => candidate.research.latencyMs));
  if (!validResearchBudgets(config)) return null;
  if (tokens > config.tokenBudget || latency > config.latencyBudgetMs) return null;
  const components = { coverage: covered.size / space.size, orthogonality: 1 - overlap,
    falsifiability: Math.min(...triplet.map(candidate => candidate.research.falsificationProbability)),
    redundancy, cost: 0.5 * (tokens / config.tokenBudget + latency / config.latencyBudgetMs) };
  if (components.orthogonality < (config.minOrthogonality || 0)) return null;
  const score = components.coverage + components.orthogonality + components.falsifiability - components.redundancy - components.cost;
  return { score, components, tokens, latencyMs: latency, sourceRefs: triplet.flatMap(candidate => candidate.sourceRefs),
    method: 'declared_model_utility_v1', redundancyMethod: information === null ? 'belief_jaccard' : 'mutual_information_bits', calibrated: false };
}

function validResearchBudgets(config) {
  return [config.tokenBudget, config.latencyBudgetMs].every(value => Number.isFinite(value) && value > 0);
}

function validResearchCandidate(candidate) {
  const model = candidate.research;
  return Array.isArray(model?.coverage) && Number.isFinite(model.tokens) && model.tokens >= 0
    && Number.isFinite(model.latencyMs) && model.latencyMs >= 0
    && Number.isFinite(model.falsificationProbability) && model.falsificationProbability >= 0
    && model.falsificationProbability <= 1 && candidate.sourceRefs?.length > 0;
}

function select(candidates, config) {
  const pools = CHAMBERS.map(chamber => candidates.filter(candidate => !candidate.chamber || candidate.chamber === chamber));
  let best = null;
  for (const a of pools[0]) {
    for (const b of pools[1]) {
      for (const c of pools[2]) best = consider([a, b, c], config, best);
    }
  }
  return best;
}

function consider(triplet, config, best) {
  if (new Set(triplet.map(candidate => candidate.id)).size !== 3) return best;
  const score = utility(triplet, config);
  if (!score) return best;
  const key = triplet.map(candidate => candidate.id).join('|');
  if (best && (score.score < best.utility.score || (score.score === best.utility.score && key >= best.key))) return best;
  return { triplet: triplet.map((candidate, index) => ({ ...candidate, chamber: CHAMBERS[index] })), utility: score, key };
}

function designExperiment(triplet, config) {
  const priors = config.priors || Array(3).fill(1 / 3);
  const proposals = (config.experiments || []).slice(0, 24).map(experiment => scoreExperiment({ experiment, triplet, priors, config })).filter(Boolean);
  proposals.sort((a, b) => b.informationGain - a.informationGain || a.id.localeCompare(b.id));
  return proposals[0] || null;
}

function scoreExperiment(input) {
  const { experiment, triplet, priors, config } = input;
  if (!experiment.id || !experiment.protocol || !experiment.sourceRefs?.length) return null;
  const rows = triplet.map(candidate => experiment.likelihoods?.[candidate.id]);
  const gain = informationGain({ priors, likelihoods: rows });
  if (gain === null || !Number.isFinite(experiment.costTokens) || experiment.costTokens < 0
    || experiment.costTokens > config.tokenBudget) return null;
  const digest = crypto.createHash('sha256').update(JSON.stringify({ experiment, priors, rows })).digest('hex');
  return { ...experiment, informationGain: gain, modelDigest: digest, priors,
    status: 'proposed', method: 'expected_entropy_reduction_v1', calibrated: false };
}

module.exports = { entropy, informationGain, utility, select, designExperiment };
