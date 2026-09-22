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
    assessment: {
      type: 'utilitarian-assessment',
      utility,
      note: utility > 0
        ? 'L\'action produit une utilité positive sous les hypothèses fournies.'
        : 'L\'action produit une utilité négative ou nulle sous les hypothèses fournies.',
    },
    assumptions: [
      'Les probabilités et utilités fournies sont déclaratives, non vérifiées.',
      'L\'évaluation ne couvre pas les effets indirects non déclarés.',
      'Aucun verdict n\'est émis ; seulement un bilan sous hypothèses explicites.',
    ],
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
    ruleAssessment: {
      type: 'rule-assessment',
      supported: assessment.utility > 0,
      note: assessment.utility > 0
        ? 'La règle supporte l\'action sous les hypothèses fournies.'
        : 'La règle ne supporte pas l\'action sous les hypothèses fournies.',
    },
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
    assessment: {
      type: 'categorical-imperative-assessment',
      universalizable: noContradiction,
      respectsPersons,
      note: noContradiction && respectsPersons
        ? 'La maxime peut être universalisée sans contradiction et respecte les personnes comme fins.'
        : 'La maxime rencontre une contradiction à l\'universalisation ou ne respecte pas les personnes comme fins.',
    },
    assumptions: [
      'La contradiction est évaluée sur la maxime déclarée, pas sur l\'intention réelle.',
      'Le respect des personnes est binaire sur la base du paramètre fourni.',
      'Aucun verdict n\'est émis ; seulement une évaluation structurelle des conditions.',
    ],
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
    assessment: {
      type: 'double-effect-assessment',
      permitted,
      conditions,
      note: permitted
        ? 'Les conditions de la doctrine du double effet sont remplies sous les hypothèses fournies.'
        : 'Au moins une condition de la doctrine du double effet n\'est pas remplie.',
    },
    assumptions: [
      'Les conditions sont évaluées sur les déclarations fournies, non sur la réalité.',
      'La doctrine du double effet est un cadre d\'analyse, pas un verdict automatique.',
      'Aucun verdict n\'est émis.',
    ],
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
    assessment: {
      type: 'virtue-ethics-reading',
      mean,
      note: mean >= 0.7
        ? "Les vertus déclarées atteignent un seuil élevé de cohérence — lecture aristotélicienne d'un caractère florissant."
        : mean >= 0.4
          ? "Les vertus déclarées sont en développement — lecture d'un caractère en construction."
          : "Les vertus déclarées sont faibles — lecture d'un caractère déficient.",
    },
    assumptions: [
      'Les scores de vertus sont déclaratifs, pas mesurés.',
      'La moyenne arithmétique n\'est pas une mesure valide de l\'eudaimonia.',
      'Aucun verdict n\'est émis ; seule une lecture structurée est fournie.',
    ],
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
