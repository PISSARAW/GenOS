'use strict';

const { loopIsDue } = require('./morphogenesisControlLoopService');

const DEFAULT_INTERVAL_MS = 3600000;

class EvolutionaryControlLoop {
  constructor(opts = {}) {
    this.intervalMs = opts.intervalMs || DEFAULT_INTERVAL_MS;
    this.actions = opts.actions || ['learn_pattern', 'mutate_prior', 'update_transition_policy', 'update_relation_prior'];
    this.lastRunAt = 0;
    this.runCount = 0;
    this.experienceStore = opts.experienceStore;
    this.priorService = opts.priorService;
    this.policyLearner = opts.policyLearner;
    this.learningEnabled = opts.learningEnabled !== false;
    this.history = [];
  }

  shouldRun(now = Date.now()) {
    return this.learningEnabled && loopIsDue('evolutionary', { intervalMs: this.intervalMs, lastRunAt: this.lastRunAt, now });
  }

  async run(context) {
    if (!this.shouldRun()) return { executed: false, reason: this.learningEnabled ? 'not_due' : 'learning_disabled' };

    this.lastRunAt = Date.now();
    this.runCount++;

    const results = [];

    if (this.experienceStore) {
      const learnResult = await this.learnPatterns(context);
      results.push({ action: 'learn_pattern', ...learnResult });
    }

    if (this.priorService) {
      const priorResult = await this.updatePriors(context);
      results.push({ action: 'mutate_prior', ...priorResult });
    }

    if (this.policyLearner) {
      const policyResult = await this.updatePolicies(context);
      results.push({ action: 'update_transition_policy', ...policyResult });
    }

    const relationResult = await this.updateRelationPriors(context);
    results.push({ action: 'update_relation_prior', ...relationResult });

    this.history.push({ runCount: this.runCount, results, timestamp: new Date().toISOString() });
    if (this.history.length > 100) this.history.shift();

    return { executed: true, runCount: this.runCount, results, timestamp: new Date().toISOString() };
  }

  async learnPatterns(context) {
    if (!this.experienceStore) return { learned: 0 };
    try {
      const signatures = this.extractSignatures(context);
      for (const sig of signatures) {
        await this.experienceStore.record(sig);
      }
      return { learned: signatures.length };
    } catch (e) {
      return { learned: 0, error: e.message };
    }
  }

  extractSignatures(context) {
    return context.nodes?.map(node => ({
      missionSignature: context.missionId,
      problemProfile: context.problemProfile,
      topology: node.topology,
      variant: node.variant,
      outcome: context.outcome,
      cost: context.cost,
      duration: context.duration
    })) || [];
  }

  async updatePriors(context) {
    if (!this.priorService) return { updated: 0 };
    try {
      const stats = this.computeOutcomeStats(context);
      for (const [key, stat] of Object.entries(stats)) {
        await this.priorService.update(key, stat);
      }
      return { updated: Object.keys(stats).length };
    } catch (e) {
      return { updated: 0, error: e.message };
    }
  }

  computeOutcomeStats(context) {
    return {};
  }

  async updatePolicies(context) {
    if (!this.policyLearner) return { updated: 0 };
    try {
      return await this.policyLearner.learn(context);
    } catch (e) {
      return { updated: 0, error: e.message };
    }
  }

  async updateRelationPriors(context) {
    return { updated: 0 };
  }

  getStatus() {
    return { loop: 'evolutionary', intervalMs: this.intervalMs, lastRunAt: this.lastRunAt, runCount: this.runCount, learningEnabled: this.learningEnabled, historyLength: this.history.length };
  }

  enableLearning() { this.learningEnabled = true; }
  disableLearning() { this.learningEnabled = false; }
}

module.exports = { EvolutionaryControlLoop };