'use strict';

class TopologyController {
  constructor(node, runtime) {
    this.node = node;
    this.runtime = runtime;
    this.state = 'initialized';
    this.metrics = {};
    this.adaptationHistory = [];
  }

  async compose(config = {}) {
    throw new Error('compose() must be implemented by subclass');
  }

  async start(input = {}) {
    this.state = 'running';
    this.startedAt = new Date().toISOString();
    return this.execute(input);
  }

  async execute(input) {
    throw new Error('execute() must be implemented by subclass');
  }

  async observe() {
    return {
      nodeId: this.node.nodeId,
      topology: this.node.topology,
      variant: this.node.variant,
      state: this.state,
      metrics: this.metrics,
      health: this.node.health
    };
  }

  async step(input) {
    return this.execute(input);
  }

  async evaluate() {
    return { score: 1.0, metrics: this.metrics };
  }

  async proposeAdaptation() {
    return null;
  }

  async exportState() {
    return {
      nodeId: this.node.nodeId,
      state: this.node.state || {},
      metrics: this.metrics,
      adaptationHistory: this.adaptationHistory
    };
  }

  async importState(state) {
    if (state.state) this.node.state = { ...this.node.state, ...state.state };
    if (state.metrics) this.metrics = { ...this.metrics, ...state.metrics };
    if (state.adaptationHistory) this.adaptationHistory = [...state.adaptationHistory];
  }

  async quiesce() {
    this.state = 'quiesced';
    this.quiescedAt = new Date().toISOString();
  }

  async resume() {
    if (this.state === 'quiesced') {
      this.state = 'running';
      this.resumedAt = new Date().toISOString();
    }
  }

  async terminate() {
    this.state = 'terminated';
    this.terminatedAt = new Date().toISOString();
  }

  recordAdaptation(adaptation) {
    this.adaptationHistory.push({ ...adaptation, timestamp: new Date().toISOString() });
  }

  updateMetrics(metrics) {
    this.metrics = { ...this.metrics, ...metrics };
  }
}

module.exports = { TopologyController };