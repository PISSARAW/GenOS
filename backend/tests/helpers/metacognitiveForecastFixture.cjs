'use strict';

const forecasts = require('../../src/services/metacognitiveForecastService');
const negative = require('../../src/services/terminalOutcomeEvidence');
const validation = require('../../src/services/morphogenesis/learning/outcomeEvidenceValidation');
const receipts = require('../../src/services/epistemicVerifierReceiptService');
const trust = require('../../src/services/verifierTrustRegistry');

async function createDb() {
  const db = await require('../conceptSqliteFixture').createDb();
  await db.exec(`CREATE TABLE workspaces(id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
    CREATE TABLE agents(id TEXT PRIMARY KEY, workspace_id TEXT);
    CREATE TABLE strategy_execution_runs(id TEXT PRIMARY KEY,agent_id TEXT,status TEXT);
    INSERT INTO workspaces VALUES('workspace','org','project');
    INSERT INTO agents VALUES('agent','workspace');`);
  return db;
}

async function capture(db, runId, probability) {
  await db.run("INSERT INTO strategy_execution_runs VALUES(?,'agent','planned')", runId);
  return forecasts.capture(db, { runId, agentId: 'agent', probability });
}

function signedEvent(runId, outcome, overrides = {}) {
  const event = { eventType: outcome ? 'AGENT_COMPLETED' : 'AGENT_FAILED',
    payload: { executionRunId: runId } };
  const evidence = { status: 'VERIFIED', kind: 'deterministic_verifier', receiptId: 'oracle:' + runId,
    actionId: runId, agentId: 'agent', organizationId: 'org', projectId: 'project',
    success: Boolean(outcome), value: Number(outcome), ...overrides };
  if (!outcome) evidence.learningContext = { schema: negative.NEGATIVE_OUTCOME_SCHEMA,
    eventType: event.eventType, terminalEventHash: negative.terminalEventHash(event) };
  evidence.receipt = receipts.issueReceipt({ resultId: evidence.receiptId,
    evidenceDigest: validation.evidenceDigest(evidence), verifierDigest: trust.ensureVerifier('testResult').digest,
    independent: true, independenceDescriptor: { actorId: 'separate-fixture-oracle', workspaceId: 'oracle' } });
  const key = outcome ? 'qualityEvidence' : 'negativeOutcomeEvidence';
  return { ...event, payload: { ...event.payload, [key]: evidence } };
}

async function resolve(db, runId, outcome) {
  await db.run('UPDATE strategy_execution_runs SET status=? WHERE id=?', outcome ? 'completed' : 'failed', runId);
  const event = signedEvent(runId, outcome);
  const result = await forecasts.observe(db, { run: { id: runId }, event });
  return { result, event };
}

module.exports = { createDb, capture, signedEvent, resolve };
