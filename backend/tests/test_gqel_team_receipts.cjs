'use strict';
process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'gqel-team-receipt-fixture-only';
const assert = require('node:assert/strict');
const { create } = require('./helpers/qualityReceiptFixture.cjs');
const { issueQualityReceipt } = require('../src/services/qualityElevation/qualityReceiptService');
const { validateMemberEvidence } = require('../src/services/aTeam/execution/teamEvidenceService');
const { handoffForDossier } = require('../src/services/aTeamHandoffEvidenceService');

function dossier(ctx, report) { return { events: [{ executionRunId: ctx.executionRunId, evidenceReport: report }] }; }

async function run() {
  const ctx = await create();
  try {
    const member = { workerId: ctx.worker.agentId, agentId: ctx.worker.agentId,
      qualityElevation: ctx.worker.workerContract.qualityElevation, acceptanceCriteria: ['complete-scene'] };
    const base = { outcome: 'success', output: ctx.text,
      claims: [{ statement: 'Fictional scene produced.', evidence: ['mission'] }],
      acceptanceEvaluations: [{ criterion: 'complete-scene', passed: true, evidenceRefs: ['mission'] }] };
    const forged = validateMemberEvidence(member, dossier(ctx, base));
    assert.equal(forged.promoted, false);
    assert.equal(forged.reason, 'quality_elevation_unverified');
    assert.equal(forged.repairObligation, undefined);
    const qualityElevationReceipt = await issueQualityReceipt(ctx);
    const report = { ...base, qualityElevationReceipt };
    assert.equal(validateMemberEvidence(member, dossier(ctx, report)).promoted, true);
    const replay = validateMemberEvidence({ ...member, executionRunId: 'another-run' }, dossier(ctx, report));
    assert.equal(replay.promoted, false);
    assert.deepEqual(replay.details, ['GQEL_RECEIPT_SCOPE_MISMATCH']);
    const withoutRun = validateMemberEvidence(member, { events: [{ evidenceReport: report }] });
    assert.equal(withoutRun.promoted, false);
    const criteriaFailure = validateMemberEvidence(member, dossier(ctx, { ...report, acceptanceEvaluations: [] }));
    assert.equal(criteriaFailure.reason, 'acceptance_criteria_unverified');
    assert.equal(criteriaFailure.repairObligation.status, 'pending_repair');
    const consumer = { agentId: 'consumer', inputArtifacts: [] };
    const handoff = handoffForDossier({ producer: member, consumer, dossier: dossier(ctx, report) });
    assert.ok(handoff, 'A valid signed receipt must survive the handoff helper.');
    console.log('GQEL A-Team receipt gate: fabricated success denied, signed success accepted, replay/missing scope denied, acceptance repair and handoff preserved PASS.');
  } finally { await ctx.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
