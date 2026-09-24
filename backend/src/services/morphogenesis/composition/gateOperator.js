'use strict';

const { createCompositionOperator, runGate } = require('./compositionRuntime');

module.exports = createCompositionOperator('GATE', (children, context, config) => (
  runGate(children, context, config)
));
