const assert = require('node:assert/strict');
const search = require('../src/services/primitiveHandlers/search');

Promise.resolve()
  .then(() => search.prmEvaluate({ invariants: ['must be true'] }))
  .then((result) => assert.equal(result.success, false))
  .then(() => search.prmEvaluate({ invariants: [{ id: 'checked', passed: true }] }))
  .then((result) => assert.equal(result.success, true))
  .then(() => console.log('PRM evidence contract checks passed.'))
  .catch((error) => { console.error(error); process.exitCode = 1; });