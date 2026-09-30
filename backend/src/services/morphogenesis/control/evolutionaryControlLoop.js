'use strict';

const { loopIsDue } = require('./morphogenesisControlLoopService');
const { validate: validateOutcomeEvidence } = require('../learning/outcomeEvidenceValidation');

const DEFAULT_INTERVAL_MS = 3600000;
const DEFAULT_MIN_VERIFIED_OUTCOMES = 10;
const DEFAULT_MIN_COMPARABLE_WORKLOADS = 3;

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
    this.minimumVerifiedOutcomes = opts.minimumVerifiedOutcomes || DEFAULT_MIN_VERIFIED_OUTCOMES;
    this.minimumComparableWorkloads = opts.minimumComparableWorkloads || DEFAULT_MIN_COMPARABLE_WORKLOADS;
    this.history = [];
  }

  shouldRun(now = Date.now(), context = {}) {
    return this.learningEnabled && this.hasSufficientEvidence(context)
      && loopIsDue('evolutionary', { intervalMs: this.intervalMs, lastRunAt: this.lastRunAt, now });
  }

  async run(context) {
    if (!this.shouldRun(Date.now(), context)) {
      return { executed: false, reason: this.disabledReason(context) };
    }

    this.lastRunAt = Date.now();
    this.runCount++;

    const gatedContext = { ...context, verifiedOutcomes: this.validOutcomes(context) };
    const results = [];

    if (this.experienceStore) {
      const learnResult = await this.learnPatterns(gatedContext);
      results.push({ action: 'learn_pattern', ...learnResult });
    }

    if (this.priorService) {
      const priorResult = await this.updatePriors(gatedContext);
      results.push({ action: 'mutate_prior', ...priorResult });
    }

    if (this.policyLearner) {
      const policyResult = await this.updatePolicies(gatedContext);
      results.push({ action: 'update_transition_policy', ...policyResult });
    }

    const relationResult = await this.updateRelationPriors(gatedContext);
    results.push({ action: 'update_relation_prior', ...relationResult });

    this.history.push({ runCount: this.runCount, results, timestamp: new Date().toISOString() });
    if (this.history.length > 100) this.history.shift();

    return { executed: true, runCount: this.runCount, results, timestamp: new Date().toISOString() };
  }

  validOutcomes(context = {}) {
    return (Array.isArray(context.verifiedOutcomes) ? context.verifiedOutcomes : [])
      .filter(validateOutcomeEvidence);
  }

  hasSufficientEvidence(context) {
    const outcomes = this.validOutcomes(context);
    const workloads = new Set(outcomes.map((item) => item.problemSignature).filter(Boolean));
    return outcomes.length >= this.minimumVerifiedOutcomes
      && workloads.size >= this.minimumComparableWorkloads;
  }

  disabledReason(context) {
    if (!this.learningEnabled) return 'learning_disabled';
    if (!this.hasSufficientEvidence(context)) return 'verified_evidence_insufficient';
    return 'not_due';
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
