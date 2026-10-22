'use strict';

const FORBIDDEN_PAIRS = [
  ['syncytium', 'parallel'],
  ['parallel', 'syncytium'],
  ['holobionte', 'parallel'],
  ['parallel', 'holobionte']
];

function stateTopologyOf(contract) {
  return contract && contract.stateModel && contract.stateModel.topology;
}

function isForbidden(a, b) {
  return FORBIDDEN_PAIRS.some((pair) => pair[0] === String(a).toLowerCase() && pair[1] === String(b).toLowerCase());
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

module.exports = { check };
