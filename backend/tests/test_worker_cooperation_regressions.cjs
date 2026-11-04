'use strict';

const assert = require('node:assert/strict');
const { openDatabase } = require('./helpers/biologyDatabase');
const { workerSchema, addWorker, completion } = require('./helpers/biologicalWorkerFixture');
const lifecycle = require('../src/services/agentRecovery/recoveryDispatchLifecycle');
const live = require('./helpers/workerCooperationLiveEvidence.cjs');
const { checkWorkspace } = require('../src/services/epistemic/oracleWorkspaceChecks');

function subject(mode, candidate) {
  return { contract: { version: 1, kind: 'resource_allocation', mode, indexBase: 0,
    files: { problem: 'problem.json', allocation: 'allocation.json', candidate: 'candidate.json' },
    sources: ['problem.json', 'allocation.json', 'candidate.json'].map(path => ({ path, sha256: 'a'.repeat(64) })) },
  sources: [ { path: 'problem.json', content: JSON.stringify({ values: [4, 9, 6, 3, 8], target: 17 }) },
    { path: 'allocation.json', content: '{"indices":[0,1]}' },
    { path: 'candidate.json', content: '{"indices":[1,4],"sum":17}' } ],
  report: { outcome: 'success', claims: [{ statement: JSON.stringify(candidate), evidence: ['mission'] }],
    workerArtifact: { content: { verdict: 'accept' } } } };
}

function oracleRefusals() {
  for (const strategy of ['source_recompute', 'cross_check']) {
    const good = subject('observation', { observedSum: 13, target: 17, anomaly: true });
    assert.equal(checkWorkspace(good, strategy).status, 'verified');
    const wrong = subject('observation', { observedSum: 17, target: 17, anomaly: false });
    assert.equal(checkWorkspace(wrong, strategy).status, 'refuted');
    const fractional = subject('observation', { observedSum: 13.000000001, target: 17, anomaly: true });
    assert.equal(checkWorkspace(fractional, strategy).status, 'refuted');
    assert.equal(checkWorkspace(subject('candidate', { indices: [1, 4], sum: 17 }), strategy).status, 'verified');
    assert.equal(checkWorkspace(subject('candidate', { indices: [0, 1], sum: 17 }), strategy).status, 'refuted');
    assert.equal(checkWorkspace(subject('candidate', { indices: [1, 1], sum: 18 }), strategy).status, 'inconclusive');
    assert.equal(checkWorkspace(subject('candidate', { indices: [-1], sum: 17 }), strategy).status, 'inconclusive');
    const verified = subject('verification', { sum: 17, target: 17, accepted: true });
    assert.equal(checkWorkspace(verified, strategy).status, 'verified');
    verified.report.workerArtifact.content.verdict = 'reject';
    assert.equal(checkWorkspace(verified, strategy).status, 'refuted');
    good.contract.indexBase = 1;
    assert.equal(checkWorkspace(good, strategy).status, 'inconclusive');
  }
  assert.throws(() => live.preflight({ kind: 'resident_daemon' }), /verification contract/);
}

async function failureReceipt(db) {
  await workerSchema(db);
  const contractRecord = await addWorker(db, { promotion: { require_independent_verification: true } });
  const execution = require('../src/services/strategyExecutionService');
  const run = await execution.createExecutionRun(db, { agentId: 'worker', contractRecord });
  const event = completion(run.id, { eventType: 'AGENT_FAILED',
    report: { outcome: 'unresolved', claims: [], uncertainties: ['Need better source evidence.'] } });
  event.detail = 'Local worker reported insufficient evidence.';
  const saved = await execution.recordExecutionEvent(db, 'worker', event);
  const result = saved.biologicalReceipt.result;
  assert.equal(result.verified, false);
  assert.equal(result.reason, event.detail);
  assert.equal(result.failureReason, event.detail);
  assert.match(result.promotionReason, /require_independent_verification/);
  assert.equal(result.terminalEvent, 'AGENT_FAILED');
  assert.equal(saved.run.guardrailReason, null);
  const nested = require('../src/services/biologicalWorkerOutcome').result({ run: saved.run,
    snapshot: { terminalEvent: 'AGENT_FAILED' }, verified: false, terminal: { event: { ...event,
      payload: { runtimeFailure: { detail: 'Context token limit requires native Ollama.' } } } } });
  assert.match(nested.reason, /requires native Ollama/);
  const noAnswer = require('../src/services/biologicalWorkerOutcome').result({ run: { status: 'completed' },
    snapshot: { terminalEvent: 'WORKER_NO_ANSWER_PROVEN' }, verified: true,
    terminal: { event: { eventType: 'WORKER_NO_ANSWER_PROVEN' } } });
  assert.equal(noAnswer.failureReason, null);
}

async function recoveryDrain() {
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const task = lifecycle.track('recovering', async () => { calls++; await blocked; });
  assert.equal(await lifecycle.track('recovering', () => { calls++; }), false);
  await assert.rejects(lifecycle.wait(['recovering'], 10), { code: 'WORKER_RECOVERY_SHUTDOWN_TIMEOUT' });
  let drained = false;
  const stopping = lifecycle.wait(['recovering']).then(() => { drained = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(drained, false);
  release();
  await task;
  await stopping;
  assert.equal(calls, 1);
  await assert.rejects(lifecycle.track('bad-recovery', () => { throw new Error('recorded failure'); }), /recorded failure/);
  await lifecycle.wait(['bad-recovery']);
}

async function accounting(db) {
  await db.exec(`ALTER TABLE agents ADD COLUMN status TEXT;
    CREATE TABLE model_attempt_ledger (id TEXT,agent_id TEXT,model TEXT,status TEXT,provider_called INTEGER,
      input_tokens INTEGER,output_tokens INTEGER,token_usage_source TEXT,error_code TEXT);
    UPDATE agents SET parent_agent_id='parent';
    INSERT INTO agents(id,parent_agent_id) VALUES('recovered','parent');`);
  await db.run(`INSERT INTO strategy_execution_runs(id,agent_id,status,metrics_json)
    VALUES('first','worker','failed',?),('second','worker','failed',?),('fork','recovered','failed',?)`,
  JSON.stringify({ tokens: 3516 }), JSON.stringify({ tokens: 4494 }), JSON.stringify({ tokens: 7 }));
  const result = await live.accounting(db, { id: 'parent', planningTokens: 201 });
  // The failed receipt created above also consumed three measured tokens.
  assert.equal(result.modelTokens, 8211 + 7 + 3);
  assert.equal(result.attempts.length, 4);
  assert.equal((await live.accounting(db, { id: 'parent', planningTokens: null })).modelTokens, null);
  await db.run(`INSERT INTO model_attempt_ledger(id,agent_id,provider_called,token_usage_source)
    VALUES('unknown-usage','worker',1,'unknown')`);
  const unknown = await live.accounting(db, { id: 'parent', planningTokens: 201 });
  assert.equal(unknown.complete, false);
  assert.equal(unknown.modelTokens, null);
}

async function main() {
  oracleRefusals();
  await recoveryDrain();
  const db = openDatabase();
  try { await failureReceipt(db); await accounting(db); }
  finally { await db.close(); }
  console.log('Cooperation regressions: terminal cause, independent arithmetic, recovery drain and all-attempt costs PASS.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
