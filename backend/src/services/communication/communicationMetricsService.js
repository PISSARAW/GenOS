'use strict';

const { getDatabase } = require('../../db');
const { getSignalPlaneMetrics } = require('../signalMetricsService');
const { estimateNaiveBroadcast } = require('./communicationCostService');

const ACTION_COUNTERS = Object.freeze({
  SILENCE: 'silence', SELF: 'silence', ENVIRONMENT: 'stigmergy', STIGMERGY: 'stigmergy',
  SIGNAL: 'signal', STRUCTURED: 'structured', DIALECT: 'dialect',
  MICRO_UTTERANCE: 'micro', DIALOGUE: 'dialogue', HUMAN: 'human'
});

const VERBAL_ACTIONS = new Set(['MICRO_UTTERANCE', 'DIALOGUE']);

const counters = {
  attempts: 0, silence: 0, structured: 0, signal: 0, dialect: 0,
  micro: 0, dialogue: 0, human: 0, stigmergy: 0,
  verbalWakeups: 0, verbalUseful: 0,
  tokensInput: 0, tokensOutput: 0, tokensAvoided: 0,
  tokensMeasured: 0, tokensProjected: 0,
  fanoutTransport: 0, fanoutCognitive: 0, variants: 0,
  usefulActions: 0, redundant: 0, groundHits: 0, groundChecks: 0,
  groundingFailures: 0, semanticMismatch: 0, dialectDecodeFailures: 0,
  contaminationEvents: 0, independenceViolations: 0
};

function recordDecision(decision) {
  counters.attempts += 1;
  const key = ACTION_COUNTERS[decision.action];
  if (key) counters[key] += 1;
  const recipients = (decision.recipients || []).length;
  counters.fanoutTransport += recipients;
  counters.fanoutCognitive += recipients;
  if (VERBAL_ACTIONS.has(decision.action)) counters.verbalWakeups += 1;
  counters.variants += ((decision.meta || {}).groups || []).length;
}

function recordTokens(input) {
  counters.tokensInput += Number(input.tokensInput || 0);
  counters.tokensOutput += Number(input.tokensOutput || 0);
  if (input.measured === false) counters.tokensProjected += 1;
  else counters.tokensMeasured += 1;
}

function recordAvoided(tokens) {
  counters.tokensAvoided += Number(tokens || 0);
}

function recordUsefulAction() {
  counters.usefulActions += 1;
}

function recordRedundant() {
  counters.redundant += 1;
}

function recordGroundCheck(hit) {
  counters.groundChecks += 1;
  if (hit) counters.groundHits += 1;
}

function recordGroundingFailure(kind) {
  counters.groundingFailures += 1;
  if (kind === 'semantic_mismatch') counters.semanticMismatch += 1;
  if (kind === 'dialect_decode') counters.dialectDecodeFailures += 1;
}

function recordContamination() {
  counters.contaminationEvents += 1;
}

function recordIndependenceViolation() {
  counters.independenceViolations += 1;
}

function getMetrics() {
  return Object.assign({}, counters);
}

function resetMetrics() {
  for (const key of Object.keys(counters)) {
    counters[key] = 0;
  }
}

function ratioOf(part, whole) {
  if (whole <= 0) return 0;
  return part / whole;
}

function getRates() {
  const decided = counters.attempts - counters.silence;
  const measuredTokens = counters.tokensInput + counters.tokensOutput;
  return {
    recipientPrecision: ratioOf(counters.usefulActions, counters.fanoutCognitive),
    redundancyRatio: ratioOf(counters.redundant, counters.attempts),
    commonGroundHitRate: ratioOf(counters.groundHits, counters.groundChecks),
    groundingFailureRate: ratioOf(counters.groundingFailures, counters.attempts),
    semanticMismatchRate: ratioOf(counters.semanticMismatch, counters.attempts),
    dialectDecodeFailureRate: ratioOf(counters.dialectDecodeFailures, counters.dialect),
    usefulInformationPerToken: measuredTokens > 0 ? counters.usefulActions / measuredTokens : 0,
    cognitiveWakePrecision: ratioOf(counters.verbalUseful, counters.verbalWakeups),
    silenceRate: ratioOf(counters.silence, counters.attempts),
    decidedRate: ratioOf(decided, counters.attempts)
  };
}

function getWakePrecision() {
  const plane = getSignalPlaneMetrics();
  const signal = plane && plane.cwr ? plane.cwr : { cwr: 0, wakeupsWithAction: 0, totalWakeups: 0 };
  return {
    communication: ratioOf(counters.verbalUseful, counters.verbalWakeups),
    signalPlane: signal.cwr || 0,
    signalWakeups: signal.totalWakeups || 0
  };
}

async function getShadowReduction(input) {
  const db = input.db || await getDatabase();
  const rows = await db.all('SELECT current_behavior_json AS behavior, cost FROM communication_shadow_log');
  let totalCost = 0;
  let totalNaive = 0;
  for (const row of rows) {
    totalCost += Number(row.cost || 0);
    totalNaive += naiveOf(row.behavior);
  }
  return {
    decisions: rows.length,
    totalCost, totalNaive,
    reduction: totalNaive > 0 ? 1 - totalCost / totalNaive : 0
  };
}

function naiveOf(behaviorJson) {
  try {
    const behavior = JSON.parse(behaviorJson || '{}');
    const naive = estimateNaiveBroadcast({ recipientCount: behavior.recipientCount || 42 });
    return naive.total;
  } catch (_) {
    return 0;
  }
}

async function getOutcomeRates(input) {
  const db = input.db || await getDatabase();
  const rows = await db.all(
    'SELECT outcome, COUNT(*) AS n FROM communication_outcomes GROUP BY outcome'
  );
  const byOutcome = {};
  let total = 0;
  for (const row of rows) {
    byOutcome[row.outcome] = Number(row.n);
    total += Number(row.n);
  }
  const acted = byOutcome.action_taken || 0;
  const wasted = (byOutcome.no_effect || 0) + (byOutcome.ignored || 0);
  return { total, byOutcome, actionRate: ratioOf(acted, total), wasteRate: ratioOf(wasted, total) };
}

module.exports = {
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
  getOutcomeRates
};
