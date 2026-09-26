'use strict';

const { createExpression } = require('./morphologyExpression');
const { validateExpression } = require('./morphologyExpressionSchema');
const { parseShorthand } = require('./morphologyExpressionShorthand');

function parseExpression(input) {
  if (!input || typeof input !== 'object') throw new Error('Expression input must be an object');
  if (input.expressionId && input.kind) return validateAndReturn(input);
  if (typeof input === 'string') return parseShorthand(input);
  return parseStructured(input);
}

function validateAndReturn(expr) {
  const validation = validateExpression(expr);
  if (!validation.valid) throw new Error(`Invalid expression: ${validation.errors.join('; ')}`);
  return expr;
}

function parseStructured(obj) {
  const kind = obj.kind || obj.type;
  if (!kind) throw new Error('Expression must have a kind field');
  const normalizedKind = String(kind).toUpperCase();

  const base = { kind: normalizedKind, scope: obj.scope, mission: obj.mission, budget: obj.budget || {}, metadata: obj.metadata || {} };

  const parser = STRUCTURED_PARSERS[normalizedKind];
  if (!parser) throw new Error(`Unknown expression kind: ${kind}`);
  return parser(obj, base);
}

const STRUCTURED_PARSERS = {
  TOPOLOGY: (obj, base) => createExpression({ ...base, topology: obj.topology || obj.name, variant: obj.variant, nodeKind: 'TOPOLOGY', ports: obj.ports }),
  TOPOLOGY_EXPRESSION: (obj, base) => createExpression({ ...base, topology: obj.topology || obj.name, variant: obj.variant, nodeKind: 'TOPOLOGY', ports: obj.ports }),
  NEST: (obj, base) => requireHostInner(obj, base, (host, inner) => createExpression({ ...base, host: parseExpression(host), inner: parseExpression(inner), nodeKind: 'OPERATOR' })),
  NEST_EXPRESSION: (obj, base) => requireHostInner(obj, base, (host, inner) => createExpression({ ...base, host: parseExpression(host), inner: parseExpression(inner), nodeKind: 'OPERATOR' })),
  PARALLEL: (obj, base) => requireChildren(obj, base, children => createExpression({ ...base, children: children.map(parseExpression), nodeKind: 'OPERATOR' })),
  PARALLEL_EXPRESSION: (obj, base) => requireChildren(obj, base, children => createExpression({ ...base, children: children.map(parseExpression), nodeKind: 'OPERATOR' })),
  SEQUENCE: (obj, base) => requireChildren(obj, base, children => createExpression({ ...base, children: children.map(parseExpression), nodeKind: 'OPERATOR' })),
  SEQUENCE_EXPRESSION: (obj, base) => requireChildren(obj, base, children => createExpression({ ...base, children: children.map(parseExpression), nodeKind: 'OPERATOR' })),
  GATE: (obj, base) => requireCondBranches({ obj, base }, (c, t, e) => createExpression({ ...base, condition: parseExpression(c), thenBranch: parseExpression(t), elseBranch: parseExpression(e), nodeKind: 'GATE' })),
  GATE_EXPRESSION: (obj, base) => requireCondBranches({ obj, base }, (c, t, e) => createExpression({ ...base, condition: parseExpression(c), thenBranch: parseExpression(t), elseBranch: parseExpression(e), nodeKind: 'GATE' })),
  IF: (obj, base) => requireCondBranches({ obj, base }, (c, t, e) => createExpression({ ...base, condition: parseExpression(c), thenBranch: parseExpression(t), elseBranch: parseExpression(e), nodeKind: 'GATE' })),
  CONDITIONAL: (obj, base) => requireCondBranches({ obj, base }, (c, t, e) => createExpression({ ...base, condition: parseExpression(c), thenBranch: parseExpression(t), elseBranch: parseExpression(e), nodeKind: 'GATE' })),
  COMPETE: (obj, base) => requireMinCh({ obj, base, min: 2 }, children => createExpression({ ...base, children: children.map(parseExpression), nodeKind: 'OPERATOR' })),
  COMPETE_EXPRESSION: (obj, base) => requireMinCh({ obj, base, min: 2 }, children => createExpression({ ...base, children: children.map(parseExpression), nodeKind: 'OPERATOR' })),
  COMPETITION: (obj, base) => requireMinCh({ obj, base, min: 2 }, children => createExpression({ ...base, children: children.map(parseExpression), nodeKind: 'OPERATOR' })),
  WRAP: (obj, base) => requireInnerEnv({ obj, base }, (inner, env) => createExpression({ ...base, inner: parseExpression(inner), environment: parseEnvObj(env), nodeKind: 'ENVIRONMENT' })),
  WRAP_EXPRESSION: (obj, base) => requireInnerEnv({ obj, base }, (inner, env) => createExpression({ ...base, inner: parseExpression(inner), environment: parseEnvObj(env), nodeKind: 'ENVIRONMENT' })),
  ENVIRONMENT: (obj, base) => requireInnerEnv({ obj, base }, (inner, env) => createExpression({ ...base, inner: parseExpression(inner), environment: parseEnvObj(env), nodeKind: 'ENVIRONMENT' })),
  BRIDGE: (obj, base) => requireSrcTgtAdp({ obj, base }, (s, t, a) => createExpression({ ...base, source: parseExpression(s), target: parseExpression(t), adapter: parseAdp(a), nodeKind: 'ADAPTER' })),
  BRIDGE_EXPRESSION: (obj, base) => requireSrcTgtAdp({ obj, base }, (s, t, a) => createExpression({ ...base, source: parseExpression(s), target: parseExpression(t), adapter: parseAdp(a), nodeKind: 'ADAPTER' })),
  ADAPTER: (obj, base) => requireSrcTgtAdp({ obj, base }, (s, t, a) => createExpression({ ...base, source: parseExpression(s), target: parseExpression(t), adapter: parseAdp(a), nodeKind: 'ADAPTER' })),
  FEDERATE: (obj, base) => requireMinMem({ obj, base, min: 2 }, (members, quorum) => createExpression({ ...base, members: members.map(parseExpression), quorum, nodeKind: 'OPERATOR' })),
  FEDERATE_EXPRESSION: (obj, base) => requireMinMem({ obj, base, min: 2 }, (members, quorum) => createExpression({ ...base, members: members.map(parseExpression), quorum, nodeKind: 'OPERATOR' })),
  FEDERATION: (obj, base) => requireMinMem({ obj, base, min: 2 }, (members, quorum) => createExpression({ ...base, members: members.map(parseExpression), quorum, nodeKind: 'OPERATOR' }))
};

