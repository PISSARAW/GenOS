'use strict';

const adapter = require('./ctmDatasetAdapter.cjs');

function loadCases(options) {
  return adapter.loadCases({ ...options, datasetId: 'webarena_lite' });
}

module.exports = { loadCases };
