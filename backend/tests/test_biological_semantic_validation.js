'use strict';

const assert = require('node:assert/strict');
const validation = require('../src/services/biologicalSemanticValidationService');

async function main() {
  const reports = {
    a: { semanticClaims: [{ subject: 'avatar', predicate: 'required', value: true, evidence: ['contract:2'] }] },
    b: { semanticClaims: [{ subject: 'avatar', predicate: 'required', value: 'optional', evidence: ['contract:3'] }] }
  };
  const db = { get: async (_query, workerId) => ({ payload_json: JSON.stringify(reports[workerId]) }) };
  const result = await validation.validate(db, [{ workerId: 'a' }, { workerId: 'b' }]);
  assert.equal(result.status, 'conflicts_detected');
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].resolved, false);
  assert.equal(result.conflicts[0].left.evidence[0], 'contract:2');

  const partialDb = { get: async (_query, workerId) => workerId === 'a'
    ? { payload_json: JSON.stringify(reports.a) } : null };
  const partial = await validation.validate(partialDb, [{ workerId: 'a' }, { workerId: 'b' }]);
  assert.equal(partial.status, 'incomplete');
  assert.equal(partial.coveredWorkers, 1);

  const unsupportedDb = { get: async () => ({ payload_json: JSON.stringify({
    semanticClaims: [null, { subject: 'avatar', predicate: 'required', value: true }],
  }) }) };
  const unsupported = await validation.validate(unsupportedDb, [{ workerId: 'a' }]);
  assert.equal(unsupported.status, 'incomplete');
  assert.equal(unsupported.coveredWorkers, 0);
  const empty = await validation.validate(db, []);
  assert.equal(empty.status, 'incomplete');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
