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
  testTeamEvidenceRepairObligation(); runNativeSuites();
  console.log('GQEL V2.1 native contracts, runtime, receipts, coordination and final artifact: PASS');
}

function runNativeSuites() {
  const suites = ['test_gqel_native_contracts.cjs', 'test_gqel_native_runtime.cjs', 'test_gqel_native_provider.cjs',
    'test_gqel_native_code_scope.cjs', 'test_gqel_quality_receipts.cjs', 'test_gqel_code_receipts.cjs',
    'test_gqel_native_receipts.cjs', 'test_gqel_team_receipts.cjs', 'test_ateam_gqel_coordination.cjs', 'test_gqel_final_artifact.cjs',
    'test_gqel_final_synthesis.cjs', 'test_gqel_final_execution.cjs'];
  for (const suite of suites) require('node:child_process').execFileSync(process.execPath,
    [require('node:path').join(__dirname, suite)], { stdio: 'inherit', timeout: 300000 });
}
main().catch(error => { console.error(error); process.exitCode = 1; });
