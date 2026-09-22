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

  onAgent(agentId, listener) {
    this.on(`agent:${agentId}`, listener);
  }
}

// Singleton per process
const bus = new SignalEventBus();

module.exports = bus;
