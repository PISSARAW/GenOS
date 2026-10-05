'use strict';

/**
 * CLASSIFICATION: reference_only
 * Cette suite de benchmarks fonctionnels teste des modèles théoriques de conscience
 * (CTM, MBH, etc.) via des challengers rivaux. Elle ne MESURE PAS la conscience.
 * Résultat: promotionAllowed=false, status='nursery_review_required'.
 */

const challengeRunner = require('./rivalChallengeRunner');
const ctmCampaign = require('./ctmExternalCampaignService');
const matcher = require('./rivalControlMatcher');
const REQUIRED_CHALLENGES = Object.freeze(['araya', 'ctm', 'mbh', 'lipson', 'gmw', 'jspace']);

function validateSuite(registry) {
  if (!registry || typeof registry.get !== 'function') throw new TypeError('Unified suite registry required.');
  const challenges = REQUIRED_CHALLENGES.map((name) => registry.get(name));
  if (challenges.some((item) => !item)) throw new TypeError('Unified suite requires all six rival challenges.');
  const reference = challenges[0];
  const referenceControls = controls(reference);
  for (const challenge of challenges.slice(1)) {
    if (matcher.digest(controls(challenge)) !== matcher.digest(referenceControls)
      || matcher.digest(challenge.seeds) !== matcher.digest(reference.seeds)) {
      throw new TypeError('Unified suite model, tools, budget and seeds must match.');
    }
  }
  return { challenges, locks: referenceControls, seeds: reference.seeds };
}

async function run(options) {
  const suite = validateSuite(options.registry);
  const results = [];
  for (const challenge of suite.challenges) {
    const input = { ...options, challenge: challenge.challenge };
    results.push(challenge.challenge === 'ctm' ? await ctmCampaign.run(input) : await challengeRunner.run(input));
  }
  return { suiteId: 'unified_consciousness_functional_suite_v1', challenges: REQUIRED_CHALLENGES,
    seeds: suite.seeds, locks: suite.locks, results, promotionAllowed: false,
    status: 'nursery_review_required' };
}

function controls(challenge) {
  return { modelLock: challenge.modelLock, toolLock: challenge.toolLock, budget: challenge.budget };
}

module.exports = { REQUIRED_CHALLENGES, validateSuite, run, controls };
