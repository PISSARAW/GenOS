'use strict';

const { createExpression } = require('./morphologyExpression');
const { parseExpression } = require('./morphologyExpressionParser');

const PREFIXES = {
  NEST: 'NEST(',
  PARALLEL: 'PARALLEL(',
  SEQUENCE: 'SEQUENCE(',
  GATE: 'GATE(',
  COMPETE: 'COMPETE(',
  WRAP: 'WRAP(',
  BRIDGE: 'BRIDGE(',
  FEDERATE: 'FEDERATE('
};

function parseShorthand(str) {
  const trimmed = str.trim();
  for (const [kind, prefix] of Object.entries(PREFIXES)) {
    if (trimmed.startsWith(prefix)) return SHORTHAND_PARSERS[kind](trimmed);
  }
  return parseTopologyShorthand(trimmed);
}

const SHORTHAND_PARSERS = {
  NEST: parseNestShorthand,
  PARALLEL: parseParallelShorthand,
  SEQUENCE: parseSequenceShorthand,
  GATE: parseGateShorthand,
  COMPETE: parseCompeteShorthand,
  WRAP: parseWrapShorthand,
  BRIDGE: parseBridgeShorthand,
  FEDERATE: parseFederateShorthand
};

function parseTopologyShorthand(str) {
  const parts = str.split(':');
  return createExpression({ kind: 'TOPOLOGY', topology: parts[0].trim(), variant: parts[1]?.trim() || null, nodeKind: 'TOPOLOGY' });
}

function parseNestShorthand(str) {
  const content = extractParenContent(str, 'NEST(');
  const [hostStr, innerStr] = splitTopLevel(content, 2);
  return createExpression({ kind: 'NEST', host: parseExpression(hostStr.trim()), inner: parseExpression(innerStr.trim()), nodeKind: 'OPERATOR' });
}

function parseParallelShorthand(str) {
  const content = extractParenContent(str, 'PARALLEL(');
  return createExpression({ kind: 'PARALLEL', children: splitTopLevel(content).map(s => parseExpression(s.trim())), nodeKind: 'OPERATOR' });
}

function parseSequenceShorthand(str) {
  const content = extractParenContent(str, 'SEQUENCE(');
  return createExpression({ kind: 'SEQUENCE', children: splitTopLevel(content).map(s => parseExpression(s.trim())), nodeKind: 'OPERATOR' });
}

function parseGateShorthand(str) {
  const content = extractParenContent(str, 'GATE(');
  const [condStr, thenStr, elseStr] = splitTopLevel(content, 3);
  return createExpression({ kind: 'GATE', condition: parseExpression(condStr.trim()), thenBranch: parseExpression(thenStr.trim()), elseBranch: parseExpression(elseStr.trim()), nodeKind: 'GATE' });
}

function parseCompeteShorthand(str) {
  const content = extractParenContent(str, 'COMPETE(');
  return createExpression({ kind: 'COMPETE', children: splitTopLevel(content).map(s => parseExpression(s.trim())), nodeKind: 'OPERATOR' });
}

function parseWrapShorthand(str) {
  const content = extractParenContent(str, 'WRAP(');
  const [innerStr, envStr] = splitTopLevel(content, 2);
  return createExpression({ kind: 'WRAP', inner: parseExpression(innerStr.trim()), environment: parseEnvironment(envStr.trim()), nodeKind: 'ENVIRONMENT' });
}

function parseBridgeShorthand(str) {
  const content = extractParenContent(str, 'BRIDGE(');
  const [srcStr, tgtStr, adpStr] = splitTopLevel(content, 3);
  return createExpression({ kind: 'BRIDGE', source: parseExpression(srcStr.trim()), target: parseExpression(tgtStr.trim()), adapter: parseAdapter(adpStr.trim()), nodeKind: 'ADAPTER' });
}

function parseFederateShorthand(str) {
  const content = extractParenContent(str, 'FEDERATE(');
  return createExpression({ kind: 'FEDERATE', members: splitTopLevel(content).map(s => parseExpression(s.trim())), nodeKind: 'OPERATOR' });
}

function parseEnvironment(str) {
  try { return JSON.parse(str); } catch { return { name: str }; }
}

function parseAdapter(str) {
  try { return JSON.parse(str); } catch { return { name: str }; }
}

function extractParenContent(str, prefix) {
  if (!str.startsWith(prefix)) throw new Error(`Expected ${prefix}`);
  const content = str.slice(prefix.length, -1);
  if (!content.endsWith(')')) throw new Error('Unclosed parenthesis');
  return content.slice(0, -1);
}

function splitTopLevel(str, expectedCount = null) {
  const parts = [];
  let depth = 0, start = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) { parts.push(str.slice(start, i)); start = i + 1; }
  }
  parts.push(str.slice(start));
  if (expectedCount && parts.length !== expectedCount) throw new Error(`Expected ${expectedCount} arguments, got ${parts.length}`);
  return parts;
}

module.exports = { parseShorthand };