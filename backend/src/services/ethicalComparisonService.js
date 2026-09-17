'use strict';

const FRAMEWORKS = Object.freeze({
  utilitarianism: { concept: 'ethics.act-utilitarianism', service: './normativeEthicsService', method: 'evaluateActUtilitarianism' },
  deontology: { concept: 'ethics.categorical-imperative', service: './normativeEthicsService', method: 'evaluateCategoricalImperative' },
  rawlsianJustice: { concept: 'ethics.rawlsian-justice', service: './justiceEthicsService', method: 'evaluateRawlsianJustice' },
  care: { concept: 'ethics.care-ethics', service: './relationalEthicsService', method: 'assessCare' },
  environmental: { concept: 'ethics.environmental-ethics', service: './environmentalEthicsService', method: 'assessEcologicalPerspective' },
});

function evaluateFramework(name, args) {
  const definition = FRAMEWORKS[name];
  if (!definition) throw new Error(`Unknown ethical framework '${name}'.`);
  const service = require(definition.service);
  return { framework: name, concept: definition.concept, result: service[definition.method](args) };
}

function defaultArguments(name, scenario) {
  const action = scenario.action || { id: 'scenario' };
  const defaults = {
    utilitarianism: { action, outcomes: [] },
    deontology: { action, maxim: 'Agir selon une règle publiquement justifiable' },
    rawlsianJustice: { distribution: { worstOff: 0, other: 0 } },
    care: { actor: 'agent', recipient: 'affected-party' },
    environmental: {},
  };
  return defaults[name] || { action };
}

function compareEthicalFrameworks({ scenario, frameworks = Object.keys(FRAMEWORKS), argumentsByFramework = {}, evidenceRefs = [], assumptions = [] } = {}) {
  if (!scenario || typeof scenario !== 'object') throw new Error('ethicalComparisonService requires a scenario object');
  if (!Array.isArray(frameworks) || frameworks.length < 2) throw new Error('ethicalComparisonService requires at least two frameworks');
  const evaluations = frameworks.map((name) => evaluateFramework(name, argumentsByFramework[name] || defaultArguments(name, scenario)));
  const verdicts = evaluations.map((evaluation) => evaluation.result.verdict || evaluation.result.observations?.verdict || null);
  const uniqueVerdicts = [...new Set(verdicts.filter(Boolean))];
  return {
    scenario,
    evaluations,
    agreements: uniqueVerdicts.length === 1 ? frameworks : [],
    disagreements: uniqueVerdicts.length > 1 ? evaluations.map((evaluation) => ({ framework: evaluation.framework, verdict: evaluation.result.verdict || evaluation.result.observations?.verdict || null })) : [],
    unresolvedConflicts: uniqueVerdicts.length > 1 ? ['Frameworks use non-equivalent normative criteria.'] : [],
    provenance: { frameworkConcepts: evaluations.map((evaluation) => evaluation.concept), evidenceRefs, assumptions },
    humanReviewRequired: true,
    executable: false,
    decisionStatus: 'requires-human-judgment',
  };
}

module.exports = { FRAMEWORKS, compareEthicalFrameworks };
