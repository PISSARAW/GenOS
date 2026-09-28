/**
 * Signal Plane Subscriber — production EventBus consumer.
 *
 * Listens for routed signals and dispatches wake-ups to dormant agents.
 * This is the runtime bridge between "signal published" and "agent wakes up".
 *
 * Without this, the EventBus is an orphan emitter — signals are published
 * but no consumer acts on them.
 */

const signalEventBus = require('./signalEventBus');
const { getDatabase } = require('../db');
const { randomUUID } = require('node:crypto');
const plasticity = require('./synapticPlasticityService');
const runtimeMissionExecution = require('./agentRuntimeAdapter/missionExecution');
const escalation = require('./cognitiveEscalationService');
const signalDelivery = require('./signalDeliveryService');
const { decodeSignalRow } = require('./signalEnvelopeCodec');
const signalMetrics = require('./signalMetricsService');

const registeredWakeHandlers = new Map();
const CLAIM_OWNER = `${process.pid}:${randomUUID()}`;
const CLAIM_LEASE_MS = 60_000;
const POLL_INTERVAL_MS = 500;
let pollTimer = null;
let pollInProgress = false;

/**
 * Register a wake handler for a specific agent.
 * The handler is called when a signal is destined for this agent.
 */
function registerWakeHandler(agentId, handler) {
  registeredWakeHandlers.set(agentId, handler);
  pollPendingDeliveries().catch((error) => logPollFailure(error));
}

/**
 * Unregister a wake handler.
 */
function unregisterWakeHandler(agentId) {
  registeredWakeHandlers.delete(agentId);
}

/**
 * Start the production subscriber.
 * Listens on the EventBus and dispatches to registered wake handlers.
 */
function recordWorkerSuccess(signal) {
  signalMetrics.recordSignalWithAction(signal.signalId);
  signalMetrics.recordDeliveryUseful();
  signalMetrics.recordOutcome('state_changed');
}

function recordWorkerIgnored() {
  signalMetrics.recordOutcome('ignored');
}

function handleWorkerResult(signal, result) {
  if (result && result.acted === false) {
    recordWorkerIgnored();
    return;
  }
  recordWorkerSuccess(signal);
}

function handleWorkerSignal(signal) {
  if (!signal.recipientAgentIds || !signal.recipientAgentIds.length) return;
  for (const recipientId of signal.recipientAgentIds) {
    const handler = registeredWakeHandlers.get(recipientId);
    if (!handler) {
      signalMetrics.recordOutcome('ignored');
      continue;
    }
    dispatchPendingDelivery({ signalId: signal.signalId, recipientId, handler })
      .catch((error) => logDeliveryFailure(recipientId, error));
  }
}

async function dispatchPendingDelivery(input) {
  const { signalId, recipientId, handler } = input;
  const db = await getDatabase();
  const claimInput = { signalId, subscriberAgentId: recipientId, owner: `${CLAIM_OWNER}:${randomUUID()}`,
    now: Date.now(), leaseMs: CLAIM_LEASE_MS };
  const claimed = await signalDelivery.claimPendingDelivery(db, claimInput);
  if (!claimed) return false;
  try {
    const row = await loadSignalForDelivery(db, signalId, recipientId);
    if (!row) {
      await releaseClaim({ db, claimInput,
        error: 'Signal expired or was removed before delivery.', terminal: true });
      return false;
    }
    let signal;
    try {
      signal = decodeSignalRow(row);
    } catch (error) {
      await releaseClaim({ db, claimInput, error: error.message, terminal: true });
      return false;
    }
    if (!isVerifiedSignal(signal)) {
      await releaseClaim({ db, claimInput, error: 'Signal envelope is missing or invalid.', terminal: true });
      return false;
    }
    const result = await handler(workerSignalFromRow(signal, recipientId));
    const completed = await signalDelivery.completeClaimedDelivery(db, { ...claimInput, now: Date.now() });
    if (completed) handleWorkerResult(signal, result);
    return completed;
  } catch (error) {
    await releaseClaim({ db, claimInput, error: error.message, terminal: false });
    signalMetrics.recordOutcome('ignored');
    throw error;
  }
}

async function loadSignalForDelivery(db, signalId, recipientId) {
  return db.get(`SELECT s.signal_id, s.signal_type, s.signal_blob, s.content, s.topic,
      s.sender_agent_id, s.created_at
    FROM signal_blobs s JOIN signal_deliveries d ON d.signal_id = s.signal_id
    WHERE s.signal_id = ? AND d.subscriber_agent_id = ? AND d.status = 'pending'
      AND (s.expires_at IS NULL OR s.expires_at > CURRENT_TIMESTAMP)`, [signalId, recipientId]);
}

