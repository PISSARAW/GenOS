'use strict';

function select(rootWorkspace) {
  if (process.env.GENOS_COMPLIANCE_PROCEDURAL_SUBSET === '1') {
    return require('./nativeWorkerFixtures').fixtures(rootWorkspace).procedural_executor;
  }
  return { version: 1, methodId: 'lpt', parameters: {
    jobs: [{ id: 'A', duration: 5 }, { id: 'B', duration: 4 }, { id: 'C', duration: 3 }], machines: 2
  } };
}

module.exports = { select };
