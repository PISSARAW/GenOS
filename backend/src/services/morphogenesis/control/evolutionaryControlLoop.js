'use strict';

const { loopIsDue } = require('./morphogenesisControlLoopService');
const { createMorphologyOutcome } = require('../learning/morphologyOutcomeService');
const { MorphologyExperienceStore } = require('../learning/morphologyExperienceStore');

const DEFAULT_INTERVAL_MS = 3600000;
const DEFAULT_MIN_VERIFIED_OUTCOMES = 10;
const DEFAULT_MIN_COMPARABLE_WORKLOADS = 3;

class EvolutionaryControlLoop {
  constructor(opts = {}) {
    this.intervalMs = opts.intervalMs || DEFAULT_INTERVAL_MS;
    this.actions = opts.actions || ['learn_pattern', 'update_transition_policy'];
    this.lastRunAt = 0;
    this.runCount = 0;
    this.experienceStore = opts.experienceStore || new MorphologyExperienceStore();
    this.policyLearner = opts.policyLearner || require('../learning/topologyPolicyService');
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

    if (this.policyLearner) {
      const policyResult = await this.updatePolicies(gatedContext);
      results.push({ action: 'update_transition_policy', ...policyResult });
    }

    this.history.push({ runCount: this.runCount, results, timestamp: new Date().toISOString() });
    if (this.history.length > 100) this.history.shift();

    return { executed: true, runCount: this.runCount, results, timestamp: new Date().toISOString() };
  }

  validOutcomes(context = {}) {
    return (Array.isArray(context.verifiedOutcomes) ? context.verifiedOutcomes : [])
      .map(toMorphologyOutcome).filter(Boolean);
  }

  hasSufficientEvidence(context) {
    const outcomes = this.validOutcomes(context);
    const workloads = new Set(outcomes.map((item) => item.problemSignature));
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
        await recordExperience(this.experienceStore, sig);
      }
      return { learned: signatures.length };
    } catch (e) {
      return { learned: 0, error: e.message };
    }
  }

  extractSignatures(context) {
    return context.verifiedOutcomes.map(experienceFromOutcome);
  }

  async updatePolicies(context) {
    if (!this.policyLearner) return { updated: 0 };
    try {
      let updated = 0;
      for (const outcome of context.verifiedOutcomes) {
        const evidence = outcome.sourceEvidence;
        const accepted = this.policyLearner.recordVerifiedOutcome({
          topology: outcome.initialMorphology.topology,
          profile: evidence.learningContext.problemProfile || context.problemProfile || {},
          cost: Number(outcome.cost.total) || 0,
          latency: outcome.latency,
          outcomeEvidence: evidence,
        });
        if (accepted) updated++;
      }
      return { updated };
    } catch (e) {
      return { updated: 0, error: e.message };
    }
  }

  getStatus() {
    return { loop: 'evolutionary', intervalMs: this.intervalMs, lastRunAt: this.lastRunAt, runCount: this.runCount, learningEnabled: this.learningEnabled, minimumVerifiedOutcomes: this.minimumVerifiedOutcomes, minimumComparableWorkloads: this.minimumComparableWorkloads, historyLength: this.history.length };
  }

  enableLearning() { this.learningEnabled = true; }
  disableLearning() { this.learningEnabled = false; }
}

async function recordExperience(store, experience) {
  if (typeof store.add === 'function') return store.add(experience);
  if (typeof store.record === 'function') return store.record(experience);
  throw new TypeError('Morphology experience store must expose add or record.');
}

function toMorphologyOutcome(evidence) {
  try { return createMorphologyOutcome(evidence); } catch (_) { return null; }
}

function experienceFromOutcome(outcome) {
  return {
    missionSignature: outcome.problemSignature,
    problemProfile: outcome.sourceEvidence.learningContext.problemProfile || {},
    modelProvider: outcome.model,
    harness: outcome.harness,
    environment: outcome.environment,
    verificationStrength: outcome.verificationStrength,
    availableCapabilities: outcome.sourceEvidence.learningContext.availableCapabilities || [],
    initialMorphology: outcome.initialMorphology,
    morphologyHistory: outcome.morphologyTransitions,
    variants: outcome.sourceEvidence.learningContext.variants || {},
    budget: outcome.budget,
    transitions: outcome.morphologyTransitions,
    costs: outcome.cost,
    latency: outcome.latency,
    tokens: outcome.tokens,
    failures: outcome.failures.length,
    quality: outcome.outcome.score,
    evidenceQuality: outcome.outcome.score,
    finalOutcome: outcome.outcome.status.toLowerCase(),
  };
}

module.exports = { EvolutionaryControlLoop };
