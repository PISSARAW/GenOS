const assert = require('node:assert/strict');
const handoff = require('../src/services/aTeamHandoffEvidenceService');

const producer = { agentId: 'worker-a', subSystem: 'frontend', outputSchema: { type: 'object' } };
const consumer = { agentId: 'worker-b', subSystem: 'integration', dependsOn: ['frontend'], requiredArtifacts: ['dist/ui.js'], acceptanceCriteria: ['loads'] };
const plan = { members: [producer, consumer] };
const report = {
  outcome: 'success',
  output: 'dist/ui.js',
  workerArtifact: { content: { text: 'A complete original song' } },
  artifacts: ['dist/ui.js'],
  claims: [{ statement: 'UI bundle built', evidence: ['build-log://123'] }],
  assumptions: ['browser runtime']
};
const dossiers = [{ workerId: 'worker-a', events: [{ evidenceReport: report }] }];

const ready = handoff.buildHandoffsFromDossiers({ plan, consumer, dossiers });
assert.equal(ready.ok, true);
assert.equal(ready.handoffs[0].type, 'DELIVERY');
assert.deepEqual(ready.handoffs[0].artifactRefs, [{ uri: 'dist/ui.js' }]);
const completedCommit = 'git:' + 'c'.repeat(40);
const commitHandoff = handoff.handoffForDossier({ producer, consumer, dossier: { workerId: 'worker-a', events: [{
  evidenceReport: { ...report, artifacts: ['dist/ui.js', 'src/site.js', 'test/public-contract.cjs'],
    scopeCompletion: { scopeRef: 'mission/quality', completedRefs: [completedCommit] } }
}] } });
assert(commitHandoff, 'a verified dossier with a committed scope can produce a typed handoff');
assert(commitHandoff.artifactRefs.some((artifact) => artifact.uri === completedCommit),
  'the commit receipt in scopeCompletion must use the git handoff URI format');
const bareCommit = handoff.handoffForDossier({ producer, consumer, dossier: { workerId: 'worker-a', events: [{
  evidenceReport: { ...report, scopeCompletion: { scopeRef: 'mission/quality', completedRefs: ['d'.repeat(40)] } }
}] } });
assert(bareCommit.artifactRefs.some((artifact) => artifact.uri === `git:${'d'.repeat(40)}`),
  'bare commit receipts must be normalized before isolated workspace materialization');
assert.deepEqual(ready.handoffs[0].artifactPayload, report.workerArtifact.content);
assert.deepEqual(ready.handoffs[0].evidenceRefs, ['dist/ui.js', 'build-log://123']);
const handoffMission = handoff.missionWithHandoffs('integrate', ready.handoffs);
assert.match(handoffMission, /TYPED SPECIALIST HANDOFFS/);
assert.match(handoffMission, /A complete original song/);
assert.deepEqual(handoff.usableEvidenceReferences({ handoffEvaluations: [
  { passed: true, evidenceRefs: ['handoff://accepted'] },
  { passed: false, evidenceRefs: ['handoff://rejected'] }
] }), ['handoff://accepted']);

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
  const store = require('../src/services/biologicalWorkerStore');
  const original = store.observations;
  store.observations = async () => [{ event: {
    eventType: 'EVIDENCE_REPORT', action: 'VERIFY_CLAIMS', detail: 'durable report',
    payload: { evidenceReport: report }
  }, applied: true }];
  try {
    const recovered = await handoff.telemetryDossier({
      all: async () => [], get: async () => ({ id: 'run-durable' })
    }, 'worker-a');
    assert.equal(recovered.events[0].evidenceReport.outcome, 'success');
    assert.equal(recovered.events[0].detail, 'durable report');
  } finally {
    store.observations = original;
  }
  console.log('A-Team handoffs carry validated typed evidence from dossiers and telemetry.');
})().catch((error) => { console.error(error); process.exit(1); });
