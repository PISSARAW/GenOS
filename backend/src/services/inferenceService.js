'use strict';

const UNKNOWN = 'undetermined';

function list(value) {
  return Array.isArray(value) ? value.filter((item) => item !== undefined && item !== null) : [];
}

function declaredBoolean(value) {
  return typeof value === 'boolean' ? value : null;
}

function inferDeductively({ premises, conclusion, entails } = {}) {
  const items = list(premises);
  const declared = declaredBoolean(entails);
  const identityMatch = items.some((premise) => premise === conclusion);
  const status = declared === true || (declared === null && identityMatch)
    ? 'validity-candidate'
    : declared === false
      ? 'invalid-inference'
      : UNKNOWN;
  return {
    kind: 'deduction',
    premises: items,
    conclusion: conclusion ?? null,
    status,
    entailment: declared === null ? (identityMatch ? true : UNKNOWN) : declared,
    preservesTruth: declared === true,
    soundness: 'undetermined',
    limitation: 'Aucune analyse complète de logique formelle ; la validité déclarée ou l’identité exacte des prémisses est utilisée.',
  };
}

function inferInductively({ observations, generalization, counterexamples } = {}) {
  const items = list(observations);
  const exceptions = list(counterexamples);
  const total = items.length + exceptions.length;
  const support = total === 0 ? 0 : Number((items.length / total).toFixed(3));
  return {
    kind: 'induction',
    observations: items,
    generalization: generalization ?? null,
    counterexamples: exceptions,
    status: items.length === 0 ? 'insufficient-observations' : exceptions.length ? 'weakened-support' : 'supported-but-non-deductive',
    support,
    ampliative: true,
    limitation: 'Le soutien inductif n’implique pas logiquement la généralisation ; le problème de l’induction reste ouvert.',
  };
}

function normalizeHypothesis(hypothesis, index) {
  const score = Number(hypothesis?.score);
  return {
    id: hypothesis?.id || `hypothesis-${index + 1}`,
    explanation: hypothesis?.explanation || hypothesis?.statement || null,
    score: Number.isFinite(score) ? score : null,
    coverage: hypothesis?.coverage ?? null,
    simplicity: hypothesis?.simplicity ?? null,
  };
}

function inferAbductively({ observations, hypotheses } = {}) {
  const items = list(observations);
  const candidates = list(hypotheses).map(normalizeHypothesis);
  const ranked = candidates
    .filter((candidate) => candidate.score !== null)
    .sort((left, right) => right.score - left.score);
  const best = ranked[0] || null;
  return {
    kind: 'abduction',
    observations: items,
    hypotheses: ranked,
    bestExplanation: best,
    status: best ? 'best-explanation-candidate' : 'insufficient-ranked-hypotheses',
    limitation: 'Le meilleur score explicatif ne démontre pas la vérité de l’hypothèse ; les scores et critères sont fournis par l’appelant.',
  };
}

function checkEntailment({ premises = [], conclusion } = {}) {
  const logic = require('./propositionalLogicService');
  return { ...logic.findCounterexample({ premises, conclusion }), kind: 'semantic-entailment', soundness: 'bounded-classical' };
}

function classifyArgument({ premises = [], conclusion } = {}) {
  const result = checkEntailment({ premises, conclusion });
  return { ...result, status: result.valid ? 'validity-candidate' : 'counterexample-found', promotionEligible: false };
}

module.exports = { inferDeductively, inferInductively, inferAbductively, checkEntailment, classifyArgument };
