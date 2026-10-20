'use strict';

const assert = require('node:assert/strict');
const validation = require('../src/services/biologicalSemanticValidationService');
const fixture = require('./helpers/authoritativeEvidenceFixture');

async function main() {
  const reports = {
    a: { semanticClaims: [{ subject: 'avatar', predicate: 'required', value: true, evidence: ['contract:2'] }] },
    b: { semanticClaims: [{ subject: 'avatar', predicate: 'required', value: 'optional', evidence: ['contract:3'] }] }
  };
  const missionId = 'semantic-mission';
  const db = fixture.database([
    fixture.record({ workerId: 'a', missionId, runId: 'run-a', report: reports.a }),
    fixture.record({ workerId: 'b', missionId, runId: 'run-b', report: reports.b })
  ]);
  const result = await validation.validate(db, { members: [{ workerId: 'a' }, { workerId: 'b' }], missionId });
  assert.equal(result.status, 'conflicts_detected');
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].resolved, false);
  assert.equal(result.conflicts[0].left.evidence[0], 'contract:2');

  const partialDb = fixture.database([
    fixture.record({ workerId: 'a', missionId, runId: 'partial-a', report: reports.a })
  ]);
  const partial = await validation.validate(partialDb,
    { members: [{ workerId: 'a' }, { workerId: 'b' }], missionId });
  assert.equal(partial.status, 'incomplete');
  assert.equal(partial.coveredWorkers, 1);

  const unsupportedReport = { semanticClaims: [null,
    { subject: 'avatar', predicate: 'required', value: true }] };
  const unsupportedDb = fixture.database([
    fixture.record({ workerId: 'a', missionId, runId: 'unsupported-a', report: unsupportedReport })
  ]);
  const unsupported = await validation.validate(unsupportedDb, { members: [{ workerId: 'a' }], missionId });
  assert.equal(unsupported.status, 'incomplete');
  assert.equal(unsupported.coveredWorkers, 0);
  const empty = await validation.validate(db, { members: [], missionId });
  assert.equal(empty.status, 'incomplete');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
