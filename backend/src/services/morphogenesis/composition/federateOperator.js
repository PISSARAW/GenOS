'use strict';

const { createCompositionOperator, runFederate } = require('./compositionRuntime');

module.exports = createCompositionOperator('FEDERATE', (children, context, config) => (
  runFederate(children, context, config.merge)
));
