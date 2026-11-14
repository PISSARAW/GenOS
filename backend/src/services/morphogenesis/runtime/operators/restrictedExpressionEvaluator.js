'use strict';

const MAX_DEPTH = 16;
const MAX_NODES = 128;
const MAX_ARRAY_LENGTH = 64;
const MAX_EXPRESSION_BYTES = 8192;
const MAX_PATH_SEGMENTS = 16;
const FORBIDDEN_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

class GateExpressionError extends Error {
  constructor(message) {
    super(`Invalid gate condition expression: ${message}`);
    this.name = 'GateExpressionError';
    this.code = 'INVALID_GATE_CONDITION_EXPRESSION';
  }
}

function reject(message) {
  throw new GateExpressionError(message);
}

function parseRule(expression) {
  if (typeof expression !== 'string') return expression;
  if (Buffer.byteLength(expression, 'utf8') > MAX_EXPRESSION_BYTES) reject('string expression is too large');
  try {
    return JSON.parse(expression);
  } catch (_) {
    return reject('string expressions must contain valid JSON');
  }
}

function enterNode(state) {
  state.nodes += 1;
  state.depth += 1;
  if (state.nodes > MAX_NODES) reject(`rule exceeds ${MAX_NODES} nodes`);
  if (state.depth > MAX_DEPTH) reject(`rule exceeds depth ${MAX_DEPTH}`);
}

function ownOperator(rule) {
  const descriptors = Object.getOwnPropertyDescriptors(rule);
  const keys = Object.keys(descriptors).filter((key) => descriptors[key].enumerable);
  if (keys.length !== 1) reject('each rule must contain exactly one operator');
  const descriptor = descriptors[keys[0]];
  if (!Object.hasOwn(descriptor, 'value')) reject('accessor properties are forbidden');
  return { operator: keys[0], arguments: descriptor.value };
}

function arrayValues(value, label = 'operator arguments') {
  if (!Array.isArray(value)) reject(`${label} must be an array`);
  const length = Object.getOwnPropertyDescriptor(value, 'length').value;
  if (length > MAX_ARRAY_LENGTH) reject(`${label} exceeds ${MAX_ARRAY_LENGTH} entries`);
  const values = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor && !Object.hasOwn(descriptor, 'value')) reject(`${label} cannot contain accessors`);
    values.push(descriptor?.value);
  }
  return values;
}

function evaluateNode(rule, data, state) {
  enterNode(state);
  try {
    if (rule === null || typeof rule !== 'object') return rule;
    if (Array.isArray(rule)) return arrayValues(rule, 'rule array').map((entry) => evaluateNode(entry, data, state));
    const entry = ownOperator(rule);
    if (!Object.hasOwn(OPERATORS, entry.operator)) reject(`unsupported operator: ${entry.operator}`);
    const handler = OPERATORS[entry.operator];
    return handler(entry.arguments, data, state);
  } finally {
    state.depth -= 1;
  }
}

function exactArguments(raw, count) {
  const values = arrayValues(raw);
  if (values.length !== count) reject(`operator requires ${count} arguments`);
  return values;
}

function evaluatedPair(raw, data, state) {
  const pair = exactArguments(raw, 2);
  return pair.map((entry) => evaluateNode(entry, data, state));
}

function comparison(predicate) {
  return (raw, data, state) => {
    const [left, right] = evaluatedPair(raw, data, state);
    return predicate(left, right);
  };
}

function relationalComparison(predicate) {
  return (raw, data, state) => {
    const [left, right] = evaluatedPair(raw, data, state);
    const type = typeof left;
    const invalidNumber = type === 'number' && (!Number.isFinite(left) || !Number.isFinite(right));
    if (type !== typeof right || !['number', 'string'].includes(type) || invalidNumber) {
      reject('ordered comparisons require two numbers or two strings');
    }
    return predicate(left, right);
  };
}

function logicalAnd(raw, data, state) {
  const values = arrayValues(raw);
  if (values.length === 0) reject('and requires at least one argument');
  for (const entry of values) {
    if (!evaluateNode(entry, data, state)) return false;
  }
  return true;
}

function logicalOr(raw, data, state) {
  const values = arrayValues(raw);
  if (values.length === 0) reject('or requires at least one argument');
  for (const entry of values) {
    if (evaluateNode(entry, data, state)) return true;
  }
  return false;
}

function logicalNot(raw, data, state) {
  return !evaluateNode(exactArguments(raw, 1)[0], data, state);
}

function variableArguments(raw) {
  if (typeof raw === 'string') return [raw, undefined];
  const values = arrayValues(raw, 'var arguments');
  if (values.length < 1 || values.length > 2) reject('var requires a path and optional default');
  return values;
}

function safePropertyValue(target, segment) {
  if (FORBIDDEN_PATH_SEGMENTS.has(segment)) reject(`forbidden data path segment: ${segment}`);
  if (target === null || target === undefined) return { found: false };
  const descriptor = Object.getOwnPropertyDescriptor(Object(target), segment);
  if (!descriptor) return { found: false };
  if (!Object.hasOwn(descriptor, 'value')) reject('data accessor properties are forbidden');
  return { found: true, value: descriptor.value };
}

function readPath(data, path, fallback) {
  if (typeof path !== 'string') reject('var path must be a string');
  if (path === '') return data;
  const segments = path.split('.');
  if (segments.length > MAX_PATH_SEGMENTS) reject(`var path exceeds ${MAX_PATH_SEGMENTS} segments`);
  let current = data;
  for (const segment of segments) {
    const property = safePropertyValue(current, segment);
    if (!property.found) return fallback;
    current = property.value;
  }
  return current;
}

function variable(raw, data, state) {
  const [path, fallbackRule] = variableArguments(raw);
  const fallback = fallbackRule === undefined ? undefined : evaluateNode(fallbackRule, data, state);
  return readPath(data, path, fallback);
}

function contains(raw, data, state) {
  const [value, container] = evaluatedPair(raw, data, state);
  if (typeof container === 'string' && typeof value === 'string') return container.includes(value);
  if (Array.isArray(container)) return arrayValues(container, 'in container').some((entry) => entry === value);
  reject('in requires a string or array as its second argument');
}

const OPERATORS = Object.freeze({
  var: variable,
  '==': comparison((left, right) => left === right),
  '!=': comparison((left, right) => left !== right),
  '>': relationalComparison((left, right) => left > right),
  '>=': relationalComparison((left, right) => left >= right),
  '<': relationalComparison((left, right) => left < right),
  '<=': relationalComparison((left, right) => left <= right),
  and: logicalAnd,
  or: logicalOr,
  '!': logicalNot,
  in: contains
});

function evaluateRestrictedExpression(data, expression) {
  const rule = parseRule(expression);
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) reject('root rule must contain an operator');
  return Boolean(evaluateNode(rule, data, { nodes: 0, depth: 0 }));
}

module.exports = { GateExpressionError, evaluateRestrictedExpression };
