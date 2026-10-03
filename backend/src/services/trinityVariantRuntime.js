'use strict';

const oracle = require('./trinityOracle');
const novelty = require('./trinityNoveltyArchive');
const evidenceAudit = require('./trinityEvidenceAudit');
const trinityService = require('./trinityService');
const counterfactual = require('./trinityCounterfactualFork');
const factorial = require('./trinityFactorialGrid');

const FACTOR_LEVELS = Object.freeze({
  approach: ['direct', 'planned'], modelTier: ['standard', 'frontier'], validation: ['basic', 'deep']
});

function run(input) {
  const design = input.selection?.experimentalDesign || {};
  const executions = {};
  if (design.worldTopology === 'oracular_prediction' || design.hypothesisPolicy === 'oracle_prediction') {
    executions.oracle = runOracle(input.reports);
  }
  if (design.worldTopology === 'exploratory_novelty' || design.hypothesisPolicy === 'novelty_seeking'
    || design.replicationPolicy === 'quality_diversity_replicas') {
    executions.qualityDiversity = runQualityDiversity(input.reports);
  }
  if (design.hypothesisPolicy === 'counterfactual_dimensions') {
    executions.counterfactual = runCounterfactual(input.reports);
  }
  if (design.worldTopology === 'factorial_grid') executions.factorial = runFactorial(input.reports);
  return { status: Object.values(executions).every((entry) => entry.status === 'executed') ? 'executed' : 'incomplete', executions };
}

function runFactorial(reports) {
  const grid = factorial.generateFactorialGrid({ factors: FACTOR_LEVELS, replications: 2, randomize: false });
  const byCell = new Map((reports || []).map((world) => [world.report?.factorialCell?.cellId, world.report]));
  const results = [];
  for (const cell of grid.cells) {
    const report = byCell.get(cell.cellId);
    if (!report || !sameFactors(report.factorialCell?.factors, cell.factors)
      || verifiedEvidenceIds(report).size === 0) {
      return { status: 'incomplete', expectedCells: grid.totalCells,
        observedCells: byCell.size, missingCell: cell.cellId };
    }
    results.push({ ...cell, score: trinityService.scoreWorldEvidence(report).totalScore });
  }
  return { status: 'executed', designId: grid.experimentalDesignId,
    factors: grid.factors, factorLevels: grid.factorLevels, replications: grid.replications,
    totalCells: grid.totalCells, anova: factorial.anovaAnalysis(results, FACTOR_LEVELS),
    hierarchical: factorial.hierarchicalModel(results, FACTOR_LEVELS),
    variance: factorial.varianceCorrection(results, grid), decisionAuthority: 'none' };
}

function sameFactors(actual, expected) {
  return Boolean(actual) && Object.keys(expected).every((key) => actual[key] === expected[key]);
}

function runCounterfactual(reports) {
  const conditions = Object.fromEntries((reports || []).map((world) => [
    world.report?.counterfactual?.condition, world.report
  ]));
  const baseline = conditions.baseline;
  const favorable = conditions.favorable;
  const adverse = conditions.adverse;
  const interventions = { favorable: favorable?.counterfactual?.intervention,
    adverse: adverse?.counterfactual?.intervention };
  if (!baseline || !favorable || !adverse || !matchingInterventions(interventions)) {
    return { status: 'incomplete', reason: 'baseline_and_two_matching_interventions_required' };
  }
  if (![baseline, favorable, adverse].every(validCounterfactualEvidence)) {
    return { status: 'incomplete', reason: 'counterfactual_vector_evidence_missing' };
  }
  return { status: 'executed', ...counterfactual.analyzeCounterfactualResults({
    baselineReport: baseline, favorableReport: favorable, adverseReport: adverse, interventions
  }), causalAttribution: 'observed_intervention_deltas_only', decisionAuthority: 'none' };
}

function matchingInterventions(interventions) {
  const favorable = interventions.favorable;
  const adverse = interventions.adverse;
  return favorable?.type === 'favorable' && adverse?.type === 'adverse'
    && favorable.dimension && favorable.dimension === adverse.dimension
    && favorable.description && adverse.description;
}

function validCounterfactualEvidence(report) {
  const ids = verifiedEvidenceIds(report);
  const vector = report.evidenceVector || {};
  const refs = report.evidenceVectorEvidence || {};
  return Object.keys(vector).length > 0 && Object.keys(vector).every((key) =>
    Number.isFinite(vector[key]) && Array.isArray(refs[key]) && refs[key].length > 0
      && refs[key].every((id) => ids.has(String(id))));
}

function runOracle(reports) {
  const candidates = (reports || []).map((world) => ({ id: `world_${world.worldNumber}` }));
  const predictionReport = (reports || []).find((world) => validDistribution(world.report?.oraclePrediction, candidates));
  if (!predictionReport) return { status: 'incomplete', reason: 'verified_distribution_missing' };
  const prediction = predictionReport.report.oraclePrediction;
  const outcomes = Object.fromEntries((reports || []).map((world) => [
    `world_${world.worldNumber}`, trinityService.scoreWorldEvidence(world.report || {}).totalScore
  ]));
  try {
    return { status: 'executed', predictedByWorld: predictionReport.worldNumber,
      ...oracle.scorePrediction({ prediction, outcomes }), prediction, outcomes,
      advisoryOnly: true, decisionAuthority: 'none' };
  } catch (_) {
    return { status: 'incomplete', reason: 'prediction_outcomes_not_aligned' };
  }
}

function validDistribution(distribution, candidates) {
  if (!distribution || typeof distribution !== 'object' || Array.isArray(distribution)) return false;
  const ids = candidates.map((candidate) => candidate.id);
  if (ids.some((id) => !Number.isFinite(distribution[id]) || distribution[id] < 0 || distribution[id] > 1)) return false;
  const total = ids.reduce((sum, id) => sum + distribution[id], 0);
  return Math.abs(total - 1) < 1e-6;
}

function runQualityDiversity(reports) {
  const candidates = (reports || []).map(candidateFromReport).filter(Boolean);
  if (candidates.length !== (reports || []).length || candidates.length < 3) {
    return { status: 'incomplete', reason: 'verified_behavior_vectors_missing' };
  }
  const selection = novelty.qualityDiversitySelect({ candidates, archive: [], qualityWeight: 0.5 });
  return { status: 'executed', ...selection, decisionAuthority: 'none', archiveScope: 'mission' };
}

function candidateFromReport(world) {
  const report = world.report || {};
  const vector = report.behaviorVector;
  const refs = Array.isArray(report.behaviorVectorEvidence) ? report.behaviorVectorEvidence : [];
  const known = verifiedEvidenceIds(report);
  if (!Array.isArray(vector) || !vector.length || !refs.length || !refs.every((id) => known.has(String(id)))) return null;
  const quality = trinityService.scoreWorldEvidence(report).totalScore;
  return { id: `world_${world.worldNumber}`, vector, quality };
}

function verifiedEvidenceIds(report) {
  const evidence = Array.isArray(report.evidence) ? report.evidence : [];
  return new Set(evidence.filter((item) => item && typeof item === 'object'
    && evidenceAudit.isVerifiedReceipt(item.verificationReceipt || item.receipt))
    .map((item) => String(item.id || '')).filter(Boolean));
}

module.exports = { run, runOracle, runQualityDiversity, runCounterfactual, runFactorial,
  validDistribution, candidateFromReport };
