'use strict';

const MODES = Object.freeze([
  'family_max_v1', 'raw_signals', 'condition_noisy_or_v2', 'no_change'
]);

const FAMILY_SIGNALS = Object.freeze({
  autoimmune: ['contradiction', 'adversarialRisk'],
  degenerative: ['stagnation', 'uncertainty'],
  infectious: ['provenanceRisk', 'monitoringNeed'],
  genetic: ['deterministicNeed', 'causalAmbiguity'],
  cancer: ['adversarialRisk', 'deterministicNeed'],
  metabolic: ['deterministicNeed', 'stagnation'],
  cardiovascular: ['monitoringNeed', 'stagnation'],
  psychiatric: ['contradiction', 'causalAmbiguity'],
  environmental: ['uncertainty', 'provenanceRisk']
});

// Cette projection conditionnelle reste une hypothèse à qualifier. Elle est exécutée
// en shadow tant qu'une campagne comparative indépendante ne l'a pas promue.
const CONDITION_SIGNALS = Object.freeze({
  Lupus: ['contradiction', 'adversarialRisk'],
  RheumatoidArthritis: ['contradiction', 'monitoringNeed'],
  MultipleSclerosis: ['uncertainty', 'causalAmbiguity'],
  Type1Diabetes: ['deterministicNeed', 'monitoringNeed'],
  Alzheimer: ['stagnation', 'causalAmbiguity'],
  Parkinson: ['uncertainty', 'monitoringNeed'],
  Osteoarthritis: ['stagnation', 'deterministicNeed'],
  Influenza: ['provenanceRisk', 'monitoringNeed'],
  Tuberculosis: ['provenanceRisk', 'stagnation'],
  Malaria: ['provenanceRisk', 'causalAmbiguity'],
  HivInfection: ['provenanceRisk', 'adversarialRisk'],
  SickleCellDisease: ['deterministicNeed', 'monitoringNeed'],
  CysticFibrosis: ['deterministicNeed', 'stagnation'],
  DuchenneMuscularDystrophy: ['deterministicNeed', 'causalAmbiguity'],
  LungCancer: ['adversarialRisk', 'monitoringNeed'],
  Leukemia: ['adversarialRisk', 'deterministicNeed'],
  Melanoma: ['adversarialRisk', 'provenanceRisk'],
  Type2Diabetes: ['deterministicNeed', 'stagnation'],
  Hypothyroidism: ['stagnation', 'monitoringNeed'],
  Gout: ['contradiction', 'deterministicNeed'],
  Hypertension: ['monitoringNeed', 'stagnation'],
  MyocardialInfarction: ['monitoringNeed', 'deterministicNeed'],
  IschemicStroke: ['monitoringNeed', 'causalAmbiguity'],
  MajorDepression: ['uncertainty', 'causalAmbiguity'],
  Schizophrenia: ['contradiction', 'causalAmbiguity'],
  BipolarDisorder: ['contradiction', 'monitoringNeed'],
  Asbestosis: ['provenanceRisk', 'stagnation'],
  LeadPoisoning: ['provenanceRisk', 'causalAmbiguity']
});

function unit(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}

function noisyOr(values) {
  return unit(1 - values.reduce((remaining, value) => remaining * (1 - unit(value)), 1));
}

function contributionSignals(family, contribution) {
  if (contribution.diagnostic && CONDITION_SIGNALS[contribution.condition]) {
    return CONDITION_SIGNALS[contribution.condition];
  }
  return FAMILY_SIGNALS[family.id] || [];
}

function addProjected(context, signal, contribution) {
  const { result, trace } = context;
  const before = unit(result[signal]);
  result[signal] = noisyOr([before, contribution.pressure]);
  trace.push({ signal, family: contribution.family, condition: contribution.condition || null,
    sourceRef: contribution.sourceRef || null, pressure: contribution.pressure,
    before, after: result[signal] });
}

function familyProjection(base, bridge) {
  const signals = { ...base };
  const trace = [];
  for (const family of bridge.families || []) {
    for (const signal of FAMILY_SIGNALS[family.id] || []) {
      const before = unit(signals[signal]);
      signals[signal] = Math.max(before, unit(family.pressure));
      trace.push({ signal, family: family.id, condition: null, sourceRef: null,
        pressure: unit(family.pressure), before, after: signals[signal] });
    }
  }
  return { signals, trace };
}

function conditionProjection(base, bridge) {
  const signals = { ...base };
  const trace = [];
  for (const family of bridge.families || []) {
    const contributions = family.contributions || [];
    for (const contribution of contributions) {
      const item = { ...contribution, family: family.id };
      for (const signal of contributionSignals(family, item)) {
        addProjected({ result: signals, trace }, signal, item);
      }
    }
  }
  applyTransverse(signals, bridge, trace);
  return { signals, trace };
}

function applyTransverse(signals, bridge, trace) {
  if (bridge.transverse?.iatrogenicCount) addProjected({ result: signals, trace }, 'causalAmbiguity', {
    family: 'transverse', sourceRef: 'transverse:iatrogenic', pressure: 0.7 });
  if (bridge.transverse?.nosocomialCount) addProjected({ result: signals, trace }, 'provenanceRisk', {
    family: 'transverse', sourceRef: 'transverse:nosocomial', pressure: 0.7 });
}

function applyTransverseMaximum(signals, bridge, trace) {
  const values = [['iatrogenicCount', 'causalAmbiguity', 'transverse:iatrogenic'],
    ['nosocomialCount', 'provenanceRisk', 'transverse:nosocomial']];
  for (const [count, signal, sourceRef] of values) {
    if (!bridge.transverse?.[count]) continue;
    const before = unit(signals[signal]);
    signals[signal] = Math.max(before, 0.7);
    trace.push({ signal, family: 'transverse', condition: null, sourceRef,
      pressure: 0.7, before, after: signals[signal] });
  }
}

function rawProjection(base) { return { signals: { ...base }, trace: [] }; }

function project(base = {}, bridge = {}, mode = 'family_max_v1') {
  if (!MODES.includes(mode)) throw new TypeError(`Unsupported nosology projection mode: ${mode}`);
  let result;
  if (mode === 'family_max_v1') result = familyProjection(base, bridge);
  else if (mode === 'condition_noisy_or_v2') result = conditionProjection(base, bridge);
  else result = rawProjection(base);
  if (mode === 'family_max_v1') applyTransverseMaximum(result.signals, bridge, result.trace);
  return { ...result, receipt: { schema: 'genos.nosology-projection/v2', mode,
    calibrationStatus: 'uncalibrated', decisionAuthority: false,
    abstain: mode === 'no_change', contributionCount: result.trace.length } };
}

function shadowComparison(base = {}, bridge = {}) {
  return Object.fromEntries(MODES.map((mode) => {
    const outcome = project(base, bridge, mode);
    return [mode, { signals: outcome.signals, abstain: outcome.receipt.abstain,
      contributionCount: outcome.receipt.contributionCount }];
  }));
}

module.exports = { MODES, FAMILY_SIGNALS, CONDITION_SIGNALS, unit, noisyOr, project,
  shadowComparison };
