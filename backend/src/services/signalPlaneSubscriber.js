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
const plasticity = require('./synapticPlasticityService');
const runtimeMissionExecution = require('./agentRuntimeAdapter/missionExecution');
const escalation = require('./cognitiveEscalationService');
const { markSignalDelivered } = require('./signalDeliveryHelpers');
const signalMetrics = require('./signalMetricsService');

const registeredWakeHandlers = new Map();

/**
 * Register a wake handler for a specific agent.
 * The handler is called when a signal is destined for this agent.
 */
function registerWakeHandler(agentId, handler) {
  registeredWakeHandlers.set(agentId, handler);
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
    markSignalDelivered(signal.signalId, recipientId).catch(() => {});
    handler(signal).then(
      (result) => handleWorkerResult(signal, result),
      (err) => {
        signalMetrics.recordOutcome('ignored');
        console.warn(`[SignalPlaneSubscriber] Wake handler failed for ${recipientId}:`, err.message);
      }
    );
  }
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
  signalEventBus.onSignal(handleWorkerSignal);
  signalEventBus.onSignal(handleLlmEscalation);
  console.log('[SignalPlaneSubscriber] Started — listening for routed signals');
}

module.exports = {
  startSignalPlaneSubscriber,
  registerWakeHandler,
  unregisterWakeHandler,
};
