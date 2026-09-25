'use strict';

/**
 * Communication module — re-exports all services.
 *
 * Bridges communication decisions (policy engine) to actual agent runtime
 * behavior via drivers: agency, recommendActions, runCycle.
 */

const { decideCommunication, logShadowDecision } = require('./communicationPolicyEngine');
const { learnFromOutcome } = require('./communicationLearningService');
const {
  recordDecision, recordTokens, recordAvoided, recordUsefulAction, recordRedundant,
  recordGroundCheck, recordGroundingFailure, recordContamination, recordIndependenceViolation,
  getMetrics, resetMetrics, getRates, getWakePrecision, getShadowReduction, getOutcomeRates,
  getExtendedMetrics
} = require('./communicationMetricsService');
const { estimateCost, estimateNaiveBroadcast } = require('./communicationCostService');
const { assessAgency, assessAgencyBatch } = require('./agencyDriver');
const { recommendActions, recommendActionsBatch, getAgentRates, queryRecentOutcomes } = require('./recommendActions');
const { runCycle, runCycleBatch, simulateExecution } = require('./runCycleDriver');
const { getExpertise, recordOutcome } = require('./transactiveMemoryService');
const { createEnvelope, validateEnvelope, digestPayload } = require('./communicationEnvelopeService');

module.exports = {
  // Policy engine
  decideCommunication,
  logShadowDecision,

  // Learning service
  learnFromOutcome,

  // Metrics service
  recordDecision,
  recordTokens,
  recordAvoided,
  recordUsefulAction,
  recordRedundant,
  recordGroundCheck,
  recordGroundingFailure,
  recordContamination,
  recordIndependenceViolation,
  getMetrics,
  resetMetrics,
  getRates,
  getWakePrecision,
  getShadowReduction,
  getOutcomeRates,
  getExtendedMetrics,

  // Cost service
  estimateCost,
  estimateNaiveBroadcast,

  // Runtime drivers (P3 audit conscience)
  assessAgency,
  assessAgencyBatch,
  recommendActions,
  recommendActionsBatch,
  getAgentRates,
  queryRecentOutcomes,
  runCycle,
  runCycleBatch,
  simulateExecution,

  // Transactive memory (expertise)
  getExpertise,
  recordOutcome,
  createEnvelope,
  validateEnvelope,
  digestPayload
};
