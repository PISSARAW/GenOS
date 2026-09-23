'use strict';

const { listStrategies, getStrategy } = require('../../strategies/strategyRegistry');
const { selectStrategyPortfolio } = require('../../strategies/strategySelector');

const DEFAULT_PORTFOLIO_SIZE = 5;
const MIN_FIT_THRESHOLD = 0.15;
const RISK_WEIGHTS = { low: 1.0, medium: 1.2, high: 1.5 };

function clamp01(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
}

function normalizeCtx(ctx = {}) {
  return {
    problemProfile: ctx.problemProfile || {},
    epistemicState: ctx.epistemicState || {},
    memoryContext: ctx.memoryContext || {},
    cognitivePhenotype: ctx.cognitivePhenotype || {},
    regulatoryState: ctx.regulatoryState || {},
    capabilities: ctx.capabilities || {},
    availableTools: ctx.availableTools || [],
    topology: ctx.topology || {},
    workers: ctx.workers || [],
    budget: ctx.budget || {},
    previousStrategyHistory: ctx.previousStrategyHistory || [],
    observedFailures: ctx.observedFailures || [],
    morphologyHistory: ctx.morphologyHistory || [],
  };
}

function computeFit(strategy, ctx) {
  const profile = ctx.problemProfile;
  const type = profile.type || 'unknown';
  let fit = 0;
  if (strategy.problemTypes.includes('all') || strategy.problemTypes.includes(type)) {
    fit += 0.5;
  }
  const traits = new Set(strategy.traits);
  if (traits.has('low_cost') && (ctx.budget?.maxCostLevel || 5) <= 2) fit += 0.15;
  if (traits.has('verification') && (ctx.regulatoryState?.requireVerification)) fit += 0.15;
  if (traits.has('information_gain') && (ctx.epistemicState?.highUncertainty)) fit += 0.1;
  if (strategy.maturity === 'implemented') fit += 0.1;
  return clamp01(fit);
}

function computeRisk(strategy, ctx) {
  const profile = ctx.problemProfile;
  const riskWeight = RISK_WEIGHTS[profile.risk] || 1.0;
  let risk = (strategy.riskLevel || 1) * 0.1 * riskWeight;
  if (strategy.maturity === 'prototype') risk += 0.3;
  if (strategy.maturity === 'experimental') risk += 0.15;
  if (ctx.observedFailures?.some((f) => f.strategyId === strategy.id)) risk += 0.25;
  return clamp01(risk, 0.1);
}

function computePriorScore(strategy, ctx) {
  const history = ctx.previousStrategyHistory || [];
  const past = history.filter((h) => h.strategyId === strategy.id);
  if (!past.length) return 0;
  const successRate = past.filter((h) => h.success).length / past.length;
  const avgUtility = past.reduce((s, h) => s + (h.utility || 0), 0) / past.length;
  return (successRate * 0.6 + clamp01(avgUtility) * 0.4) * 0.2;
}

function scoreStrategy(strategy, ctx) {
  const norm = normalizeCtx(ctx);
  const fit = computeFit(strategy, norm);
  const risk = computeRisk(strategy, norm);
  const prior = computePriorScore(strategy, norm);
  const score = clamp01(fit * 0.55 + prior - risk * 0.3 + 0.1);
  return {
    score: Number(score.toFixed(3)),
    fit: Number(fit.toFixed(3)),
    risks: Number(risk.toFixed(3)),
    prior: Number(prior.toFixed(3)),
  };
}

function buildJustification(strategy, scored, ctx) {
  const reasons = [];
  if (scored.fit >= 0.5) reasons.push('problem type alignment');
  if (scored.fit >= 0.3 && scored.fit < 0.5) reasons.push('partial fit');
  if (scored.risks <= 0.3) reasons.push('low risk');
  if (scored.risks > 0.3) reasons.push('elevated risk');
  if (scored.prior > 0.1) reasons.push('positive prior performance');
  if (!reasons.length) reasons.push('fallback candidate');
  return `${strategy.id}: ${reasons.join(', ')}`;
}

function scoreAllStrategies(ctx) {
  return listStrategies().map((strategy) => {
    const scored = scoreStrategy(strategy, ctx);
    return {
      strategy,
      ...scored,
      justification: buildJustification(strategy, scored, ctx),
    };
  });
}

function rankScored(scored) {
  return [...scored].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.strategy.id.localeCompare(b.strategy.id);
  });
}

function applyDiversity(ranked, topN) {
  const selected = [];
  const families = new Set();
  for (const item of ranked) {
    if (selected.length >= topN) break;
    if (selected.length < topN * 0.6) {
      selected.push(item);
      families.add(item.strategy.family);
    } else if (!families.has(item.strategy.family) || selected.length < topN) {
      selected.push(item);
      families.add(item.strategy.family);
    }
  }
  return selected;
}

function resolveStrategy(ctx) {
  const norm = normalizeCtx(ctx);
  const scored = scoreAllStrategies(norm);
  const ranked = rankScored(scored);
  const portfolio = applyDiversity(ranked, DEFAULT_PORTFOLIO_SIZE);
  const primary = portfolio[0];
  return {
    primary: primary ? { strategy: primary.strategy, ...primary } : null,
    portfolio: portfolio.map((item) => ({
      strategy: item.strategy,
      score: item.score,
      fit: item.fit,
      risks: item.risks,
      justification: item.justification,
    })),
    metadata: {
      totalScored: scored.length,
      portfolioSize: portfolio.length,
      problemType: norm.problemProfile.type || 'unknown',
      riskLevel: norm.problemProfile.risk || 'low',
    },
  };
}

function getStrategyPortfolio(ctx) {
  const norm = normalizeCtx(ctx);
  const scored = scoreAllStrategies(norm);
  const ranked = rankScored(scored);
  const topN = norm.problemProfile.portfolioSize || DEFAULT_PORTFOLIO_SIZE;
  return applyDiversity(ranked, topN).map((item) => ({
    strategy: item.strategy,
    score: item.score,
    fit: item.fit,
    risks: item.risks,
    justification: item.justification,
  }));
}

module.exports = { resolveStrategy, scoreStrategy, getStrategyPortfolio, scoreAllStrategies };
