'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const fixture = require('./helpers/realWorkerFixture.cjs');
const source = 'day,sales\n1,8\n2,12\n3,10\n4,\n5,15\n6,5\n7,10\n8,20\n';
const digest = crypto.createHash('sha256').update(source).digest('hex');
let candidate;
let calls = 0;

function modelServer() {
  return http.createServer((request, response) => {
    request.resume();
    request.on('end', () => {
      response.setHeader('content-type', 'application/json');
      if (request.url === '/api/tags') {
        response.end(JSON.stringify({ models: [{ name: 'qwen2.5-coder:7b', model: 'qwen2.5-coder:7b' }] }));
        return;
      }
      calls += 1;
      const report = { outcome: 'success', claims: [{ statement: JSON.stringify(candidate), evidence: ['sha256:' + digest] }],
        uncertainties: [], scopeCompletion: { scopeRef: 'mission', completedRefs: ['sha256:' + digest] } };
      response.end(JSON.stringify({ id: 'source-bound-test', model: 'qwen2.5-coder:7b',
        choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(report) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1000, completion_tokens: 100, total_tokens: 1100 } }));
    });
  });
}

async function qualify(expected, badSource = false) {
  const value = await fixture.fixture({ 'sales.csv': source });
  try {
    const contract = { version: 1, kind: 'observed_statistics', columns: { value: 'sales' },
      sources: [{ path: 'sales.csv', sha256: badSource ? 'a'.repeat(64) : digest }] };
    const result = await fixture.dispatch(value, { payload: { workerAssignment: {
      workerKind: 'bounded_worker', workspaceVerificationContract: contract } } });
    assert.equal(result.code, 0, result.stderr + result.stdout);
    const row = await value.db.get("SELECT * FROM strategy_execution_runs WHERE agent_id LIKE 'worker_%' ORDER BY rowid LIMIT 1");
    const receipt = await require('../src/services/biologicalWorkerStore').receipt(value.db, row.id);
    assert.equal(receipt.result.verified, expected, JSON.stringify({ row, receipt }));
    const inspection = await require('../src/services/epistemic/nativeOracleInspection').inspect(value.db, {
      runId: row.id, agentId: row.agent_id });
    if (badSource) {
      assert.equal(inspection.status, 'not_evaluated');
      const errors = await value.db.all("SELECT detail FROM telemetry_events WHERE event_type='AGENT_FAILED'");
      assert.ok(errors.some(event => event.detail.includes('ORACLE_SOURCE_CHANGED')), JSON.stringify(errors));
    } else {
      assert.equal(inspection.costs.processes, 2, JSON.stringify(inspection));
      assert.equal(inspection.costs.complete, true);
      assert.equal(inspection.status, expected ? 'accepted_at_decision' : 'refused', JSON.stringify(inspection));
    }
  } finally { await fixture.close(value); }
}

async function main() {
  const server = modelServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  process.env.GENOS_OLLAMA_ENDPOINT = `http://127.0.0.1:${server.address().port}/v1/chat/completions`;
  try {
    candidate = { count: 7, total: 80, mean: 80 / 7, median: 10, max: 20 };
    await qualify(true);
    candidate = { count: 8, total: 80, mean: 10, median: 10, max: 20 };
    await qualify(false);
    await qualify(false, true);
    assert.ok(calls >= 2, 'both real worker paths called the isolated model transport');
  } finally { await new Promise(resolve => server.close(resolve)); }
  console.log('Real dispatch, measured model transport, two independent oracles and false-answer refusal: PASS');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
