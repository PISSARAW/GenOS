const assert = require('node:assert/strict');
const handoff = require('../src/services/aTeamHandoffEvidenceService');

const producer = { agentId: 'worker-a', subSystem: 'frontend', outputSchema: { type: 'object' } };
const consumer = { agentId: 'worker-b', subSystem: 'integration', dependsOn: ['frontend'], requiredArtifacts: ['dist/ui.js'], acceptanceCriteria: ['loads'] };
const plan = { members: [producer, consumer] };
const report = {
  outcome: 'success',
  artifacts: ['dist/ui.js'],
  claims: [{ statement: 'UI bundle built', evidence: ['build-log://123'] }],
  assumptions: ['browser runtime']
};
const dossiers = [{ workerId: 'worker-a', events: [{ evidenceReport: report }] }];

const ready = handoff.buildHandoffsFromDossiers({ plan, consumer, dossiers });
assert.equal(ready.ok, true);
assert.equal(ready.handoffs[0].type, 'DELIVERY');
assert.deepEqual(ready.handoffs[0].artifactRefs, [{ uri: 'dist/ui.js' }]);
assert.deepEqual(ready.handoffs[0].evidenceRefs, ['dist/ui.js', 'build-log://123']);
assert.match(handoff.missionWithHandoffs('integrate', ready.handoffs), /TYPED SPECIALIST HANDOFFS/);

const missing = handoff.buildHandoffsFromDossiers({
  plan, consumer, dossiers: [{ workerId: 'worker-a', events: [{ evidenceReport: { ...report, artifacts: [] } }] }]
});
assert.equal(missing.ok, false);
assert.equal(missing.missingDependency, 'frontend');

(async () => {
  const telemetry = await handoff.buildHandoffsFromTelemetry({
    db: { all: async () => [{ event_type: 'EVIDENCE_REPORT', payload_json: JSON.stringify(report) }] },
    plan, consumer
  });
  assert.equal(telemetry.ok, true);
  assert.equal(telemetry.handoffs[0].consumer.agentId, 'worker-b');
  console.log('A-Team handoffs carry validated typed evidence from dossiers and telemetry.');
})().catch((error) => { console.error(error); process.exit(1); });
