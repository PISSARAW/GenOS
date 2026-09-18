'use strict';

const MODES = Object.freeze(['objective', 'subjective']);

function numberInUnitInterval(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function assessProbability({ value, mode = 'subjective', basis = null } = {}) {
  const validValue = numberInUnitInterval(value);
  const validMode = MODES.includes(mode);
  return {
    kind: 'probability-assessment',
    value: validValue ? value : null,
    mode: validMode ? mode : null,
    basis,
    status: validValue && validMode ? 'well-formed' : 'invalid-probability',
    promotionEligible: false,
    interpretation: mode === 'objective'
      ? 'Valeur présentée comme une propriété du modèle ou du phénomène.'
      : 'Degré de croyance présenté par un agent ou un système.',
    limitation: 'Une probabilité bien formée ne constitue pas une preuve de vérité.',
  };
}

function coerceDistribution(distribution) {
  return Array.isArray(distribution) ? distribution.map(Number) : [];
}

function assessDistribution({ distribution, mode = 'subjective' } = {}) {
  const values = coerceDistribution(distribution);
  const validValues = values.length > 0 && values.every(numberInUnitInterval);
  const sum = values.reduce((total, value) => total + value, 0);
  const coherent = validValues && Math.abs(sum - 1) <= 0.001;
  return {
    kind: 'probability-distribution',
    values,
    mode: MODES.includes(mode) ? mode : null,
    sum: Number(sum.toFixed(6)),
    coherent,
    status: !validValues ? 'invalid-distribution' : coherent ? 'coherent' : 'incoherent',
    promotionEligible: false,
    limitation: 'La cohérence probabiliste ne garantit ni l’exactitude du modèle ni la vérité des événements.',
  };
}

function bayesUpdate({ prior, likelihood, likelihoodNotH, mode = 'subjective' } = {}) {
  const inputs = [prior, likelihood, likelihoodNotH];
  const validInputs = inputs.every(numberInUnitInterval);
  if (!validInputs) {
    return {
      kind: 'bayesian-update',
      status: 'insufficient-or-invalid-inputs',
      prior: null,
      likelihood: null,
      likelihoodNotH: null,
      posterior: null,
      promotionEligible: false,
      limitation: 'Bayes nécessite un a priori et deux vraisemblances dans [0, 1].',
    };
  }
  const denominator = (likelihood * prior) + (likelihoodNotH * (1 - prior));
  const posterior = denominator === 0 ? null : (likelihood * prior) / denominator;
  const likelihoodRatio = likelihoodNotH === 0 ? null : likelihood / likelihoodNotH;
  return {
    kind: 'bayesian-update',
    status: posterior === null ? 'undefined-posterior' : 'updated',
    mode: MODES.includes(mode) ? mode : null,
    prior,
    likelihood,
    likelihoodNotH,
    denominator,
    posterior,
    likelihoodRatio,
    promotionEligible: false,
    limitation: 'La mise à jour est conditionnelle au modèle et aux vraisemblances fournis ; elle ne vérifie pas l’hypothèse.',
  };
}

module.exports = { MODES, assessProbability, assessDistribution, bayesUpdate };
