'use strict';

const { createMorphogenContext, computeMutationProbabilities, MORPHOGEN_SIGNALS } = require('./developmentalGenerator');

class MorphogenService {
  constructor(opts = {}) {
    this.context = createMorphogenContext(opts.initialSignals);
    this.history = [];
    this.subscribers = new Map();
  }

  updateSignal(signal, value) {
    if (!MORPHOGEN_SIGNALS.includes(signal)) {
      throw new Error(`Unknown morphogen signal: ${signal}`);
    }
    const oldValue = this.context.signals[signal];
    this.context.signals[signal] = Math.max(0, Math.min(1, value));
    this.history.push({ signal, oldValue, newValue: this.context.signals[signal], timestamp: new Date().toISOString() });
    this.notify(signal);
  }

  incrementSignal(signal, delta) {
    const current = this.context.signals[signal] || 0;
    this.updateSignal(signal, current + delta);
  }

  getSignal(signal) {
    return this.context.signals[signal] || 0;
  }

  getAllSignals() {
    return { ...this.context.signals };
  }

  getMutationProbabilities(baseProbs = {}) {
    return computeMutationProbabilities(this.context, baseProbs);
  }

  getDominantSignals(threshold = 0.5) {
    return Object.entries(this.context.signals)
      .filter(([_, v]) => v >= threshold)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => ({ signal: k, value: v }));
  }

  subscribe(signal, callback) {
    if (!this.subscribers.has(signal)) this.subscribers.set(signal, []);
    this.subscribers.get(signal).push(callback);
  }

  unsubscribe(signal, callback) {
    if (!this.subscribers.has(signal)) return;
    const callbacks = this.subscribers.get(signal);
    const idx = callbacks.indexOf(callback);
    if (idx >= 0) callbacks.splice(idx, 1);
  }

  notify(signal) {
    const callbacks = this.subscribers.get(signal) || [];
    const value = this.context.signals[signal];
    for (const cb of callbacks) {
      try { cb(value); } catch (e) { console.error(`Morphogen subscriber error for ${signal}:`, e); }
    }
  }

  getHistory(limit = 100) {
    return this.history.slice(-limit);
  }

  reset() {
    this.context = createMorphogenContext();
    this.history = [];
  }
}

module.exports = { MorphogenService, MORPHOGEN_SIGNALS };