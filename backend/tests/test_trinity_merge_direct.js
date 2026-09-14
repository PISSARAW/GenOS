const assert = require('node:assert/strict');
const barrier = require('../src/services/trinityComparativeBarrier');
const trinityService = require('../src/services/trinityService');

const worlds = [
  { world_number: 1, strategy: 'basic_implementation', agent_id: 'w1', status: 'completed' },
  { world_number: 2, strategy: 'interview_plan_implementation', agent_id: 'w2', status: 'completed' },
  { world_number: 3, strategy: 'self_correcting_implementation', agent_id: 'w3', status: 'running' }
];
const telemetry = {
  w1: [{ payload_json: JSON.stringify({ evidenceReport: { outcome: 'success', coverage: 0.9, claims: [{ statement: 'World 1 verified the exact result sqrt(pi) with a reproducible derivation.', evidence: ['derivation'] }] } }) }],
  w2: [{ payload_json: JSON.stringify({ evidenceReport: { outcome: 'success', claims: [{ statement: '[ ] [ ]' }] } }) }],
  w3: []
};
const fakeDb = { all: async (sql, ...params) => (/FROM trinity_worlds/.test(sql) ? worlds : (telemetry[params[0]] || [])) };

(async () => {
  const reports = await barrier.buildWorldReportsFromMission(fakeDb, 'mission-1');
  assert.equal(reports.length, 3);
  assert.equal(reports[0].role, 'basic_implementation');
  assert.equal(reports[0].claims.length, 1);
  assert.equal(reports[1].claims.length, 1);
  assert.equal(reports[2].outcome, 'no_evidence');

  const merged = trinityService.mergeTrinityEvidence(reports, { domain: 'software_engineering', threshold: 0.7 });
  assert.equal(merged.canMerge, true);
  assert.equal(merged.selectedWorld, 1);
  console.log('Trinity direct merge dossier build: PASS');
})().catch((error) => {
  console.error('Trinity direct merge test failed:', error);
  process.exit(1);
});
