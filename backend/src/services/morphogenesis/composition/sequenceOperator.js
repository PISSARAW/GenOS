'use strict';

const { createCompositionOperator, runSequence } = require('./compositionRuntime');

module.exports = createCompositionOperator('SEQUENCE', (children, context, config) => (
  runSequence(children, context, config.gates || [])
));
