'use strict';

const { decisionFromAdaptive, summarize, describe } = require('./adaptiveEpistemicDecision');
const { toAntigen } = require('./antigenModel');

function runAdaptiveDecision(claim, antigenInput, context = {}) {
  if (!claim || typeof claim !== 'string') {
    throw new Error('Revendication requise');
  }
  const antigen = antigenInput || { claim, epitopes: {}, risk: { score: 0, factors: [] } };
  const decision = decisionFromAdaptive(claim, antigen, context);
  return {
    decision: decision.decision,
    summary: summarize(decision),
    detail: describe(decision),
    full: decision,
  };
}

// ---- validateurs unitaires ----

const REQUIRED_FIELDS = ['claim', 'antigen'];

function inputIsPlainObject(input) {
  return Boolean(input && typeof input === 'object' && !Array.isArray(input));
}

function fieldPresent(input, field) {
  return input[field] != null;
}

function claimIsNonEmptyString(claim) {
  return typeof claim === 'string' && claim.trim().length > 0;
}

function antigenIsPlainObject(antigen) {
  return Boolean(antigen && typeof antigen === 'object' && !Array.isArray(antigen));
}

function epitopesIsPlainObject(antigen) {
  if (!antigen || !antigen.epitopes) return true;
  return typeof antigen.epitopes === 'object' && !Array.isArray(antigen.epitopes);
}

function riskScoreIsNumber(antigen) {
  if (!antigen || !antigen.risk) return true;
  return typeof antigen.risk.score === 'number';
}

function validateAdaptiveDecision(input = {}) {
  if (!inputIsPlainObject(input)) {
    return { valid: false, error: 'Entrée invalide' };
  }
  for (const field of REQUIRED_FIELDS) {
    if (!fieldPresent(input, field)) {
      return { valid: false, error: `Champ requis manquant: ${field}` };
    }
  }
  if (!claimIsNonEmptyString(input.claim)) {
    return { valid: false, error: 'Revendication invalide' };
  }
  if (!antigenIsPlainObject(input.antigen)) {
    return { valid: false, error: 'Antigène invalide' };
  }
  if (!epitopesIsPlainObject(input.antigen)) {
    return { valid: false, error: 'Épitopes invalides' };
  }
  if (!riskScoreIsNumber(input.antigen)) {
    return { valid: false, error: 'Risque invalide' };
  }
  return { valid: true };
}

module.exports = {
  runAdaptiveDecision,
  validateAdaptiveDecision,
  decisionFromAdaptive,
  summarize,
  describe,
};
