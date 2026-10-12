'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || 'mission-outcome-contract-test';
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'mission-outcome-receipt-test-only';
const { getDatabase, closeDatabase } = require('../src/db');
const contracts = require('../src/services/strategyContractService');
const executions = require('../src/services/strategyExecutionService');
const missionOutcome = require('../src/services/missionOutcomeContract');
const { issueReceipt } = require('../src/services/epistemicVerifierReceiptService');

const obligation = { id: 'answer', statement: 'The answer is 42.' };
const verifierDigest = `sha256:${'b'.repeat(64)}`;
const evidenceDigest = `sha256:${'a'.repeat(64)}`;
const oracle = { domain: 'subset_sum', verifierDigest,
  validityDomain: { statement: 'Bounded native subset sum', constraints: [] } };

function verifiedProof(statement) {
  const receipt = (nonce) => issueReceipt({ resultId: 'answer-result',
    evidenceDigest, verifierDigest, status: 'verified', independent: true, nonce,
    coveredObligations: ['answer-result'],
    independenceDescriptor: { actorId: `verifier-${nonce}`, workspaceId: `verification-${nonce}` } });
  return { gateContext: { aeisEvaluation: { allAccepted: true, assembly: {
    results: [{ resultId: 'answer-result', canonicalStatement: statement, evidence: { digest: evidenceDigest } }],
    verifications: [receipt('first'), receipt('second')]
  } }, trustedVerifierDigests: [verifierDigest] } };
}

function testContractAndVerdicts() {
  const contract = contracts.buildStrategyContract({ problem: 'Answer a question',
    missionOutcomeContract: { goal: 'Give the correct answer', obligations: [{ ...obligation, oracle }] } });
  contracts.validateContract(contract);
  assert.equal(contract.mission_outcome.goal, 'Give the correct answer');
  assert.equal(contract.mission_outcome.schema, missionOutcome.SCHEMA_V2);
  const legacy = missionOutcome.validate({ schema: missionOutcome.SCHEMA, goal: 'Legacy answer',
    obligations: [obligation], statuses: [...missionOutcome.STATUSES] });
  assert.equal(missionOutcome.evaluate(legacy, verifiedProof(obligation.statement), {}).status, 'verified');
  assert.equal(missionOutcome.evaluate(legacy, verifiedProof('Wrong answer'), {}).status, 'inconclusive');
  const duplicate = verifiedProof(obligation.statement);
  duplicate.gateContext.aeisEvaluation.assembly.verifications[1] =
    duplicate.gateContext.aeisEvaluation.assembly.verifications[0];
  assert.equal(missionOutcome.evaluate(legacy, duplicate, {}).status, 'inconclusive');
  const sameActor = verifiedProof(obligation.statement);
  sameActor.gateContext.aeisEvaluation.assembly.verifications[1] = issueReceipt({
    ...sameActor.gateContext.aeisEvaluation.assembly.verifications[1],
    independenceDescriptor: { actorId: 'verifier-first', workspaceId: 'verification-first' }
  });
  assert.equal(missionOutcome.evaluate(legacy, sameActor, {}).status, 'inconclusive');
  const wrongCoverage = verifiedProof(obligation.statement);
  wrongCoverage.gateContext.aeisEvaluation.assembly.verifications[0] = issueReceipt({
    ...wrongCoverage.gateContext.aeisEvaluation.assembly.verifications[0], coveredObligations: ['other-result']
  });
  assert.equal(missionOutcome.evaluate(legacy, wrongCoverage, {}).status, 'inconclusive');
  const tampered = verifiedProof(obligation.statement);
  tampered.gateContext.aeisEvaluation.assembly.verifications[0].signature = '0'.repeat(64);
  assert.equal(missionOutcome.evaluate(legacy, tampered, {}).status, 'inconclusive');
  const untrusted = verifiedProof(obligation.statement);
  untrusted.gateContext.trustedVerifierDigests = [];
  assert.equal(missionOutcome.evaluate(legacy, untrusted, {}).status, 'inconclusive');
  assert.equal(missionOutcome.evaluate(contract.mission_outcome, null,
    { payload: { missionOutcome: { status: 'abstained' } } }).status, 'abstained');
  assert.equal(missionOutcome.evaluate(contract.mission_outcome, null,
    { payload: { missionOutcome: { status: 'rejected' } } }).status, 'rejected');
  assert.equal(missionOutcome.evaluate(contract.mission_outcome, null,
    { payload: { missionOutcome: { status: 'verified' } } }).status, 'inconclusive');
  assert.throws(() => missionOutcome.build({ obligations: [{ ...obligation, oracle },
    { ...obligation, oracle }] }, 'goal'), /Duplicate/);
  assert.throws(() => missionOutcome.build({ obligations: [obligation] }, 'goal'), /oracle/);
  return contract;
}

async function testRuntimeClosure(contract) {
  const dbPath = path.resolve(__dirname, 'mission-outcome-contract-test.db');
  const db = await getDatabase(dbPath);
  try {
    await db.run("INSERT INTO agents (id, name, role, status, execution_mode) VALUES ('outcome-agent', 'Outcome Agent', 'Orchestrator', 'running', 'orchestrator')");
    const saved = await contracts.saveContract(db, { agentId: 'outcome-agent', contract });
    const run = await executions.createExecutionRun(db, { agentId: 'outcome-agent', contractRecord: saved,
      budget: { tokens: 1000, costUsd: 1, latencyMs: 60000, events: 20 } });
    const progress = await executions.recordExecutionEvent(db, 'outcome-agent', {
      eventType: 'AGENT_COMPLETED', action: 'COMPLETE', detail: 'Declared success', payload: {
        evidenceReport: { outcome: 'success', claims: [{ statement: obligation.statement,
          evidence: ['caller-asserted-evidence'] }] },
        missionOutcome: { status: 'verified' }
      }
    });
    assert.equal(progress.run.id, run.id);
    assert.equal(progress.run.status, 'blocked');
    assert.equal(progress.run.metrics.missionOutcome.status, 'inconclusive');
    assert.deepEqual(progress.run.metrics.missionOutcome.missingObligations, ['answer']);
    await db.run("INSERT INTO agents (id, name, role, status, execution_mode) VALUES ('legacy-outcome-agent', 'Legacy Agent', 'Orchestrator', 'running', 'orchestrator')");
    const legacy = await contracts.saveContract(db, { agentId: 'legacy-outcome-agent',
      contract: contracts.buildStrategyContract({ problem: 'Legacy mission' }) });
    const legacyRun = await executions.createExecutionRun(db, { agentId: 'legacy-outcome-agent', contractRecord: legacy,
      budget: { tokens: 1000, costUsd: 1, latencyMs: 60000, events: 20 } });
    const legacyProgress = await executions.recordExecutionEvent(db, 'legacy-outcome-agent', {
      eventType: 'AGENT_COMPLETED', action: 'COMPLETE', detail: 'Legacy completion', payload: {
        executionRunId: legacyRun.id, evidenceReport: { outcome: 'success',
          claims: [{ statement: 'Legacy claim', evidence: ['legacy-receipt'] }] }
      }
    });
    assert.equal(legacyProgress.run.metrics.missionOutcome.status, 'unmeasured');
  } finally {
    await closeDatabase();
    for (const suffix of ['', '-shm', '-wal']) {
      if (fs.existsSync(`${dbPath}${suffix}`)) fs.unlinkSync(`${dbPath}${suffix}`);
    }
  }
}

testRuntimeClosure(testContractAndVerdicts()).then(() => {
  console.log('Mission outcome contract and closure: passed');
}).catch((error) => { console.error(error); process.exitCode = 1; });
