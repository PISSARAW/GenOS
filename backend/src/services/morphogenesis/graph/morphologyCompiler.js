'use strict';

const { validateExpression } = require('../expression/morphologyExpressionSchema');
const { normalizeExpression } = require('../expression/morphologyExpressionNormalizer');
const { annotateWithDefaults } = require('../expression/morphologyExpressionDefaults');
const { flattenExpression } = require('../expression/morphologyExpressionFlattener');
const { createMorphologyGraph } = require('./morphologyGraph');
const { validateMorphologyGraph } = require('./morphologyGraphValidator');
const { checkGraph } = require('./morphologyTypeChecker');
const { checkBudgets } = require('./morphologyBudgetChecker');

function compile(input) {
  const normalized = normalizeInput(input);
  const annotated = annotateWithDefaults(normalized.expression, normalized.defaults);
  const flattened = flattenExpression(annotated);
  const graph = createMorphologyGraph(buildGraphInput(normalized, flattened));
  assertValid(graph);
  return graph;
}

function normalizeInput(input) {
  if (!input || !input.expression) throw new Error('compile requires an expression');
  const options = input.options || {};
  return {
    expression: input.expression,
    defaults: {
      mission: options.mission || null,
      scope: options.scope || 'mission',
      budget: options.globalBudget || {}
    },
    identity: {
      graphId: options.graphId,
      missionId: options.missionId,
      version: options.version || 1,
      status: options.status || 'proposed',
      globalBudget: options.globalBudget || {},
      globalInvariants: options.globalInvariants || []
    }
  };
}

function buildGraphInput(normalized, flattened) {
  return {
    graphId: normalized.identity.graphId,
    missionId: normalized.identity.missionId,
    version: normalized.identity.version,
    status: normalized.identity.status,
    globalBudget: normalized.identity.globalBudget,
    globalInvariants: normalized.identity.globalInvariants,
    nodes: flattened.nodes,
    edges: flattened.edges
  };
}

function assertValid(graph) {
  failOn(validateExpressionShallow(graph));
  failOn(validateMorphologyGraph(graph));
  failOn(checkGraph({ graph }));
  failOn(checkBudgets({ graph }));
}

function validateExpressionShallow() {
  return { valid: true, errors: [] };
}

function failOn(result) {
  if (!result.valid) throw new Error(`Morphology compilation failed: ${result.errors.join('; ')}`);
}

function compileExpression(expression, options = {}) {
  const validation = validateExpression(normalizeExpression(expression));
  if (!validation.valid) throw new Error(`Invalid expression: ${validation.errors.join('; ')}`);
  return compile({ expression, options });
}

module.exports = { compile, compileExpression };
