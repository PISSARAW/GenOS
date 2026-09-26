'use strict';

const { MorphologyPriorService } = require('./morphologyPriorService');
const { computeContextSimilarity, blendPriors } = require('./morphologyPriorService');

function createOutcomeModel(opts = {}) {
  return {
    outcome: { success: 0, failure: 0, partial: 0 },
    cost: { sum: 0, count: 0 },
    latency: { sum: 0, count: 0 },
    quality: { sum: 0, count: 0 },
    evidenceQuality: { sum: 0, count: 0 },
    updatedAt: new Date().toISOString()
  };
}

function updateOutcomeModel(model, experience) {
  if (experience.finalOutcome === 'success') model.outcome.success++;
  else if (experience.finalOutcome === 'failure') model.outcome.failure++;
  else model.outcome.partial++;

  if (experience.tokens) { model.cost.sum += experience.tokens; model.cost.count++; }
  if (experience.latency) { model.latency.sum += experience.latency; model.latency.count++; }
  if (experience.quality) { model.quality.sum += experience.quality; model.quality.count++; }
  if (experience.evidenceQuality) { model.evidenceQuality.sum += experience.evidenceQuality; model.evidenceQuality.count++; }
  model.updatedAt = new Date().toISOString();
  return model;
}

function computeModelStats(model) {
  const total = model.outcome.success + model.outcome.failure + model.outcome.partial;
  return {
    outcome: {
      successRate: total ? model.outcome.success / total : 0,
      failureRate: total ? model.outcome.failure / total : 0,
      partialRate: total ? model.outcome.partial / total : 0,
      total
    },
    cost: model.cost.count ? { mean: model.cost.sum / model.cost.count, count: model.cost.count } : null,
    latency: model.latency.count ? { mean: model.latency.sum / model.latency.count, count: model.latency.count } : null,
    quality: model.quality.count ? { mean: model.quality.sum / model.quality.count, count: model.quality.count } : null,
    evidenceQuality: model.evidenceQuality.count ? { mean: model.evidenceQuality.sum / model.evidenceQuality.count, count: model.evidenceQuality.count } : null
  };
}

class OutcomeModel {
  constructor(opts = {}) {
    this.priorService = new MorphologyPriorService(opts.prior);
    this.models = new Map();
    this.globalModel = createOutcomeModel();
    this.minSamples = opts.minSamples || 10;
  }

  learnFromExperience(experience) {
    const context = this._extractContext(experience);
    const key = this._contextToKey(context);

    let model = this.models.get(key);
    if (!model) { model = createOutcomeModel(); this.models.set(key, model); }

    updateOutcomeModel(model, experience);
    updateOutcomeModel(this.globalModel, experience);

    const outcome = experience.finalOutcome === 'success' ? 1 : experience.finalOutcome === 'failure' ? 0 : 0.5;
    this.priorService.update(key, outcome, 'outcome');
    this.priorService.update(key, experience.tokens || 0, 'cost');
    this.priorService.update(key, experience.latency || 0, 'latency');

    return this.predict(context);
  }

  predict(context) {
    const key = this._contextToKey(context);
    const model = this.models.get(key);

    const prior = this.priorService.getContextualPrior(context, 'outcome', this._fallbackKeys(context));
    const costPrior = this.priorService.getContextualPrior(context, 'cost', this._fallbackKeys(context));

    if (!model) {
      const globalStats = computeModelStats(this.globalModel);
      return { ...globalStats, outcome: { ...globalStats.outcome, predicted: prior.mean }, cost: { ...globalStats.cost, predicted: costPrior.mean }, confidence: 'global' };
    }

    const stats = computeModelStats(model);
    const confidence = model.outcome.success + model.outcome.failure + model.outcome.partial >= this.minSamples ? 'high' : 'low';

    return {
      ...stats,
      outcome: { ...stats.outcome, predicted: prior.mean },
      cost: { ...stats.cost, predicted: costPrior.mean },
      confidence,
      sampleCount: stats.outcome.total
    };
  }

  predictTransition(fromTopology, toTopology, context) {
    const key = `${fromTopology}->${toTopology}`;
    const prior = this.priorService.getContextualPrior({ ...context, transition: key }, 'transition');
    return { fromTopology, toTopology, predictedBenefit: prior.mean, confidence: prior.count >= 5 ? 'high' : 'low', sampleCount: prior.count };
  }

  getModelStats(key) {
    const model = this.models.get(key);
    return model ? computeModelStats(model) : null;
  }

  getAllModels() {
    return Array.from(this.models.entries()).map(([k, v]) => ({ key: k, ...computeModelStats(v) }));
  }

  _extractContext(experience) {
    return {
      topology: experience.initialMorphology?.topology,
      variant: experience.initialMorphology?.variant,
      problemType: experience.problemProfile?.type,
      complexity: experience.problemProfile?.complexity,
      modelProvider: experience.modelProvider
    };
  }

  _contextToKey(context) {
    if (!context) return 'default';
    const parts = [];
    if (context.topology) parts.push(`topology:${context.topology}`);
    if (context.variant) parts.push(`variant:${context.variant}`);
    if (context.problemType) parts.push(`problem:${context.problemType}`);
    if (context.complexity) parts.push(`complexity:${context.complexity}`);
    return parts.join('|') || 'default';
  }

  _fallbackKeys(context) {
    if (!context) return [];
    const keys = [];
    if (context.topology) keys.push(`topology:${context.topology}`);
    if (context.variant) keys.push(`topology:${context.topology}|variant:${context.variant}`);
    return keys;
  }
}

module.exports = { createOutcomeModel, updateOutcomeModel, computeModelStats, OutcomeModel };