function requireHostInner({ obj, base }, fn) { if (!obj.host || !obj.inner) throw new Error('NEST requires host and inner'); return fn(obj.host, obj.inner); }
function requireChildren({ obj, base }, fn) { if (!Array.isArray(obj.children) || obj.children.length === 0) throw new Error(`${base.kind} requires non-empty children array`); return fn(obj.children); }
function requireMinCh({ obj, base, min }, fn) { if (!Array.isArray(obj.children) || obj.children.length < min) throw new Error(`${base.kind} requires at least ${min} children`); return fn(obj.children); }
function requireCondBranches({ obj, base }, fn) { if (!obj.condition || !obj.thenBranch || !obj.elseBranch) throw new Error('GATE requires condition, thenBranch, and elseBranch'); return fn(obj.condition, obj.thenBranch, obj.elseBranch); }
function requireInnerEnv({ obj, base }, fn) { if (!obj.inner || !obj.environment) throw new Error('WRAP requires inner and environment'); return fn(obj.inner, obj.environment); }
function requireSrcTgtAdp({ obj, base }, fn) { if (!obj.source || !obj.target || !obj.adapter) throw new Error('BRIDGE requires source, target, and adapter'); return fn(obj.source, obj.target, obj.adapter); }
function requireMinMem({ obj, base, min }, fn) { if (!Array.isArray(obj.members) || obj.members.length < min) throw new Error(`${base.kind} requires at least ${min} members`); return fn(obj.members, obj.quorum); }

function parseEnvObj(env) { return typeof env === 'string' ? { name: env } : env; }
function parseAdp(adapter) { return typeof adapter === 'string' ? { name: adapter } : adapter; }

function parseFromJSON(jsonString) { return parseExpression(JSON.parse(jsonString)); }

module.exports = { parseExpression, parseStructured, parseShorthand, parseFromJSON };