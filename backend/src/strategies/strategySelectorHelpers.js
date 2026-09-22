'use strict';

/**
 * @file strategySelectorHelpers.js
 * @description Helper functions for strategy selection
 */

const {
  PREFERRED_PRIMARY,
  HIGH_RISK_TYPES,
  HIGH_RISK_TERMS,
  REPRODUCIBILITY_TYPES,
  OBJECTIVE_CONFLICT_TYPES,
  TEMPORAL_TYPES,
  EVALUABILITY_TERMS,
  REVERSIBILITY_TERMS,
  UNCERTAINTY_DEFAULTS,
  BRANCHES,
} = require('./strategySelectorConstants');

const { applyTraitBonusesOne, applyTraitBonusesTwo, applyTraitBonusesThree, applyTraitBonusesFour, applyTraitBonusesFive, applyTraitBonusesSix } = require('./strategySelectorHelpers');

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function firstDefined(value, fallback) {
  if (value === undefined || value === null) return fallback;
  return value;
}

function firstTruthy(value, fallback) {
  if (value) return value;
  return fallback;
}

function classifyTechnicalProblem(problem) {
  const text = String(problem).toLowerCase();

  if (includesAny(text, ['ouvre le bloc-notes', 'ouvre notepad', 'open notepad', 'open the notepad', 'contrôle du pc', 'prends le contrôle', 'take control of the computer', 'take control of the desktop', 'computer use', 'desktop control', 'clique sur', 'click the screen', 'click on the screen', 'capture d\'écran', 'take a screenshot', 'appuie sur la touche', 'press the key', 'move the mouse', 'bouge la souris', 'contrôle clavier souris', 'keyboard and mouse'])) return 'desktop_control';

  if (text.includes('critical_bug_fix') || text.includes('hotfix') || includesAny(text, ['incident', 'production', 'intermittent', 'rare crash', 'outage', 'p0', 'sev1'])) return 'incident';

  if (includesAny(text, ['unknown cause', 'root cause', 'cause inconnue', 'diagnose', 'debug', 'investigate', 'why does it', 'bug', 'fix'])) return 'unknown_cause_bug';

  if (includesAny(text, ['security', 'vulnerability', 'threat', 'attack', 'sécurité', 'cve', 'exploit', 'injection'])) return 'security';

  if (includesAny(text, ['research', 'hypothesis', 'scientific', 'experiment', 'recherche', 'poc', 'proof of concept', 'benchmark'])) return 'scientific_research';

  if (includesAny(text, ['refactor', 'migration', 'monolith', 'rewrite', 'architecture critique', 'legacy', 'technical debt'])) return 'critical_refactor';

  if (includesAny(text, ['architecture', 'decision', 'trade-off', 'compare options', 'choisir', 'design doc', 'system design'])) return 'architecture_decision';

  return 'implementation';
}

function classifyProblem(problem = '') {
  if (require('../services/aTeamService').analyzeMission(problem).primaryDomain === 'creative_writing') return 'creative_writing';
  return classifyTechnicalProblem(problem);
}

function normalizeProfileType(type, problem) {
  const resolved = type || classifyProblem(problem);
  if (!PREFERRED_PRIMARY[resolved]) return classifyProblem(`${String(resolved)} ${problem}`);
  return resolved;
}

function isHighRisk(type, text) {
  if (HIGH_RISK_TYPES.includes(type)) return true;
  return includesAny(text, HIGH_RISK_TERMS);
}

function computeComplexity(problem, highRisk) {
  const lengthFactor = Math.min(String(problem).length / 600, 0.28);
  let value = 0.42 + lengthFactor;
  if (highRisk) value += 0.18;
  return Math.min(0.95, value);
}

function resolveRisk(highRisk, type) {
  if (highRisk) return 'high';
  if (type === 'architecture_decision') return 'medium';
  return 'low';
}

function resolveEvaluability(text) {
  if (includesAny(text, EVALUABILITY_TERMS)) return 'deterministic_tests';
  return 'multi_objective_evidence';
}

function resolveReversibility(text) {
  if (includesAny(text, REVERSIBILITY_TERMS)) return 'low';
  return 'high';
}

function profileProblem(problem = '', overrides = {}) {
  const type = normalizeProfileType(overrides.type, problem);
  const text = String(problem).toLowerCase();
  const highRisk = isHighRisk(type, text);
  return {
    type,
    complexity: firstDefined(overrides.complexity, computeComplexity(problem, highRisk)),
    uncertainty: firstDefined(overrides.uncertainty, firstDefined(UNCERTAINTY_DEFAULTS[type], 0.46)),
    risk: firstTruthy(overrides.risk, resolveRisk(highRisk, type)),
    evaluability: firstTruthy(overrides.evaluability, resolveEvaluability(text)),
    reversibility: firstTruthy(overrides.reversibility, resolveReversibility(text)),
    requires_reproducibility: firstDefined(overrides.requires_reproducibility, REPRODUCIBILITY_TYPES.includes(type)),
    objectives_conflict: firstDefined(overrides.objectives_conflict, OBJECTIVE_CONFLICT_TYPES.includes(type)),
    temporal_dependency: firstDefined(overrides.temporal_dependency, TEMPORAL_TYPES.includes(type))
  };
}

module.exports = {
  includesAny,
  firstDefined,
  firstTruthy,
  classifyProblem,
  classifyTechnicalProblem,
  normalizeProfileType,
  isHighRisk,
  computeComplexity,
  resolveRisk,
  resolveEvaluability,
  resolveReversibility,
  profileProblem,
  PREFERRED_PRIMARY,
  BRANCHES,
  UNCERTAINTY_DEFAULTS,
  HIGH_RISK_TYPES,
  HIGH_RISK_TERMS,
  REPRODUCIBILITY_TYPES,
  OBJECTIVE_CONFLICT_TYPES,
  TEMPORAL_TYPES,
  EVALUABILITY_TERMS,
  REVERSIBILITY_TERMS,
};