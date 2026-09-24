'use strict';

const { createCompositionOperator, runParallel } = require('./compositionRuntime');

module.exports = createCompositionOperator('PARALLEL', (children, context) => runParallel(children, context));
