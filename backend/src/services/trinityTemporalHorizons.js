'use strict';

const crypto = require('crypto');

const HORIZONS = {
  short: { label: 'immediate', range: [0, 30], discountRate: 0.0, description: 'Immediate effects (t=0..30 days)' },
  medium: { label: 'integration', range: [30, 180], discountRate: 0.05, description: 'Near-term integration & maintenance (t=30..180 days)' },
  long: { label: 'strategic', range: [180, 1095], discountRate: 0.15, description: 'Long-term maintenance, reversibility, options (t=180..1095 days)' }
};

function temporalValueFunction(effects, horizon, discountRate) {
  let value = 0;
  for (const effect of effects) {
    const time = effect.time || 0;
    const magnitude = effect.magnitude || 0;
    const probability = effect.probability || 1;
    const discounted = magnitude * probability * Math.exp(-discountRate * time);
    value += discounted;
  }
  return value;
}

function decomposeEffects(report, horizon) {
  return [...claimEffects(report, horizon), ...riskEffects(report, horizon)];
}

function claimEffects(report, horizon) {
  const claims = Array.isArray(report.claims) ? report.claims : [];
  const effects = [];
  for (const claim of claims) {
    const effect = claimEffect({ claim, horizon });
    if (effect) effects.push(effect);
  }
  return effects;
}

function claimEffect(input) {
  const { claim, horizon } = input;
  const evidence = Array.isArray(claim.evidence) ? claim.evidence : [];
  const timeHorizon = inferTimeHorizon(claim, evidence);
  if (timeHorizon !== horizon.label && horizon.label !== 'strategic') return null;
  return {
    claimId: claim.id,
    statement: claim.statement,
    time: effectTime(timeHorizon),
    magnitude: estimateMagnitude(claim),
    probability: estimateProbability(claim),
    type: claim.type || 'functional'
  };
}

function effectTime(timeHorizon) {
  if (timeHorizon === 'immediate') return 7;
  if (timeHorizon === 'integration') return 90;
  return 365;
}

function riskEffects(report, horizon) {
  const uncertainties = Array.isArray(report.uncertainties) ? report.uncertainties : [];
  return uncertainties.map((unc) => ({
    claimId: null,
    statement: `Risk: ${unc}`,
    time: riskTime(horizon.label),
    magnitude: -0.3,
    probability: 0.3,
    type: 'risk'
  }));
}

function riskTime(label) {
  if (label === 'immediate') return 14;
  if (label === 'integration') return 60;
  return 180;
}

function inferTimeHorizon(claim, evidence) {
  const text = (claim.statement + ' ' + evidence.join(' ')).toLowerCase();
  if (/\b(immediate|now|deploy|release|hotfix|urgent)\b/.test(text)) return 'immediate';
  if (/\b(integration|refactor|migrate|scale|maintain|tech.debt)\b/.test(text)) return 'integration';
  if (/\b(architecture|platform|strategic|long.term|reversib|option|future)\b/.test(text)) return 'strategic';
  return 'immediate';
}

function estimateMagnitude(claim) {
  const v = claim.verificationLevel;
  if (v === 'independent_deterministic') return 0.8;
  if (v === 'verified') return 0.6;
  if (v === 'unverified') return 0.3;
  return 0.5;
}

function estimateProbability(claim) {
  const evCount = Array.isArray(claim.evidence) ? claim.evidence.length : 0;
  return Math.min(1, 0.3 + evCount * 0.15);
}

function computeReversibility(effects) {
  const irreversible = effects.filter(e => e.type === 'architectural' || e.statement.includes('irreversible')).length;
  return 1 - Math.min(1, irreversible / Math.max(1, effects.length));
}

function computeTechnicalDebt(effects) {
  const debtIndicators = effects.filter(e => e.type === 'risk' || e.magnitude < 0).length;
  return Math.min(1, debtIndicators / Math.max(1, effects.length));
}

function computeOptionValue(effects) {
  const extensible = effects.filter(e => e.type === 'extension' || e.statement.includes('extensib')).length;
  return Math.min(1, extensible / Math.max(1, effects.length));
}

function analyzeTemporalWorld(worldReport, horizonKey, config = {}) {
  const horizon = HORIZONS[horizonKey];
  const effects = decomposeEffects(worldReport, horizon);
  const value = temporalValueFunction(effects, horizon, horizon.discountRate);
  const reversibility = computeReversibility(effects);
  const techDebt = computeTechnicalDebt(effects);
  const optionValue = computeOptionValue(effects);
  const deferredEffects = effects.filter(e => e.time > horizon.range[0]).length;
  return {
    horizon: horizonKey,
    horizonLabel: horizon.label,
    temporalValue: Number(value.toFixed(4)),
    effectsCount: effects.length,
    deferredEffects,
    reversibility: Number(reversibility.toFixed(3)),
    technicalDebt: Number(techDebt.toFixed(3)),
    optionValue: Number(optionValue.toFixed(3)),
    discountRate: horizon.discountRate,
    effects: effects.slice(0, 10)
  };
}

function compareTemporalWorlds(worldReports, config = {}) {
  const horizonKeys = config.horizons || ['short', 'medium', 'long'];
  const analyses = {};
  for (const horizonKey of horizonKeys) {
    analyses[horizonKey] = worldReports.map((report, i) => ({
      worldNumber: i + 1,
      ...analyzeTemporalWorld(report, horizonKey, config)
    }));
  }
  const crossHorizon = horizonKeys.map(hk => {
    const worlds = analyses[hk];
    const best = worlds.reduce((a, b) => a.temporalValue > b.temporalValue ? a : b);
    return { horizon: hk, bestWorld: best.worldNumber, bestValue: best.temporalValue, spread: Math.max(...worlds.map(w => w.temporalValue)) - Math.min(...worlds.map(w => w.temporalValue)) };
  });
  return {
    experimentalDesignId: `temporal-v1-${crypto.randomBytes(8).toString('hex')}`,
    horizons: horizonKeys,
    analyses,
    crossHorizonComparison: crossHorizon,
    synthesis: {
      consistentWinner: crossHorizon.every(c => c.bestWorld === crossHorizon[0].bestWorld) ? crossHorizon[0].bestWorld : null,
      horizonSensitivity: crossHorizon.map(c => c.spread).reduce((a, b) => a + b, 0) / crossHorizon.length
    }
  };
}

function temporalParetoFrontier(analyses) {
  const dims = ['temporalValue', 'reversibility', 'optionValue'];
  const candidates = analyses.flatMap(a => a);
  const frontier = candidates.filter(c => !candidates.some(o => {
    if (o === c) return false;
    return dims.every(d => o[d] >= c[d]) && dims.some(d => o[d] > c[d]);
  }));
  return frontier;
}

module.exports = { HORIZONS, analyzeTemporalWorld, compareTemporalWorlds, temporalParetoFrontier, temporalValueFunction, decomposeEffects };