'use strict';

const { digest, fail } = require('./qualityContract');

function repairPlan(request, contract) {
  if (request == null) return null;
  validateRequest(request, contract);
  const criteria = request.unverifiedCriteria;
  const obligations = criteria.map(name => criterionFor(name, contract));
  return { stage: 'draft', strategy: 'targeted_repair', targets: [], invalidated: [],
    obligations, requestDigest: digest(request), contractDigest: contract.digest,
    preservedArtifactDigest: request.previousArtifactDigest || null };
}

function validateRequest(request, contract) {
  const criteria = request.unverifiedCriteria;
  if (request.schema !== 'genos.quality-repair-request/v1'
    || !Number.isSafeInteger(request.attempt) || request.attempt < 1 || request.attempt > 2) invalid();
  if (!Array.isArray(criteria) || !criteria.length || criteria.length > contract.criteria.length) invalid();
  if (new Set(criteria).size !== criteria.length) invalid();
}

function criterionFor(name, contract) {
  const criterion = contract.criteria.find(item => item.id === name || item.description === name);
  if (!criterion) invalid();
  return { code: criterion.id, section: criterion.stage, message: criterion.description, evidence: [] };
}

function invalid() {
  throw fail('GQEL_REPAIR_OBLIGATIONS_INVALID', 'Repair requires bounded obligations from the current quality contract.');
}

module.exports = { repairPlan };
