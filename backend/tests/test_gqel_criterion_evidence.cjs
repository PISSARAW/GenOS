'use strict';
process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'criterion-evidence-fixture-only';
const assert = require('node:assert/strict');
const fixture = require('./helpers/qualityReceiptFixture.cjs');
const evidence = require('../src/services/qualityElevation/qualityCriterionEvidence');
const { workerResponseFormat } = require('../src/services/workerEvidenceIdentityPrompt');
const { missingMissionCriteria } = require('../src/services/aTeam/execution/teamEvidenceService');
const { usableEvidenceReferences } = require('../src/services/aTeamHandoffEvidenceService');

async function main() {
  const ctx = await fixture.create();
  try {
    const mission = { ...ctx.worker, missionCriteria: ['brief_coverage', 'not_reviewed'] };
    const report = { outcome: 'success', claims: [{ statement: 'Candidate written.', evidence: ['mission'] }],
      acceptanceEvaluations: [{ criterion: 'not_reviewed', passed: true, evidenceRefs: ['mission'] }],
      workerArtifact: { type: 'creative_candidate', content: { candidate: ctx.text,
        assumptions: ['Synthetic test.'], falsificationTest: 'Compare to the rubric.' } } };
    const format = workerResponseFormat(mission);
    assert.ok(!format.schema.required.includes('acceptanceEvaluations'));
    assert.ok(workerResponseFormat({ workerKind: 'creative_worker', missionCriteria: ['brief_coverage'] })
      .schema.required.includes('acceptanceEvaluations'));
    report.qualityElevationReceipt = await require('../src/services/qualityElevation/qualityReceiptService')
      .issueQualityReceipt({ ...ctx, artifact: report.workerArtifact, report });
    evidence.attach(mission, report);
    assert.equal(report.acceptanceEvaluations[0].passed, true);
    assert.equal(report.acceptanceEvaluations[1].passed, null, 'self-certified unknown criteria must remain unverified');
    assert.equal(report.reportedAcceptanceEvaluations[0].passed, true);
    const references = usableEvidenceReferences(report);
    assert.ok(references.some(ref => ref.startsWith('genos://quality-receipt/')));
    const verdicts = new Map([['worker', { promoted: true, report, evidenceRefs: references }]]);
    assert.deepEqual(missingMissionCriteria(mission.missionCriteria, verdicts), ['not_reviewed']);
    const unissued = { ...report, qualityElevationReceipt: { ...report.qualityElevationReceipt, signature: '0'.repeat(64) } };
    assert.throws(() => evidence.attach(mission, unissued), { code: 'GQEL_RECEIPT_INVALID' });
    console.log('Mission criteria derive from authenticated independent GQEL checks while uncovered criteria and forged reviews remain unresolved: PASS');
  } finally { await ctx.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
