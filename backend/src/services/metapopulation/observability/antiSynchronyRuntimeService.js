'use strict';
const antiSynchronyService = require('./antiSynchronyService');

const firebreakRegistry = new Map();
const causalLog = [];

function recordCausalEvent(demeId, eventType, payload) {
  causalLog.push({ demeId, eventType, payload, timestamp: Date.now() });
  if (causalLog.length > 200) causalLog.shift();
}

function firebreakManager(demes, pairs, options) {
  const settings = firebreakSettings(options);
  const actions = [];
  for (const pair of pairs) {
    const action = evaluateFirebreakPair(pair, settings);
    if (action) actions.push(action);
  }
  return { actions, activeFirebreaks: [...firebreakRegistry.values()] };
}

function firebreakSettings(options) {
  return {
    now: Date.now(),
    duration: options?.firebreakDurationMs || 120000,
    recoveryThreshold: options?.firebreakRecoveryThreshold || 0.35,
    threshold: options?.threshold
  };
}

function evaluateFirebreakPair(pair, settings) {
  const key = `${pair.sourceDemeId}->${pair.targetDemeId}`;
  const existing = firebreakRegistry.get(key);
  if (existing) return existingFirebreakDecision({ pair, key, existing, settings });
  return evaluateNewFirebreak(pair, key, settings);
}

function existingFirebreakDecision(context) {
  const { pair, key, existing, settings } = context;
  if (settings.now - existing.frozenAt >= settings.duration) return null;
  if ((pair.risk || 0) < settings.recoveryThreshold && existing.frozenAt) {
    firebreakRegistry.delete(key);
    return { type: 'RECOVER_FIREBREAK', pair, key, reason: 'RISK_BELOW_THRESHOLD' };
  }
  return null;
}

function evaluateNewFirebreak(pair, key, settings) {
  if (pair.risk >= settings.threshold) {
    firebreakRegistry.set(key, { frozenAt: settings.now, source: pair.sourceDemeId, target: pair.targetDemeId });
    return { type: 'ACTIVATE_FIREBREAK', pair, key, duration: settings.duration, reason: 'RISK_ABOVE_THRESHOLD' };
  }
  return null;
}

async function topologyRewireExecutor(context) {
  const { observed, input } = context;
  const plan = await antiSynchronyService.planAntiSynchrony({
    demes: observed.demes,
    observations: input.errorVectors,
    threshold: input.synchronyThreshold || 0.7,
  });
  if (plan.affectedPairs.length === 0) return { rewire: false, reason: 'NO_RISKY_PAIRS' };
  const risks = pairRiskMap(plan.affectedPairs);
  const adjustedCorridors = observed.corridors.map((c) => adjustCorridorRisk(c, risks));
  return { rewire: true, corridors: adjustedCorridors, affectedPairCount: plan.affectedPairs.length };
}

function pairRiskMap(pairs) {
  const risks = new Map();
  for (const pair of pairs) {
    risks.set(`${pair.sourceDemeId}->${pair.targetDemeId}`, pair.risk);
    risks.set(`${pair.targetDemeId}->${pair.sourceDemeId}`, pair.risk);
  }
  return risks;
}

function adjustCorridorRisk(corridor, risks) {
  const risk = risks.get(`${corridor.sourceDemeId}->${corridor.targetDemeId}`);
  if (risk === undefined) return corridor;
  return {
    ...corridor,
    weight: corridor.weight * 0.5,
    homogenizationRisk: Math.max(corridor.homogenizationRisk, risk),
    enabled: corridor.homogenizationRisk >= 0.9 ? false : corridor.enabled,
  };
}

function controlledExtinctionWithCoverage(deme, observedDemes, uniqueCapabilities) {
  const hasUnique = uniqueCapabilities.some((cap) => {
    const owners = observedDemes.filter((d) => d.demeId !== deme.demeId && (d.capabilities || []).includes(cap));
    return owners.length === 0;
  });
  return {
    mayExtinguish: !hasUnique,
    uniqueCapabilities: hasUnique ? uniqueCapabilities : [],
    reason: hasUnique ? 'UNIQUE_CAPABILITY_PROTECTS' : 'NO_UNIQUE_CAPABILITY',
  };
}

module.exports = { recordCausalEvent, firebreakManager, topologyRewireExecutor, controlledExtinctionWithCoverage, causalLog };
