'use strict';

const CONTRACT_LIST_FIELDS = Object.freeze([
  'strengths', 'weaknesses', 'failureModes', 'variants', 'validParents', 'validChildren',
  'transitionIn', 'transitionOut', 'observables', 'requiredCapabilities'
]);

function fallback(value, defaultValue) {
  if (value === undefined || value === null) return defaultValue;
  return value;
}

function createTopologyContract(input = {}) {
  const contract = { ...input };
  for (const field of CONTRACT_LIST_FIELDS) {
    contract[field] = Array.isArray(input[field]) ? [...input[field]] : [];
  }
  contract.contractVersion = fallback(input.contractVersion, '2.0.0');
  contract.implementationVersion = fallback(input.implementationVersion, null);
  contract.problemSemantics = fallback(input.problemSemantics, {});
  contract.inputSemantics = fallback(input.inputSemantics, {});
  contract.outputSemantics = fallback(input.outputSemantics, {});
  contract.independenceModel = fallback(input.independenceModel, {});
  contract.stateModel = fallback(input.stateModel, {});
  contract.authorityModel = fallback(input.authorityModel, {});
  contract.communicationModel = fallback(input.communicationModel, {});
  contract.evidenceModel = fallback(input.evidenceModel, {});
  contract.resourceModel = fallback(input.resourceModel, {});
  contract.lifecycleModel = fallback(input.lifecycleModel, {});
  return contract;
}

function validateTopologyContract(contract) {
  const errors = [];
  if (!contract || !contract.topologyId) errors.push('topologyId is required');
  if (!contract || !contract.contractVersion) errors.push('contractVersion is required');
  for (const field of ['problemSemantics', 'inputSemantics', 'outputSemantics', 'stateModel', 'authorityModel']) {
    if (!contract || !contract[field] || typeof contract[field] !== 'object') errors.push(`${field} must be an object`);
  }
  return { valid: errors.length === 0, errors };
}

module.exports = { CONTRACT_LIST_FIELDS, createTopologyContract, validateTopologyContract };
