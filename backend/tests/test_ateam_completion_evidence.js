'use strict';

const assert = require('node:assert/strict');
const evidence = require('../src/services/aTeamCompletionEvidenceService');

const completion = { schema: 'genos.mission-completion/v1', missionId: 'orch-1',
  verdict: 'succeeded', success: true, requiredMemberIds: ['a', 'b'],
  completedMemberIds: ['a', 'b'], closureChecks: { requiredWorkers: true,
    invariants: true, independentOracle: true, evidence: true } };
const state = { status: 'COMPLETED', execution: { integration: { accepted: true, completion } } };

assert.equal(evidence.validCompletion(state), true);
assert.equal(evidence.validCompletion({ ...state, status: 'BLOCKED' }), false);

(async () => {
  const found = await evidence.latest({ all: async () => [
    { id: 'team-bad', state_json: JSON.stringify({ ...state, status: 'BLOCKED' }) },
    { id: 'team-good', state_json: JSON.stringify(state) }
  ] }, ['mission-1', 'orch-1']);
  assert.equal(found.teamRunId, 'team-good');
  assert.equal(found.completion.success, true);
  console.log('A-Team completion evidence is accepted only from a fully verified persisted closure.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
