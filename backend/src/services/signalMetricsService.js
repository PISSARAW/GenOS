/**
 * Signal Health & Metrics — observability for the signaling pipeline
 *
 * Extended with VoI, CWR, and CER metrics for the Signal Plane.
 *
 *   VoI (Value of Information) = P(Δdecision) × Impact − Cost
 *   CER (Communication Efficiency Ratio) = useful_signals / routed_signals
 *   CWR (Cognitive Wake Ratio) = wakeups_with_action / total_LLM_wakeups
 */

const { getDatabase } = require('../db');

const metrics = {
  signalsPublished: 0,
  signalsCoalesced: 0,
  signalsSuppressed: 0,
  receptorsDispatched: 0,
  receptorsTriggered: 0,
  // VoI / CER tracking
  signalsRouted: 0,
  signalsLlmEscalated: 0,
  signalsWithAction: 0,
  signalsOrgChanged: 0,
  // CWR tracking
  llmWakeups: 0,
  llmWakeupsWithAction: 0,
  // Impact accumulation (for VoI avg)
  totalImpact: 0,
  totalCost: 0,
  // DB errors
  dbErrors: 0,
  dbRetries: 0,
  // Timestamps
  lastSignalAt: null,
  lastErrorAt: null,
  lastErrorMessage: null,
};

function recordPublish() {
  metrics.signalsPublished++;
  metrics.lastSignalAt = new Date().toISOString();
}

function recordCoalesced() {
  metrics.signalsCoalesced++;
}

function recordSuppressed() {
  metrics.signalsSuppressed++;
}

function recordDispatch() {
  metrics.receptorsDispatched++;
}

function recordTrigger() {
  metrics.receptorsTriggered++;
}

/**
 * Record a routed signal (passed coalescing/repression gates).
 */
function recordSignalRouted() {
  metrics.signalsRouted++;
}

/**
 * Record LLM escalation (cognitive wakeup).
 */
function recordLlmEscalation() {
  metrics.signalsLlmEscalated++;
}

/**
 * Record an LLM wakeup that resulted in a non-trivial action.
 */
function recordLlmWakeupWithAction() {
  metrics.llmWakeups++;
  metrics.llmWakeupsWithAction++;
}

/**
 * Record a signal that produced a receptor-triggered action (deterministic dispatch).
 */
function recordSignalWithAction() {
  metrics.signalsWithAction++;
}

/**
 * Record a signal that caused an organization topology change.
 */
function recordSignalOrgChanged() {
  metrics.signalsOrgChanged++;
}

/**
 * Accumulate impact and cost for a signal.
 *   impact: 1.0 dispatched, 0.5 seen, 0 suppressed
 *   cost: 1 LLM escalation, 0 deterministic
 */
function recordImpact(impact, cost) {
  const safeImpact = impact == null ? 0 : Number(impact);
  const safeCost = cost == null ? 0 : Number(cost);
  metrics.totalImpact += safeImpact;
  metrics.totalCost += safeCost;
}

function recordDbError(error) {
  metrics.dbErrors++;
  metrics.lastErrorAt = new Date().toISOString();
  metrics.lastErrorMessage = error.message;
}

function recordDbRetry() {
  metrics.dbRetries++;
}

function getMetrics() {
  return { ...metrics };
}

function resetMetrics() {
  for (const key of Object.keys(metrics)) {
    if (typeof metrics[key] === 'number') metrics[key] = 0;
    else metrics[key] = null;
  }
}

/**
 * Compute VoI (Value of Information).
 *   VoI = P(Δdecision) × avgImpact − avgCost
 *   P(Δdecision) = signalsWithAction / signalsPublished
 *   avgImpact = totalImpact / signalsPublished
 *   avgCost = totalCost / signalsPublished
 */
function getVoIMetrics() {
  const total = metrics.signalsPublished;
  const pDelta = total > 0 ? metrics.signalsWithAction / total : 0;
  const avgImpact = total > 0 ? metrics.totalImpact / total : 0;
  const avgCost = total > 0 ? metrics.totalCost / total : 0;
  const voi = pDelta * avgImpact - avgCost;
  return {
    voi,
    pDeltaDecision: pDelta,
    avgImpact,
    avgCost,
    totalSignals: total,
    signalsWithAction: metrics.signalsWithAction,
    totalImpact: metrics.totalImpact,
    totalCost: metrics.totalCost,
  };
}

/**
 * Compute CER (Communication Efficiency Ratio).
 *   CER = usefulSignals / routedSignals
 *   usefulSignals = signalsWithAction + signalsOrgChanged
 *   Range [0, 1], higher is better.
 */
function getCERMetrics() {
  const routed = metrics.signalsRouted;
  const useful = metrics.signalsWithAction + metrics.signalsOrgChanged;
  const cer = routed > 0 ? useful / routed : 0;
  return {
    cer,
    usefulSignals: useful,
    routedSignals: routed,
    signalsWithAction: metrics.signalsWithAction,
    signalsOrgChanged: metrics.signalsOrgChanged,
  };
}

/**
 * Compute CWR (Cognitive Wake Ratio).
 *   CWR = llmWakeupsWithAction / llmWakeups
 *   Range [0, 1], higher is better (fewer wasted LLM calls).
 */
function getCWRMetrics() {
  const total = metrics.llmWakeups;
  const withAction = metrics.llmWakeupsWithAction;
  const cwr = total > 0 ? withAction / total : 0;
  return {
    cwr,
    wakeupsWithAction: withAction,
    totalWakeups: total,
  };
}

/**
 * Combined Signal Plane metrics snapshot.
 */
function getSignalPlaneMetrics() {
  return {
    voi: getVoIMetrics(),
    cer: getCERMetrics(),
    cwr: getCWRMetrics(),
    raw: getMetrics(),
  };
}

async function checkHealth() {
  try {
    const db = await getDatabase();
    const row = await db.get('SELECT COUNT(*) as count FROM signal_blobs');
    return {
      healthy: true,
      signalCount: row.count,
      metrics: getMetrics(),
    };
  } catch (e) {
    return {
      healthy: false,
      error: e.message,
      metrics: getMetrics(),
    };
  }
}

module.exports = {
  recordPublish,
  recordCoalesced,
  recordSuppressed,
  recordDispatch,
  recordTrigger,
  recordSignalRouted,
  recordLlmEscalation,
  recordLlmWakeupWithAction,
  recordSignalWithAction,
  recordSignalOrgChanged,
  recordImpact,
  recordDbError,
  recordDbRetry,
  getMetrics,
  resetMetrics,
  getVoIMetrics,
  getCERMetrics,
  getCWRMetrics,
  getSignalPlaneMetrics,
  checkHealth,
  metrics,
};
