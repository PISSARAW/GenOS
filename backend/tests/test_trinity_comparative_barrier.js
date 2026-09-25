const assert = require('node:assert/strict');
const barrier = require('../src/services/trinityComparativeBarrier');

const workers = [
  { agentId: 'w1', role: 'basic_implementation', name: 'World 1' },
  { agentId: 'w2', role: 'interview_plan_implementation', name: 'World 2' },
  { agentId: 'w3', role: 'self_correcting_implementation', name: 'World 3' }
];
const members = [
  { role: 'basic_implementation' },
  { role: 'interview_plan_implementation' },
  { role: 'self_correcting_implementation' }
];
const dossiers = [
  { workerId: 'w1', events: [{ evidenceReport: { outcome: 'success', coverage: 0.95, claims: [{ statement: 'The integral equals sqrt(pi) by the polar coordinates trick.', evidence: ['derivation'], receipts: ['sig'] }] } }] },
  { workerId: 'w2', events: [{ evidenceReport: { outcome: 'success', claims: [{ statement: '[ ] [ ] [ ]' }] } }] },
  { workerId: 'w3', events: [] }
];

const reports = barrier.buildWorldReports(workers, dossiers, { members });
assert.equal(reports.length, 3);
assert.equal(reports[0].worldNumber, 1);
assert.equal(reports[0].role, 'basic_implementation');
assert.equal(reports[0].claims.length, 1);
assert.equal(reports[1].claims.length, 1);
assert.equal(reports[2].outcome, 'no_evidence');

assert.equal(barrier.latestReport(dossiers[0]).coverage, 0.95);
assert.equal(barrier.latestReport({ events: [{ failure: { category: 'runtime_failure' } }] }).outcome, 'failed');

(async () => {
  const autonomyPlan = { trinity: { activated: true, domain: 'software_engineering', members, threshold: 0.7 } };
  const result = await barrier.applyTrinityComparison({ db: null, agentId: 'orch-test', workers, usable: dossiers, autonomyPlan });
  assert.ok(result && typeof result.canMerge === 'boolean');
  assert.equal(result.canMerge, false);
  assert.equal(result.selectedWorld, null);
  assert.equal(result.outcome, 'ESCALATE_EXPERIMENT');
  assert.ok(result.comparativeAnalysis.scoredWorlds.length === 3);
  assert.equal(autonomyPlan.trinity.comparison.promotion.promoted, false);
  assert.equal(autonomyPlan.trinity.comparison.promotion.reason, 'database_unavailable');
  assert.equal(autonomyPlan.trinity.comparison.selectedWorld, null);

  const skipped = await barrier.applyTrinityComparison({ db: null, agentId: 'orch-test', workers, usable: dossiers, autonomyPlan: { trinity: { activated: false } } });
  assert.equal(skipped, null);
  console.log('Trinity comparative barrier checks: PASS');
})().catch((error) => {
  console.error('Trinity comparative barrier test failed:', error);
  process.exit(1);
});
