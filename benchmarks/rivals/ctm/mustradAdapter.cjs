'use strict';

const adapter = require('./ctmDatasetAdapter.cjs');

function loadCases(options) {
  return adapter.loadCases({ ...options, datasetId: 'mustrad' });
}

module.exports = { loadCases };
