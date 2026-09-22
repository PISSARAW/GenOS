/**
 * Signal Event Bus — local in-process event emitter for signal notifications.
 *
 * Replaces the "LLM polls inbox" model with a push model:
 *   publishSignal() → emit event → subscribers wake up.
 *
 * For multi-process deployments, this would be backed by SQLite triggers
 * + a polling loop, or a message queue (P3).
 */

const { EventEmitter } = require('events');

class SignalEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
  }

  publish(signal) {
    this.emit('signal', signal);
    this.emit(`signal:${signal.signalType}`, signal);
    if (signal.topic) {
      this.emit(`topic:${signal.topic}`, signal);
    }
    if (signal.senderAgentId) {
      this.emit(`agent:${signal.senderAgentId}`, signal);
    }
    // Emit to recipient-specific channels for destination-based wake-up
    if (signal.recipientAgentIds) {
      for (const recipientId of signal.recipientAgentIds) {
        this.emit(`recipient:${recipientId}`, signal);
      }
    }
  }

  onSignal(listener) {
    this.on('signal', listener);
  }

  onSignalType(type, listener) {
    this.on(`signal:${type}`, listener);
  }

  onTopic(topic, listener) {
    this.on(`topic:${topic}`, listener);
  }

  /**
   * Subscribe to signals sent BY a given agent (source-based).
   */
  onAgent(agentId, listener) {
    this.on(`agent:${agentId}`, listener);
  }

  /**
   * Subscribe to signals destined TO a given agent (recipient-based).
   * This is the primary wake-up path: a worker listens for signals
   * where it is the intended destination.
   */
  onRecipient(agentId, listener) {
    this.on(`recipient:${agentId}`, listener);
  }
}

// Singleton per process
const bus = new SignalEventBus();

module.exports = bus;
