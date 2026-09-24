'use strict';

const { WORK_NODE_STATUS } = require('../constants');
const { isRecord, isNonEmpty, isStringList, result } = require('./contractValidation');

function validateWorkNode(node) {
  const errors = [];
  if (!isRecord(node)) return result(['Work node must be an object.']);
  if (!isNonEmpty(node.nodeId)) errors.push('nodeId is required.');
  if (!isNonEmpty(node.responsibility)) errors.push('responsibility is required.');
  for (const field of ['requiredCapabilities', 'inputs', 'outputs', 'preconditions', 'postconditions']) {
    if (!isStringList(node[field])) errors.push(`${field} must be an array of non-empty strings.`);
  }
  validateOptionalOwner(node.ownerAgentId, errors);
  validateNodeRisk(node.risk, errors);
  validateNodeCriticality(node.criticality, errors);
  validateEstimatedDuration(node.estimatedDuration, errors);
  if (!WORK_NODE_STATUS.includes(node.status)) errors.push('work node status is invalid.');
  return result(errors);
}

function validateOptionalOwner(value, errors) {
  if (value !== null && value !== undefined && !isNonEmpty(value)) errors.push('ownerAgentId must be a non-empty string or null.');
}

function validateNodeRisk(value, errors) {
  if (value !== undefined && !['low', 'medium', 'high', 'critical'].includes(value)) errors.push('risk is invalid.');
}

function validateNodeCriticality(value, errors) {
  if (!['low', 'medium', 'high', 'critical'].includes(value)) errors.push('criticality is invalid.');
}

function validateEstimatedDuration(value, errors) {
  if (value !== undefined && (!Number.isFinite(Number(value)) || Number(value) <= 0)) errors.push('estimatedDuration must be a positive number.');
}

module.exports = { validateWorkNode };
