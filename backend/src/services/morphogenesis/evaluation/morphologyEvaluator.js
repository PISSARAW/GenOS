'use strict';

const { evaluateConstraintGate } = require('./morphologyConstraintGate');
const { rankMorphologies } = require('./paretoMorphologyService');
const { validateUtilityVector } = require('./morphologyUtilityVector');

function evaluateCandidate(candidate) {
  const gate = evaluateConstraintGate(candidate.constraints);
  const vector = validateUtilityVector(candidate.utility);
  return {
    id: candidate.id,
    candidate,
    admissible: gate.passed && vector.valid,
    errors: [...gate.errors, ...vector.errors],
    utility: candidate.utility
  };
}

function evaluateMorphologies(candidates = []) {
  const evaluated = candidates.map(evaluateCandidate);
  const admissible = evaluated.filter((candidate) => candidate.admissible);
  const ranking = rankMorphologies(admissible);
  for (const candidate of evaluated) candidate.paretoRank = ranking.ranks[candidate.id] ?? null;
  return { candidates: evaluated, dominanceRelations: ranking.relations };
}

module.exports = { evaluateMorphologies };
