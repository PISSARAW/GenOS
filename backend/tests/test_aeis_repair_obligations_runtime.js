'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
const assert = require('node:assert/strict');
const http = require('node:http');
const realWorker = require('./helpers/realWorkerFixture.cjs');
const repair = require('./helpers/repairObligationFixture');
const journal = require('../src/services/epistemic/nativeOracleJournal');

function modelServer() {
  return http.createServer((request, response) => {
    request.resume();
    request.on('end', () => {
      response.setHeader('content-type', 'application/json');
      if (request.url === '/api/tags') {
        response.end(JSON.stringify({ models: [{ name: 'qwen2.5-coder:7b', model: 'qwen2.5-coder:7b' }] }));
        return;
      }
      const report = { outcome: 'success', claims: [{ statement: 'Verification requested.', evidence: ['mission'] }],
        uncertainties: [], scopeCompletion: { scopeRef: 'mission', completedRefs: ['mission'] } };
      response.end(JSON.stringify({ id: 'repair-regression', model: 'qwen2.5-coder:7b',
        choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(report) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1000, completion_tokens: 100, total_tokens: 1100 } }));
    });
  });
}

async function qualify(options = {}) {
  const input = repair.fixture();
  if (options.candidate) input.files['candidate.gexpr'] = options.candidate;
  if (options.survivor) input.contract.mutants[0].expression = repair.CANDIDATE;
  if (options.tamperSuite) input.files['obligations.json'] = '{}';
  const value = await realWorker.fixture(input.files);
  try {
    const result = await realWorker.dispatch(value, { mode: options.accepted ? 'repair-proof' : 'complete', payload: { workerAssignment: {
      workerKind: 'bounded_worker', workspaceVerificationContract: input.contract } } });
    assert.equal(result.code, 0, result.stderr + result.stdout);
    if (options.accepted) assert.match(result.stdout, /REPAIR_CURRENT_PROOF_PROBES_PASS/);
    const row = await value.db.get("SELECT * FROM strategy_execution_runs WHERE agent_id LIKE 'worker_%' ORDER BY rowid LIMIT 1");
    assert.ok(row, result.stdout);
    const receipt = await require('../src/services/biologicalWorkerStore').receipt(value.db, row.id);
    assert.equal(receipt.result.verified, options.accepted === true, JSON.stringify({ row, receipt }));
    const inspection = await require('../src/services/epistemic/nativeOracleInspection').inspect(value.db,
      { runId: row.id, agentId: row.agent_id });
    if (options.tamperSuite) return assert.equal(inspection.status, 'not_evaluated', JSON.stringify(inspection));
    assert.equal(inspection.costs.processes, 2, JSON.stringify(inspection));
    assert.equal(inspection.costs.complete, true);
    assert.equal(inspection.status, options.accepted ? 'accepted_at_decision' : 'refused', JSON.stringify(inspection));
    if (options.accepted) await inspectAccepted(value, row);
  } finally { await realWorker.close(value); }
}

async function inspectAccepted(value, row) {
  const saved = await require('../src/services/missionEnvelopeAuthority').read(value.db, row.id);
  const request = { runId: row.id, agentId: row.agent_id, scope: saved.envelope.scope };
  const attested = await journal.read(value.db, { ...request, kind: 'attestation' });
  assert.equal(attested.value.accepted, true);
  const assembly = await require('../src/services/aeisAssemblyStore').readAssembly(value.db, attested.value.assemblyId);
  const receipts = assembly.evaluation.assembly.verifications;
  assert.equal(receipts.length, 2);
  const executions = receipts.map(receipt => receipt.executionEvidence[0]);
  assert.equal(new Set(executions.map(execution => execution.processId)).size, 2);
  assert.equal(new Set(executions.map(execution => execution.cwd)).size, 2);
  for (const execution of executions) {
    assert.equal(execution.postconditions.coverage.complete, true);
    assert.equal(execution.postconditions.coverage.obligations.length, 2);
    assert.equal(execution.postconditions.coverage.checkedMutants, 2);
  }
}

async function main() {
  const server = modelServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  process.env.GENOS_OLLAMA_ENDPOINT = `http://127.0.0.1:${server.address().port}/v1/chat/completions`;
  try {
    await qualify({ accepted: true });
    await qualify({ candidate: '0' });
    await qualify({ survivor: true });
    await qualify({ tamperSuite: true });
  } finally { await new Promise(resolve => server.close(resolve)); }
  console.log('AEIS repair runtime: sealed dispatch, signed two-process quorum, refusal, mutation adequacy and current proof: PASS');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
