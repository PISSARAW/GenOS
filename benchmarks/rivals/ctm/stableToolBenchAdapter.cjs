'use strict';

const adapter = require('./ctmDatasetAdapter.cjs');

function loadCases(options) {
  return adapter.loadCases({ ...options, datasetId: 'stable_tool_bench' });
}

module.exports = { loadCases };
