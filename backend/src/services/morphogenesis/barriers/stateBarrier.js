'use strict';

const FORBIDDEN_PAIRS = Object.freeze([
  ['syncytium', 'parallel'],
  ['parallel', 'syncytium'],
  ['holobionte', 'parallel'],
  ['parallel', 'holobionte']
]);

function stateTopologyOf(contract) {
  if (typeof contract === 'string') return contract;
  const model = contract && contract.stateModel;
  if (typeof model === 'string') return model;
  return (model && (model.topology || model.writes)) || (contract && (contract.topology || contract.topologyId)) || null;
}

function isForbidden(a, b) {
  const left = String(a || '').toLowerCase();
  const right = String(b || '').toLowerCase();
  return FORBIDDEN_PAIRS.some((pair) => pair[0] === left && pair[1] === right);
}

function check(parentContract, childContract) {
  const a = stateTopologyOf(parentContract);
  const b = stateTopologyOf(childContract);
  if (!a || !b) {
    return { valid: false, reason: 'state model topology is missing on one side' };
  }
  if (isForbidden(a, b)) {
    return { valid: false, reason: `state semantics incompatible: ${a} x ${b} is a forbidden pair` };
  }
  return { valid: true };
}

module.exports = { FORBIDDEN_PAIRS, isForbidden, check };
