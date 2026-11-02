'use strict';
const assert = require('node:assert/strict');
const { run } = require('./test_gqel_v2.cjs');
const { createRepairObligation, validateMemberEvidence } = require('../src/services/aTeam/execution/teamEvidenceService');
// Preserve the native integration assertion; run on the complete GenOS checkout.
function testTeamEvidenceRepairObligation() {
  const member = { memberId: 'writer-1', acceptanceCriteria: ['criterion-A', 'criterion-B'] };
  const obligation = createRepairObligation(member, ['criterion-B']);
  assert.equal(obligation.memberId, 'writer-1'); assert.equal(obligation.status, 'pending_repair');
  assert.deepEqual(obligation.unverifiedCriteria, ['criterion-B']);
  const dossier = { events: [{ evidenceReport: { outcome: 'success', claims: [{ statement: 'done', evidence: ['ev-1'] }],
    acceptanceEvaluations: [{ criterion: 'criterion-A', passed: true, evidenceRefs: ['ev-1'] }] } }] };
  const verdict = validateMemberEvidence(member, dossier);
  assert.equal(verdict.promoted, false); assert.equal(verdict.reason, 'acceptance_criteria_unverified');
  assert.ok(verdict.repairObligation); assert.deepEqual(verdict.repairObligation.unverifiedCriteria, ['criterion-B']);
}
async function main() {
  await run(); await require('./test_gqel_progress.cjs').run();
  testTeamEvidenceRepairObligation(); console.log('GQEL V2.1 plus A-Team repair-obligation integration: PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
