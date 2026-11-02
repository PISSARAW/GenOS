'use strict';

const { digest } = require('../evidenceProtocol/canonical');
const { validatePlan } = require('./contract');
const { MorphConservationError, fail, actorSet, indexSnapshot, sameRecords } = require('./conservationRecords');
const { verifyOwnership } = require('./conservationOwnership');

function versions(plan) {
  if (plan.sourceVersion === Number.MAX_SAFE_INTEGER || plan.targetVersion !== plan.sourceVersion + 1) {
    fail('target version must advance source version by exactly one.');
  }
}

function participants(plan) { actorSet(plan.participants); }

function preservedRecords(indexes) {
  const kinds = ['claims', 'evidence', 'provenance', 'dependencies', 'audiences', 'uncertainties', 'questions'];
  for (const kind of kinds) sameRecords(indexes.source[kind], indexes.target[kind], kind);
}

function verifyConservation(input) {
  const plan = validatePlan(input);
  versions(plan);
  const indexes = { source: indexSnapshot(plan.sourceSnapshot), target: indexSnapshot(plan.targetSnapshot) };
  participants(plan);
  preservedRecords(indexes);
  verifyOwnership(plan, indexes);
  return { valid: true, planDigest: digest(plan), sourceDigest: digest(plan.sourceSnapshot), targetDigest: digest(plan.targetSnapshot) };
}

module.exports = { verifyConservation, MorphConservationError };
