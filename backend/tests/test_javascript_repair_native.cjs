'use strict';
process.env.GENOS_DISABLE_DOTENV = '1';
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const fixture = require('./helpers/realWorkerFixture.cjs');
const { REFERENCES } = require('../src/services/epistemic/javascriptRepairCases');
const sourceRef = 'mission';

function modelServer() {
  return http.createServer((request, response) => {
    request.resume();
    request.on('end', () => {
      response.setHeader('content-type', 'application/json');
      if (request.url === '/api/tags') return response.end(JSON.stringify({ models: [{ name: 'qwen2.5-coder:7b' }] }));
      const report = { outcome: 'success', claims: [{ statement: 'Bounded source artifact ready for verification.',
        evidence: [sourceRef] }], uncertainties: [], scopeCompletion: { scopeRef: 'mission', completedRefs: [sourceRef] } };
      response.end(JSON.stringify({ model: 'qwen2.5-coder:7b', choices: [{ index: 0, finish_reason: 'stop',
        message: { role: 'assistant', content: JSON.stringify(report) } }],
      usage: { prompt_tokens: 1000, completion_tokens: 100, total_tokens: 1100 } }));
    });
  });
}

async function qualify(code, expected) {
  const value = await fixture.fixture({ 'module.js': code });
  try {
    const contract = { version: 1, kind: 'javascript_repair_cases', suite: 'genos.pure-js-repair/v1', caseId: 'port',
      artifactPath: 'module.js', sources: [{ path: 'module.js', mutable: true,
        sha256: crypto.createHash('sha256').update(code).digest('hex') }] };
    const dispatched = await fixture.dispatch(value, { payload: { workerAssignment: {
      workerKind: 'bounded_worker', workspaceVerificationContract: contract } } });
    assert.equal(dispatched.code, 0, dispatched.stderr + dispatched.stdout);
    const run = await value.db.get("SELECT * FROM strategy_execution_runs WHERE agent_id LIKE 'worker_%' ORDER BY rowid LIMIT 1");
    const receipt = await require('../src/services/biologicalWorkerStore').receipt(value.db, run.id);
    assert.equal(receipt.result.verified, expected, JSON.stringify(receipt));
    const request = { runId: run.id, agentId: run.agent_id };
    const inspect = require('../src/services/epistemic/nativeOracleInspection').inspect;
    const proof = await inspect(value.db, request);
    assert.equal(proof.costs.processes, 2);
    assert.equal(proof.costs.complete, true);
    assert.equal(proof.status, expected ? 'accepted_at_decision' : 'refused');
    const compiler = require('../src/services/reportCompilerService');
    const graph = await compiler.buildTruthGraph(value.db, run.agent_id);
    assert.equal(graph.status, 'measured');
    assert.equal(graph.nodes.find(node => node.kind === 'execution_receipt').verified, expected);
    const context = { agentId: run.agent_id, autonomyPlan: { missionTruthGraph: compiler.compileReport(graph) } };
    const gate = require('../src/services/workerEvidenceTruthGate');
    if (expected) await gate.enforceReportGate(context);
    else await assert.rejects(gate.enforceReportGate(context), { code: 'MISSION_REPORT_GATE_REJECTED' });
    if (expected) {
      await fs.writeFile(path.join(value.workspace, 'module.js'), 'module.exports = () => 3000;');
      assert.equal((await inspect(value.db, request)).current.satisfied, false, 'Source drift invalidates the current proof');
    }
  } finally { await fixture.close(value); }
}

async function main() {
  const server = modelServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  process.env.GENOS_OLLAMA_ENDPOINT = `http://127.0.0.1:${server.address().port}/v1/chat/completions`;
  try {
    await qualify(`module.exports = ${REFERENCES.port};`, true);
    await qualify('module.exports = () => 3000;', false);
  } finally { await new Promise(resolve => server.close(resolve)); }
  console.log('Native JavaScript domain: positive qualification, negative receipt, two processes and source drift: PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
