'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET ||= 'isolated-metacognitive-runtime';
const assert = require('node:assert/strict');
const { openDatabase } = require('./helpers/biologyDatabase');
const { workerSchema, addWorker, completion } = require('./helpers/biologicalWorkerFixture');
const execution = require('../src/services/strategyExecutionService');
const forecasts = require('../src/services/metacognitiveForecastService');
const negative = require('../src/services/terminalOutcomeEvidence');
const validation = require('../src/services/morphogenesis/learning/outcomeEvidenceValidation');

function failure(runId) {
  const event = completion(runId, { eventType: 'AGENT_FAILED' });
  const evidence = { status: 'VERIFIED', kind: 'deterministic_verifier', receiptId: 'runtime-oracle:' + runId,
    actionId: runId, agentId: 'worker', organizationId: 'org', projectId: 'project', success: false, value: 0,
    learningContext: { schema: negative.NEGATIVE_OUTCOME_SCHEMA, eventType: event.eventType,
      terminalEventHash: negative.terminalEventHash(event) } };
  evidence.receipt = require('../src/services/epistemicVerifierReceiptService').issueReceipt({
    resultId: evidence.receiptId, evidenceDigest: validation.evidenceDigest(evidence),
    verifierDigest: require('../src/services/verifierTrustRegistry').ensureVerifier('testResult').digest,
    independent: true, independenceDescriptor: { actorId: 'runtime-fixture-oracle', workspaceId: 'oracle' } });
  event.payload.negativeOutcomeEvidence = evidence;
  return event;
}

async function main() {
  const db = openDatabase();
  try {
    await workerSchema(db);
    await db.exec(`CREATE TABLE adaptive_state(scope TEXT,key TEXT,payload_json TEXT,version INTEGER,updated_at TEXT,PRIMARY KEY(scope,key));
      CREATE TABLE adaptive_state_events(scope TEXT,key TEXT,event_type TEXT,event_payload TEXT,created_at TEXT);`);
    const contractRecord = await addWorker(db);
    const run = await execution.createExecutionRun(db, { agentId: 'worker', contractRecord });
    assert.equal(run.status, 'planned');
    const prior = await db.get('SELECT * FROM metacognitive_forecasts WHERE run_id=?', run.id);
    assert.equal(JSON.parse(prior.forecast_json).probability, 0.58);
    assert.equal(prior.resolution_json, null);
    await assert.rejects(forecasts.capture(db, { agentId: 'worker', runId: run.id, probability: 0.9 }), /immutable/);
    const event = failure(run.id);
    const saved = await execution.recordExecutionEvent(db, 'worker', event);
    assert.equal(saved.run.status, 'failed');
    assert.equal(saved.metacognitiveOutcome.status, 'resolved');
    assert.equal(saved.biologicalReceipt.result.completed, false);
    const trials = await forecasts.readTrials(db, 'worker');
    assert.equal(trials.trials.length, 1);
    assert.equal(trials.trials[0].outcome, 0);
    assert.equal(trials.trials[0].probability, 0.58);
    const repeated = await execution.recordExecutionEvent(db, 'worker', event);
    assert.equal(repeated.metacognitiveOutcome.replayed, true, JSON.stringify(repeated.metacognitiveOutcome));
    assert.equal((await forecasts.readTrials(db, 'worker')).trials.length, 1);
  } finally { await db.close(); }
  console.log('Runtime forecast: created while planned, frozen, signed terminal failure resolved and replayed once PASS.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
