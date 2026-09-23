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

// Deduplication sets: one signal with N recipients counts once for signal-CER.
const actionSignalIds = new Set();
const orgChangedSignalIds = new Set();

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
  // Delivery-based CER tracking
  deliveriesTotal: 0,
  deliveriesUseful: 0,
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
function recordLlmWakeup() {
  metrics.llmWakeups++;
}

function recordLlmWakeupOutcome({ useful }) {
  if (useful) metrics.llmWakeupsWithAction++;
}

function recordLlmEscalation() {
  metrics.signalsLlmEscalated++;
  recordLlmWakeup();
}

/**
 * Record an LLM wakeup that resulted in a non-trivial action.
 */
function recordLlmWakeupWithAction() {
  metrics.llmWakeups++;
  metrics.llmWakeupsWithAction++;
}

/**
 * Record a signal that produced a receptor-triggered action.
 * Signal-based: one signal with N recipients counts once (CER in [0,1]).
 * Must be called AFTER the handler succeeds, never before.
 */
function recordSignalWithAction(signalId) {
  if (signalId != null) {
    if (actionSignalIds.has(signalId)) return false;
    actionSignalIds.add(signalId);
  }
  metrics.signalsWithAction++;
  return true;
}

/**
 * Record a signal that caused an organization topology change.
 * Same signal-based dedup as recordSignalWithAction.
 */
function recordSignalOrgChanged(signalId) {
  if (signalId != null) {
    if (orgChangedSignalIds.has(signalId)) return false;
    orgChangedSignalIds.add(signalId);
  }
  metrics.signalsOrgChanged++;
  return true;
}

/**
 * Record a delivery enqueued (per-recipient) for delivery-based CER.
 */
function recordDeliveryEnqueued() {
  metrics.deliveriesTotal++;
}

/**
 * Record a delivery that produced an observable action (post-success only).
 */
function recordDeliveryUseful() {
  metrics.deliveriesUseful++;
}

/**
 * Ledger-observable outcome → (impact, cost) proxy.
 * Impact is 1 only when the ledger shows a state transition
 * (delivered→acted, org changed, artifact committed); 0 otherwise.
 * Cost is 1 for LLM cognition, 0 for deterministic dispatch.
 * These are proxies until downstream-gain measurement lands.
 */
function impactForOutcome(outcome) {
  const table = {
    suppressed: { impact: 0, cost: 0 },
    ignored: { impact: 0, cost: 0 },
    seen: { impact: 0, cost: 0 },
    state_changed: { impact: 1, cost: 0 },
    artifact: { impact: 1, cost: 0 },
    org_changed: { impact: 1, cost: 0 },
    llm_success: { impact: 1, cost: 1 },
    llm_failed: { impact: 0, cost: 1 },
  };
  return table[outcome] || { impact: 0, cost: 0 };
}

/**
 * Record an observable outcome (suppressed/ignored/state_changed/...).
 */
function recordOutcome(outcome) {
  const mapped = impactForOutcome(outcome);
  recordImpact(mapped.impact, mapped.cost);
}

/**
 * Accumulate impact and cost for a signal.
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
  actionSignalIds.clear();
  orgChangedSignalIds.clear();
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
 * Compute CER (Communication Efficiency Ratio), signal-based.
 *   CER_s = signals with >=1 action / routed signals, clamped to [0,1].
 * Delivery-based CER_d = useful deliveries / total deliveries.
 */
function getCERMetrics() {
  const routed = metrics.signalsRouted;
  const useful = metrics.signalsWithAction + metrics.signalsOrgChanged;
  const raw = routed > 0 ? useful / routed : 0;
  const cer = Math.min(1, Math.max(0, raw));
  const dTotal = metrics.deliveriesTotal;
  const dUseful = metrics.deliveriesUseful;
  const cerDelivery = dTotal > 0 ? Math.min(1, dUseful / dTotal) : 0;
  return {
    cer,
    usefulSignals: useful,
    routedSignals: routed,
    signalsWithAction: metrics.signalsWithAction,
    signalsOrgChanged: metrics.signalsOrgChanged,
    cerDelivery,
    deliveryUseful: dUseful,
    deliveryTotal: dTotal,
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
  recordLlmWakeup,
  recordLlmWakeupOutcome,
  recordLlmWakeupWithAction,
  recordSignalWithAction,
  recordSignalOrgChanged,
  recordDeliveryEnqueued,
  recordDeliveryUseful,
  impactForOutcome,
  recordOutcome,
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
