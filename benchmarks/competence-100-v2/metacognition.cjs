'use strict';

const forecasts = require('../../backend/src/services/metacognitiveForecastService');
const bench = require('../../backend/src/services/metacognitionBenchService');
const receipts = require('../../backend/src/services/epistemicVerifierReceiptService');
const validation = require('../../backend/src/services/morphogenesis/learning/outcomeEvidenceValidation');
const negative = require('../../backend/src/services/terminalOutcomeEvidence');
const trust = require('../../backend/src/services/verifierTrustRegistry');
const contract = require('../../backend/src/services/experienceCompetence/contract');
const verifierDigest = () => trust.ensureVerifier('testResult').digest;

async function setup(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS workspaces(id TEXT PRIMARY KEY,organization_id TEXT,project_id TEXT);
    CREATE TABLE IF NOT EXISTS agents(id TEXT PRIMARY KEY,workspace_id TEXT);
    CREATE TABLE IF NOT EXISTS strategy_execution_runs(id TEXT PRIMARY KEY,agent_id TEXT,status TEXT);
    INSERT OR IGNORE INTO workspaces VALUES('competence-v2','research','competence-v2');
    INSERT OR IGNORE INTO agents VALUES('experienced','competence-v2');
    INSERT OR IGNORE INTO agents VALUES('initial','competence-v2');
    INSERT OR IGNORE INTO agents VALUES('reset','competence-v2');`);
}

async function capture(db, input) {
  await db.run('INSERT INTO strategy_execution_runs VALUES(?,?,?)', input.runId, input.agentId, 'planned');
  const saved = await forecasts.capture(db, { runId: input.runId, agentId: input.agentId, probability: input.probability });
  if (saved.status !== 'recorded') throw Error('Immutable forecast capture failed');
  return saved.forecast;
}

function outcomeEvent(input) {
  const event = { eventType: input.correct ? 'AGENT_COMPLETED' : 'AGENT_FAILED', payload: { executionRunId: input.runId } };
  const evidence = { status: 'VERIFIED', kind: 'deterministic_verifier', receiptId: input.runId,
    actionId: input.runId, agentId: input.agentId, organizationId: 'research', projectId: 'competence-v2',
    success: input.correct, value: Number(input.correct) };
  if (!input.correct) evidence.learningContext = { schema: negative.NEGATIVE_OUTCOME_SCHEMA,
    eventType: event.eventType, terminalEventHash: negative.terminalEventHash(event) };
  evidence.receipt = receipts.issueReceipt({ resultId: input.runId, evidenceDigest: validation.evidenceDigest(evidence),
    verifierDigest: verifierDigest(), independent: true,
    independenceDescriptor: { actorId: 'competence-v2-oracle-process', workspaceId: input.directory } });
  return { ...event, payload: { ...event.payload,
    [input.correct ? 'qualityEvidence' : 'negativeOutcomeEvidence']: evidence } };
}

async function observe(db, input) {
  await db.run('UPDATE strategy_execution_runs SET status=? WHERE id=?', input.correct ? 'completed' : 'failed', input.runId);
  const event = outcomeEvent(input);
  const resolved = await forecasts.observe(db, { run: { id: input.runId }, event });
  if (resolved.status !== 'resolved') throw Error('Independent forecast resolution failed: ' + resolved.reason);
  return event;
}

function signObservation(input) {
  const payload = contract.observationPayload(input);
  return { ...payload, receipt: receipts.issueReceipt({ resultId: input.runId,
    evidenceDigest: contract.digest(payload), verifierDigest: verifierDigest(), independent: true,
    independenceDescriptor: { actorId: 'competence-v2-oracle-process', workspaceId: input.directory } }) };
}

module.exports = { setup, capture, observe, signObservation, verifierDigest, runBench: bench.runBench };
