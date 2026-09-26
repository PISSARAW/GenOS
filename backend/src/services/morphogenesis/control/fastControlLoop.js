'use strict';

const { loopIsDue } = require('./morphogenesisControlLoopService');

const DEFAULT_INTERVAL_MS = 1000;

class FastControlLoop {
  constructor(opts = {}) {
    this.intervalMs = opts.intervalMs || DEFAULT_INTERVAL_MS;
    this.actions = opts.actions || ['worker_rebind', 'budget_shift', 'communication_adjustment', 'spawn_verifier', 'pause_branch'];
    this.lastRunAt = 0;
    this.runCount = 0;
    this.handlers = new Map();
  }

  registerHandler(action, handler) {
    this.handlers.set(action, handler);
  }

  shouldRun(now = Date.now()) {
    return loopIsDue('fast', { intervalMs: this.intervalMs, lastRunAt: this.lastRunAt, now });
  }

  async run(context) {
    if (!this.shouldRun()) return { executed: false, reason: 'not_due' };

    this.lastRunAt = Date.now();
    this.runCount++;

    const results = [];
    for (const action of this.actions) {
      const handler = this.handlers.get(action);
      if (handler) {
        try {
          const result = await handler(context);
          results.push({ action, success: true, result });
        } catch (error) {
          results.push({ action, success: false, error: error.message });
        }
      }
    }

    return { executed: true, runCount: this.runCount, results, timestamp: new Date().toISOString() };
  }

  async executeAction(action, context) {
    const handler = this.handlers.get(action);
    if (!handler) throw new Error(`No handler for fast action: ${action}`);
    return handler(context);
  }

  setInterval(ms) { this.intervalMs = ms; }
  getStatus() { return { loop: 'fast', intervalMs: this.intervalMs, lastRunAt: this.lastRunAt, runCount: this.runCount, actions: this.actions }; }
}

module.exports = { FastControlLoop };