'use strict';

const SIGN_RELATIONS = new Set(['icon', 'index', 'symbol']);

function analyzeSign(input = {}) {
  const signifier = String(input.signifier || '').trim();
  if (!signifier) throw new Error('signifier must be a non-empty string.');
  const relation = input.relation || 'symbol';
  if (!SIGN_RELATIONS.has(relation)) throw new Error(`Unknown sign relation '${relation}'.`);
  const signified = input.signified || null;
  return {
    kind: 'Sign',
    signifier,
    signified,
    relation,
    arbitrary: input.arbitrary === undefined ? relation === 'symbol' : Boolean(input.arbitrary),
    system: input.system || 'langue',
    use: input.use || 'parole',
    differences: Array.isArray(input.differences) ? input.differences : [],
    status: signified ? 'interpreted' : 'underdetermined'
  };
}

function analyzeBinaryOpposition(input = {}) {
  const left = String(input.left || '').trim();
  const right = String(input.right || '').trim();
  if (!left || !right) throw new Error('left and right must be non-empty strings.');
  return {
    kind: 'BinaryOpposition',
    left,
    right,
    hierarchy: input.hierarchy || 'undetermined',
    excludedRemainders: Array.isArray(input.excludedRemainders) ? input.excludedRemainders : [],
    structuralFunction: input.structuralFunction || 'contrastive',
    status: 'interpretive'
  };
}

module.exports = { SIGN_RELATIONS, analyzeSign, analyzeBinaryOpposition };
