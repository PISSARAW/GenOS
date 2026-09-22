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
const { startMission } = require('./agentRuntimeAdapter/missionExecution');

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
function startSignalPlaneSubscriber() {
  signalEventBus.onSignal(async (signal) => {
    if (!signal.recipientAgentIds || !signal.recipientAgentIds.length) return;

    for (const recipientId of signal.recipientAgentIds) {
      const handler = registeredWakeHandlers.get(recipientId);
      if (handler) {
        try {
          await handler(signal);
        } catch (err) {
          console.warn(`[SignalPlaneSubscriber] Wake handler failed for ${recipientId}:`, err.message);
        }
      }
    }
  });

  // Also listen for LLM-required signals (no receptor matched)
  signalEventBus.onSignal(async (signal) => {
    if (!signal.llmRequired) return;
    console.log(`[SignalPlaneSubscriber] LLM escalation required for signal ${signal.signalId} (type=${signal.signalType})`);
    // TODO: wire to cognitive escalation service
  });

  console.log('[SignalPlaneSubscriber] Started — listening for routed signals');
}

module.exports = {
  startSignalPlaneSubscriber,
  registerWakeHandler,
  unregisterWakeHandler,
};
