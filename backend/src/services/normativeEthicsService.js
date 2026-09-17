'use strict';

/**
 * Pure evaluators for the normative-ethics core.
 *
 * These functions produce assessments only. They never authorize, promote or
 * execute an action; runtime gates remain the source of execution authority.
 */

function requireAction(action, name) {
  if (!action || typeof action !== 'object') {
    throw new Error(`normativeEthicsService.${name} requires an action`);
  }
}

function numeric(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function outcomeUtility(outcome) {
  const probability = Math.max(0, Math.min(1, numeric(outcome.probability, 1)));
  return probability * numeric(outcome.utility);
}

function evaluateActUtilitarianism({ action, outcomes = [] }) {
  requireAction(action, 'evaluateActUtilitarianism');
  if (!Array.isArray(outcomes)) throw new Error('outcomes must be an array');
  const utility = outcomes.reduce((sum, outcome) => sum + outcomeUtility(outcome), 0);
  return {
    framework: 'act-utilitarianism',
    action,
    utility,
    outcomes,
    verdict: utility > 0 ? 'permissible-by-consequence' : 'impermissible-by-consequence',
    executable: false,
  };
}

function evaluateRuleUtilitarianism({ action, rule, expectedOutcomes = [] }) {
  requireAction(action, 'evaluateRuleUtilitarianism');
  if (!rule || typeof rule !== 'string') throw new Error('rule must be a non-empty string');
  if (!Array.isArray(expectedOutcomes)) throw new Error('expectedOutcomes must be an array');
  const assessment = evaluateActUtilitarianism({ action, outcomes: expectedOutcomes });
  return {
    ...assessment,
    framework: 'rule-utilitarianism',
    rule,
    verdict: assessment.utility > 0 ? 'rule-supported' : 'rule-rejected',
  };
}

function evaluateCategoricalImperative({ action, maxim, universalizedMaxim, contradiction = null, treatsPersonsAsEnds = true }) {
  requireAction(action, 'evaluateCategoricalImperative');
  if (!maxim || typeof maxim !== 'string') throw new Error('maxim must be a non-empty string');
  const noContradiction = contradiction !== true;
  const respectsPersons = treatsPersonsAsEnds === true;
  return {
    framework: 'kantian-deontology',
    action,
    maxim,
    universalizedMaxim: universalizedMaxim || maxim,
    universalizable: noContradiction,
    respectsPersons,
    verdict: noContradiction && respectsPersons ? 'permissible' : 'impermissible',
    executable: false,
  };
}

function evaluateDoubleEffect({ action, intendedGood, foreseenHarm, meansEnd = false, proportionality = false, alternativesExhausted = false }) {
  requireAction(action, 'evaluateDoubleEffect');
  const good = intendedGood === true;
  const harm = foreseenHarm === true;
  const conditions = {
    goodIntended: good,
    harmForeseenOnly: harm && !meansEnd,
    meansEndSatisfied: !meansEnd,
    proportionalitySatisfied: proportionality === true,
    alternativesConsidered: alternativesExhausted === true,
  };
  const permitted = Object.values(conditions).every(Boolean);
  return {
    framework: 'doctrine-of-double-effect',
    action,
    conditions,
    verdict: permitted ? 'permissible-under-double-effect' : 'not-justified',
    executable: false,
  };
}

function assessVirtueEthics({ agentId, virtues = {}, context = null }) {
  if (!agentId) throw new Error('normativeEthicsService.assessVirtueEthics requires agentId');
  const names = ['wisdom', 'courage', 'temperance', 'justice'];
  const scores = Object.fromEntries(names.map((name) => [name, Math.max(0, Math.min(1, numeric(virtues[name])))]));
  const mean = Object.values(scores).reduce((sum, value) => sum + value, 0) / names.length;
  return {
    framework: 'virtue-ethics',
    agentId,
    virtues: scores,
    context,
    eudaimoniaScore: mean,
    verdict: mean >= 0.7 ? 'flourishing-character' : mean >= 0.4 ? 'developing-character' : 'deficient-character',
    executable: false,
  };
}

module.exports = {
  evaluateActUtilitarianism,
  evaluateRuleUtilitarianism,
  evaluateCategoricalImperative,
  evaluateDoubleEffect,
  assessVirtueEthics,
};