function isVerifiedSignal(signal) {
  return Boolean(signal?.decoded && signal.integrity?.status === 'verified');
}

function workerSignalFromRow(signal, recipientId) {
  return {
    signalId: signal.signalId,
    signalType: signal.signalType,
    signalData: signal.decoded,
    topic: signal.topic,
    senderAgentId: signal.senderAgentId,
    recipientAgentIds: [recipientId],
    payloadRef: signal.signalId,
    llmRequired: false,
    integrity: signal.integrity,
  };
}

async function releaseClaim(input) {
  const { db, claimInput, error, terminal } = input;
  await signalDelivery.releaseDeliveryClaim(db, {
    ...claimInput, now: Date.now(), error, terminal
  });
}

async function pollPendingDeliveries() {
  if (pollInProgress || registeredWakeHandlers.size === 0) return;
  pollInProgress = true;
  try {
    const db = await getDatabase();
    const rows = await signalDelivery.listPendingSignalDeliveries(
      db, [...registeredWakeHandlers.keys()]
    );
    for (const row of rows) {
      const handler = registeredWakeHandlers.get(row.subscriber_agent_id);
      if (!handler) continue;
      try {
        await dispatchPendingDelivery({ signalId: row.signal_id,
          recipientId: row.subscriber_agent_id, handler });
      } catch (error) {
        logDeliveryFailure(row.subscriber_agent_id, error);
      }
    }
  } catch (error) {
    logPollFailure(error);
  } finally {
    pollInProgress = false;
  }
}

function logPollFailure(error) {
  console.warn(`[SignalPlaneSubscriber] Durable poll failed: ${error.message}`);
}

function logDeliveryFailure(recipientId, error) {
  console.warn(`[SignalPlaneSubscriber] Wake handler failed for ${recipientId}:`, error.message);
}

function handleLlmEscalation(signal) {
  if (!signal.llmRequired) return;
  if (signal.recipientAgentIds && signal.recipientAgentIds.length) return;
  if (!escalation.shouldEscalate(signal)) return;

  escalation.selectCognitiveTarget(signal).then(async (target) => {
    const context = escalation.buildMinimalContext(signal);
    console.log(`[SignalPlaneSubscriber] LLM escalation → ${target} (signal=${signal.signalId}, type=${signal.signalType})`);
    signalMetrics.recordLlmEscalation();

    try {
      await runtimeMissionExecution.startMission({
        agentId: target,
        prompt: '',
        role: 'llm-escalation',
        signalTriggered: true,
        triggerSignalId: signal.signalId,
        triggerSignalType: signal.signalType,
        triggerSignalTopic: signal.topic,
        escalationContext: context,
      });
      signalMetrics.recordLlmWakeupOutcome({ useful: true });
      signalMetrics.recordOutcome('llm_success');
      escalation.recordEscalationOutcome(signal.signalId, 'dispatched', 1);
    } catch (err) {
      signalMetrics.recordLlmWakeupOutcome({ useful: false });
      signalMetrics.recordOutcome('llm_failed');
      console.warn(`[SignalPlaneSubscriber] Escalation startMission failed for ${target}:`, err.message);
      escalation.recordEscalationOutcome(signal.signalId, 'failed', 1);
    }
  }).catch((err) => {
    console.warn(`[SignalPlaneSubscriber] Escalation target selection failed:`, err.message);
    signalMetrics.recordLlmEscalation();
    signalMetrics.recordLlmWakeupOutcome({ useful: false });
    signalMetrics.recordOutcome('llm_failed');
  });
}

function startSignalPlaneSubscriber() {
  if (!signalEventBus.listeners('signal').includes(handleWorkerSignal)) {
    signalEventBus.onSignal(handleWorkerSignal);
  }
  if (!signalEventBus.listeners('signal').includes(handleLlmEscalation)) {
    signalEventBus.onSignal(handleLlmEscalation);
  }
  if (!pollTimer) {
    pollTimer = setInterval(() => pollPendingDeliveries().catch(logPollFailure), POLL_INTERVAL_MS);
    pollTimer.unref?.();
  }
  pollPendingDeliveries().catch(logPollFailure);
  console.log('[SignalPlaneSubscriber] Started — listening for routed signals');
}

function stopSignalPlaneSubscriber() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  signalEventBus.removeListener('signal', handleWorkerSignal);
  signalEventBus.removeListener('signal', handleLlmEscalation);
}

module.exports = {
  startSignalPlaneSubscriber,
  registerWakeHandler,
  unregisterWakeHandler,
  stopSignalPlaneSubscriber,
  pollPendingDeliveries,
};
