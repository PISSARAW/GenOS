'use strict';

const schema = require('./trinityQualificationSchema');
const ACTIONS = ['gesture', 'navigation', 'menu', 'search', 'inspect'];
const MECHANISMS = ['gesture', 'direct_content', 'direct_link', 'menu', 'navigation_bar', 'search', 'tabs', 'tree'];

function result(verified, detail) {
  return { status: verified ? 'verified' : 'failed', verified, scope: 'fixture',
    coverage: null, universalProof: false, promotionAuthorized: false, ...detail };
}

function numbers(values) {
  if (!Array.isArray(values) || values.some(value => !Number.isFinite(value))) schema.fail('Finite numeric array required.');
  return values;
}

function dimensions(values) {
  if (!Array.isArray(values) || !values.length) schema.fail('All objective dimensions must be explicit.');
  values.forEach(value => {
    schema.keys(value, ['id', 'direction'], 'dimension');
    schema.string(value.id, 'dimension.id');
    if (!['min', 'max'].includes(value.direction)) schema.fail('Dimension direction must be min or max.');
  });
  if (new Set(values.map(value => value.id)).size !== values.length) schema.fail('Duplicate dimension.');
  return values;
}

function vector(value, dims) {
  schema.keys(value, dims.map(dim => dim.id), 'objective vector');
  if (dims.some(dim => !Number.isFinite(value[dim.id]))) schema.fail('Every dimension requires a finite value.');
}

function pareto(input) {
  const dims = dimensions(input.dimensions);
  vector(input.left, dims);
  vector(input.right, dims);
  const deltas = dims.map(dim => (input.left[dim.id] - input.right[dim.id]) * (dim.direction === 'max' ? 1 : -1));
  const dominates = deltas.every(delta => delta >= 0) && deltas.some(delta => delta > 0);
  if (typeof input.claimedDominates !== 'boolean') schema.fail('Explicit dominance claim required.');
  return result(dominates === input.claimedDominates, { dominates, dimensions: dims,
    limits: ['Numeric comparison only; measurement authenticity and objective completeness require independent evidence.'] });
}

function binarySearch(input) {
  const values = numbers(input.values);
  if (!Number.isFinite(input.target)) schema.fail('Finite target required.');
  if (values.some((value, index) => index > 0 && values[index - 1] > value)) schema.fail('Sorted ascending input required.');
  const policy = input.duplicatePolicy ?? 'any';
  if (!['any', 'first', 'last'].includes(policy)) schema.fail('Unknown duplicate policy.');
  const first = values.indexOf(input.target);
  const last = values.lastIndexOf(input.target);
  const valid = validIndex(input, { first, last, policy });
  return result(valid, { index: input.index, first, last,
    limits: ['Checks this returned zero-based index; does not establish algorithm complexity or correctness for all inputs.'] });
}

function validIndex(input, expected) {
  if (!Number.isInteger(input.index)) return false;
  if (expected.first === -1) return input.index === -1;
  if (expected.policy === 'first') return input.index === expected.first;
  if (expected.policy === 'last') return input.index === expected.last;
  return input.index >= 0 && input.index < input.values.length && input.values[input.index] === input.target;
}

function policy(value) {
  schema.keys(value, ['allowedActions', 'requiredActions', 'forbiddenMechanisms', 'maxSteps'], 'exploration policy');
  const allowed = schema.list(value.allowedActions, 'allowedActions');
  const required = schema.list(value.requiredActions, 'requiredActions');
  const forbidden = schema.list(value.forbiddenMechanisms, 'forbiddenMechanisms');
  if (!allowed.length || allowed.some(kind => !ACTIONS.includes(kind))) schema.fail('Unsupported exploration action.');
  if (required.some(kind => !allowed.includes(kind))) schema.fail('Required action is not allowed.');
  if (forbidden.some(item => !MECHANISMS.includes(item))) schema.fail('Unsupported forbidden mechanism.');
  if (!Number.isInteger(value.maxSteps) || value.maxSteps < 1) schema.fail('Positive maxSteps required.');
  return { allowed, required, forbidden, maxSteps: value.maxSteps };
}

function actionAllowed(action, limits) {
  schema.keys(action, ['kind', 'mechanism', 'target', 'query', 'evidenceId'], 'exploration action');
  if (!limits.allowed.includes(action.kind)) return false;
  if (!MECHANISMS.includes(action.mechanism)) return false;
  if (mechanismForbidden(action.mechanism, limits.forbidden)) return false;
  return actionContent(action);
}

function mechanismForbidden(mechanism, forbidden) {
  const aliases = { tabs: 'navigation_bar', tree: 'menu' };
  return forbidden.includes(mechanism) || forbidden.includes(aliases[mechanism]);
}

function actionContent(action) {
  if (Object.hasOwn(action, 'evidenceId')) schema.string(action.evidenceId, 'evidenceId');
  if (action.kind === 'search') return typeof action.query === 'string' && Boolean(action.query.trim()) && !Object.hasOwn(action, 'target');
  return typeof action.target === 'string' && Boolean(action.target.trim()) && !Object.hasOwn(action, 'query');
}

function exploration(input) {
  const limits = policy(input.policy);
  const actions = schema.list(input.actions, 'actions');
  const invalidIndexes = actions.flatMap((action, index) => actionAllowed(action, limits) ? [] : [index]);
  const missingActions = limits.required.filter(kind => !actions.some(action => action.kind === kind));
  const verified = actions.length > 0 && actions.length <= limits.maxSteps && !invalidIndexes.length && !missingActions.length;
  return result(verified, { invalidIndexes, missingActions, executionVerified: false, traceAuthenticity: 'unverified',
    limits: ['Checks structured proposals or recorded declarations only; independent instrumentation must prove UI execution, trace completeness and mechanism authenticity.'] });
}

function verify(kind, input) {
  const verifiers = { pareto, binary_search: binarySearch, exploration };
  if (!Object.hasOwn(verifiers, kind)) return result(false, { reason: 'unsupported_semantic_verifier' });
  try {
    return verifiers[kind](input);
  } catch (error) {
    return result(false, { reason: error.message });
  }
}

module.exports = { verify };
