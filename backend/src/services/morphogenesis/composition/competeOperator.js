'use strict';

const { createCompositionOperator, runCompete } = require('./compositionRuntime');

module.exports = createCompositionOperator('COMPETE', (children, context, config) => (
  runCompete(children, context, config.select)
));
