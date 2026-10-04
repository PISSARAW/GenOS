'use strict';

const { detectDysbiosis } = require('../health/dysbiosisDetector');
const { planRecruitment, selectCompetitivePartner } = require('./variantRuntimeService');
const { createHash } = require('crypto');

function invalid(message, code = 'HOLOBIONT_VARIANT_RUNTIME_INVALID') {
  return Object.assign(new Error(message), { code });
}

function evidence(value, field = 'evidenceRefs') {
  const refs = Array.isArray(value) ? [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))] : [];
  if (!refs.length) throw invalid(`${field} must contain evidence references.`, 'HOLOBIONT_EVIDENCE_REQUIRED');
  return refs;
}

function record(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid(`${field} must be an object.`);
  return value;
}

function symbiontFitnessTrend(history, cycles = 3) {
  const recent = (history || []).slice(-cycles);
  if (recent.length < 2) return { trend: 'insufficient_data', delta: null, samples: recent.length };
  const first = recent[0].fitness;
  const last = recent[recent.length - 1].fitness;
  const delta = last - first;
  let trend = 'stable';
  if (delta > 0.05) trend = 'improving';
  else if (delta < -0.05) trend = 'declining';
  return { trend, delta, samples: recent.length, latest: last, earliest: first };
}

function assessIndividualTrends(fitnessBySymbiont) {
  const trends = {};
  for (const [symbiontId, history] of Object.entries(fitnessBySymbiont || {})) {
    trends[symbiontId] = symbiontFitnessTrend(history);
  }
  const declining = Object.entries(trends)
    .filter(([, t]) => t.trend === 'declining')
    .map(([id]) => id);
  const improving = Object.entries(trends)
    .filter(([, t]) => t.trend === 'improving')
    .map(([id]) => id);
  return { trends, declining, improving, totalTracked: Object.keys(trends).length };
}

function computeDiversity(fitnessBySymbiont, cycle) {
  const symbionts = Object.entries(fitnessBySymbiont || {});
  if (symbionts.length === 0) return 0;
  return symbionts.filter(([, history]) =>
    history.some((point) => point.cycle === cycle)
  ).length;
}

function determineAction(dysbiosis, diversityConfig, recruitmentInput) {
  const { diversity, diversityFloor } = diversityConfig;
  if (dysbiosis) return { action: 'QUARANTINE_AND_REVIEW', recruitmentPlan: null };
  if (diversity < diversityFloor) {
    return {
      action: 'ACQUIRE_CANDIDATE',
      recruitmentPlan: planRecruitment({
        requiredCapabilities: recruitmentInput.requiredCapabilities || [],
        availableCapabilities: recruitmentInput.availableCapabilities || [],
        minimumPermissions: recruitmentInput.minimumPermissions
      })
    };
  }
  return { action: 'CONTINUE', recruitmentPlan: null };
}

function runCompetition(individual, input, policy) {
  if (individual.declining.length === 0 || !input.candidates || input.candidates.length < 2) {
    return { competitionResult: null, replacementProposals: [] };
  }
  const competitionPolicy = policy.competition || {};
  const competitionResult = selectCompetitivePartner({
    candidates: input.candidates,
    budget: input.budget,
    superiorityMargin: competitionPolicy.superiorityMargin,
    protectedGroups: input.protectedGroups,
    allowGroupChangeVerified: competitionPolicy.allowGroupChangeVerified,
    approveReplacement: () => false,
    verifyTrial: input.verifyTrial
  });
  const replacementProposals = [];
  if (competitionResult.champion) {
    replacementProposals.push({
      targetSymbiontId: individual.declining[0],
      candidateId: competitionResult.champion.id,
      reason: 'fitness_decline_with_viable_champion',
      requiresApproval: true,
      evidenceRefs: competitionResult.champion.evidenceRefs
    });
  }
  return { competitionResult, replacementProposals };
}

function buildFitnessSnapshot(residentSymbionts, fitnessBySymbiont) {
  const snapshot = {};
  for (const symbiont of residentSymbionts) {
    const history = fitnessBySymbiont[symbiont.id] || [];
    const latest = history.length ? history[history.length - 1].fitness : null;
    if (latest !== null) snapshot[symbiont.id] = latest;
  }
  return snapshot;
}

function runEcologicalCycle(input = {}) {
  const ecoState = record(input.ecologicalState, 'ecologicalState');
  const policy = record(input.policy || {}, 'policy');
  const residentSymbionts = Array.isArray(input.residentSymbionts) ? input.residentSymbionts : [];
  const cycle = Number(ecoState.cycle || 0) + 1;
  const diversityFloor = Number(policy.diversityFloor ?? 2);
  const dysbiosisSignals = input.dysbiosisSignals || {};

  const fitnessBySymbiont = ecoState.fitnessBySymbiont || {};
  const individual = assessIndividualTrends(fitnessBySymbiont);
  const diversity = computeDiversity(fitnessBySymbiont, cycle - 1);
  const dysbiosisResult = detectDysbiosis(dysbiosisSignals);
  const dysbiosis = dysbiosisResult.state === 'ALERT';

  const { action, recruitmentPlan } = determineAction(dysbiosis, { diversity, diversityFloor }, {
    requiredCapabilities: input.requiredCapabilities,
    availableCapabilities: residentSymbionts.map((s) => s.capabilities || []).flat(),
    minimumPermissions: input.minimumPermissions
  });

  const { competitionResult, replacementProposals } = runCompetition(individual, input, policy);

  const fitnessSnapshot = buildFitnessSnapshot(residentSymbionts, fitnessBySymbiont);

  return {
    cycle,
    individualTrends: individual,
    diversity,
    diversityFloor,
    dysbiosis: dysbiosisResult,
    action,
    recruitmentPlan,
    competitionResult,
    replacementProposals,
    fitnessSnapshot,
    automaticReplacement: false,
    evidenceRefs: evidence(input.evidenceRefs || [])
  };
}

module.exports = { runEcologicalCycle, assessIndividualTrends, computeDiversity, determineAction, runCompetition, buildFitnessSnapshot };