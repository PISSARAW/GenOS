'use strict';

const { createExperience, validateExperience, MorphologyExperienceStore, EXPERIENCE_FIELDS } = require('./morphologyExperienceStore');
const { createPrior, updatePrior, shrinkPrior, computeContextSimilarity, blendPriors, computeConfidenceInterval, MorphologyPriorService, DEFAULT_PRIOR, SHRINKAGE_FACTOR } = require('./morphologyPriorService');
const { createOutcomeModel, updateOutcomeModel, computeModelStats, OutcomeModel } = require('./outcomeModel');
const { PolicyLearner, ucbScore, thompsonSample, epsilonGreedy, EXPLORATION_RATE, MIN_SAMPLES_FOR_BANDIT } = require('./policyLearner');
const { learnTransitionPrior } = require('./transitionPolicyLearner');
const { marginalContribution, selectAblation } = require('./counterfactualCreditService');
const { CREDIT_LEVELS, assignHierarchicalCredit } = require('./hierarchicalCreditService');

module.exports = {
  morphologyExperienceStore: { createExperience, validateExperience, MorphologyExperienceStore, EXPERIENCE_FIELDS },
  morphologyPriorService: { createPrior, updatePrior, shrinkPrior, computeContextSimilarity, blendPriors, computeConfidenceInterval, MorphologyPriorService, DEFAULT_PRIOR, SHRINKAGE_FACTOR },
  outcomeModel: { createOutcomeModel, updateOutcomeModel, computeModelStats, OutcomeModel },
  policyLearner: { PolicyLearner, ucbScore, thompsonSample, epsilonGreedy, EXPLORATION_RATE, MIN_SAMPLES_FOR_BANDIT },
  transitionPolicyLearner: { learnTransitionPrior },
  counterfactualCreditService: { marginalContribution, selectAblation },
  hierarchicalCreditService: { CREDIT_LEVELS, assignHierarchicalCredit }
};