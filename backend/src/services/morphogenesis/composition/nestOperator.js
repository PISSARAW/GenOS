'use strict';

const { createCompositionOperator, runNest } = require('./compositionRuntime');

module.exports = createCompositionOperator('NEST', (children, context) => runNest(children, context));
