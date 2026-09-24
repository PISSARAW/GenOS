'use strict';

const { createCompositionOperator, runWrap } = require('./compositionRuntime');

module.exports = createCompositionOperator('WRAP', (children, context, config) => (
  runWrap(children[0], context, config.environment)
));
