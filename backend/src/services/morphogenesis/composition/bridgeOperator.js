'use strict';

const { createCompositionOperator, runBridge } = require('./compositionRuntime');

module.exports = createCompositionOperator('BRIDGE', (children, context, config) => (
  runBridge(children, context, config.adapter)
));
