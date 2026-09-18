'use strict';

const { boundedAnalysis } = require('./philosophyAnalysisContract');

function list(value) {
  return Array.isArray(value) ? value : [];
}

function analysis(result) {
  return boundedAnalysis(result);
}

function present(value) {
  return value !== undefined && value !== null;
}

function falsificationStatus(comparable, matches) {
  if (!comparable) return 'undetermined';
  return matches ? 'survives-test' : 'falsified-under-assumptions';
}

function assessConfirmation({ hypothesis, observations, compatible, adHoc = false, alternatives = [] } = {}) {
  const items = list(observations);
  const compatibility = typeof compatible === 'boolean' ? compatible : null;
  const status = compatibility === true ? 'supported-not-verified' : compatibility === false ? 'unsupported' : 'undetermined';
  return analysis({
    kind: 'confirmation-assessment',
    hypothesis: hypothesis ?? null,
    observations: items,
    compatible: compatibility,
    adHoc,
    alternatives: list(alternatives),
    status,
    limitation: 'La compatibilité avec les observations soutient une hypothèse sans la vérifier ; les hypothèses auxiliaires et alternatives restent pertinentes.',
  });
}

function assessFalsification({ hypothesis, predicted, observed, auxiliaryAssumptions = [] } = {}) {
  const comparable = present(predicted) && present(observed);
  const matches = comparable && predicted === observed;
  return analysis({
    kind: 'falsification-assessment',
    hypothesis: hypothesis ?? null,
    predicted: predicted ?? null,
    observed: observed ?? null,
    auxiliaryAssumptions: list(auxiliaryAssumptions),
    status: falsificationStatus(comparable, matches),
    predictionMatched: comparable ? matches : null,
    limitation: 'Une réfutation porte sur la chaîne hypothèse-prédiction et ses hypothèses auxiliaires ; elle ne localise pas toujours seule la prémisse fautive.',
  });
}

function assessHypotheticoDeductive({ hypothesis, predictions, observations } = {}) {
  const expected = list(predictions);
  const actual = list(observations);
  const comparable = expected.length > 0 && expected.length === actual.length;
  const matches = comparable && expected.every((value, index) => value === actual[index]);
  return analysis({
    kind: 'hypothetico-deductive-method',
    hypothesis: hypothesis ?? null,
    predictions: expected,
    observations: actual,
    status: !comparable ? 'undetermined' : matches ? 'predictions-supported' : 'prediction-failure',
    matchedPredictions: comparable ? expected.filter((value, index) => value === actual[index]).length : 0,
    limitation: 'La méthode teste des conséquences observables ; elle ne transforme pas une série de prédictions réussies en certitude.',
  });
}

function assessDuhemQuine({ hypothesis, auxiliaryAssumptions, observedFailure } = {}) {
  const auxiliaries = list(auxiliaryAssumptions);
  return analysis({
    kind: 'duhem-quine-assessment',
    hypothesis: hypothesis ?? null,
    auxiliaryAssumptions: auxiliaries,
    observedFailure: Boolean(observedFailure),
    status: observedFailure && auxiliaries.length > 0 ? 'holistic-failure' : observedFailure ? 'direct-failure-candidate' : 'no-failure-observed',
    limitation: 'Un échec expérimental peut concerner l’hypothèse centrale, les conditions initiales, l’instrument ou une hypothèse auxiliaire.',
  });
}

module.exports = { assessConfirmation, assessFalsification, assessHypotheticoDeductive, assessDuhemQuine };
