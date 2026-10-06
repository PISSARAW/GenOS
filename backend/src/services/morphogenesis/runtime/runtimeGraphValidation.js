'use strict';
const { validateMorphologyGraph } = require('../graph/morphologyGraphValidator');
const { checkGraph } = require('../graph/morphologyTypeChecker');
const { checkBudgets } = require('../graph/morphologyBudgetChecker');

function assertExecutableGraph(graph) {
  const structural = validateMorphologyGraph(graph);
  if (!structural.valid) throw new Error('Invalid morphology graph: ' + structural.errors.join('; '));
  const errors = [...checkGraph({ graph }).errors, ...checkBudgets({ graph }).errors];
  if (errors.length) throw new Error('Invalid executable morphology: ' + errors.join('; '));
}
module.exports = { assertExecutableGraph };
