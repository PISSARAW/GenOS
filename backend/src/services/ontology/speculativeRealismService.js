'use strict';

const { text, evidence } = require('./ontologyContracts');

function analyzeCorrelationLimit(input = {}) {
  const objectId = text(input.objectId, 'objectId');
  const observerId = text(input.observerId, 'observerId');
  return { objectId, observerId, claim: input.claim || 'object_independent_of_observer',
    accessMode: input.accessMode || 'indirect', correlationRisk: bounded(input.correlationRisk, 0.5),
    evidence: evidence(input.evidence),
    limitation: 'L’analyse distingue l’objet et son accès sans établir une ontologie définitive.' };
}

function compareAccessModes(input = {}) {
  const objectId = text(input.objectId, 'objectId');
  const modes = Array.isArray(input.modes) ? input.modes : ['direct', 'indirect', 'inferential'];
  return { objectId, modes, independentClaim: false, evidenceStatus: 'unverified' };
}

function bounded(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

module.exports = { analyzeCorrelationLimit, compareAccessModes };
