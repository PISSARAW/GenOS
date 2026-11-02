'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'mission-omega-inference-only';
process.env.GENOS_TEST_MODE = '1';
process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fixture = require('./helpers/missionProtocolFixture');
const omega = require('../src/services/missionProtocols/omega');
const { TABLES_MODEL_ATTEMPTS } = require('../src/db/schema-model-attempts');

async function endpoint() {
  let calls = 0;
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', bytes => { body += bytes; });
    request.on('end', () => {
      const input = JSON.parse(body); calls += 1;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ id: `fixture-response:${calls}`, choices: [{ message: { content: `received:${input.messages[0].content}` } }],
        usage: { prompt_tokens: 2, completion_tokens: 1 } }));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}/v1/chat/completions`, calls: () => calls,
    close: () => new Promise(resolve => server.close(resolve)) };
}

async function schema(db, url) {
  await db.exec(TABLES_MODEL_ATTEMPTS);
  await db.exec(`CREATE TABLE provider_configs (provider TEXT,model TEXT,endpoint TEXT,capabilities_json TEXT,
    cost_input REAL,cost_output REAL,latency_ms INTEGER,enabled INTEGER);
    CREATE TABLE usage_ledger(id TEXT PRIMARY KEY,organization_id TEXT,project_id TEXT,release_id TEXT,
      category TEXT,quantity REAL,cost_usd REAL,metadata_json TEXT);`);
  await db.run('INSERT INTO provider_configs VALUES (?,?,?,?,?,?,?,?)', 'ollama', 'protocol-fixture', url, '[]', 0, 0, 1, 1);
}

async function main() {
  const service = await endpoint();
  const ctx = await fixture.create();
  try {
    process.env.GENOS_DB_PATH = path.join(ctx.root, 'telemetry.db');
    await require('../src/db').getDatabase();
    const binding = await fixture.seal(ctx);
    await schema(ctx.db, service.url);
    const context = { db: ctx.db, agentId: ctx.agentId, executionRunId: ctx.executionRun.id,
      missionId: ctx.normalizedMission.missionId, prompt: 'loopback protocol fixture', maxTokens: 4,
      stream: false, enforceSchema: false, onToken() {}, remainingMs: () => Date.parse(binding.expiresAt) - Date.now() };
    const input = { context, candidates: ['ollama://protocol-fixture'], mode: 'fallback' };
    const first = await omega.executeInference(input);
    assert.equal(first.protocol.name, 'OMEGA');
    assert.equal(first.result.text, 'received:loopback protocol fixture');
    assert.equal(service.calls(), 1);
    assert.deepEqual(await omega.executeInference(input), first);
    assert.equal(service.calls(), 1, 'explicit same routeActionId replays the durable operation');
    const next = await omega.executeInference({ ...input, context: { ...context, routeActionId: undefined } });
    assert.notEqual(next.protocol.runId, first.protocol.runId);
    assert.equal(service.calls(), 2, 'distinct call uses a distinct operation even with the same prompt');
    const rows = await ctx.db.all('SELECT * FROM model_budget_reservations');
    assert.equal(rows.length, 2); assert.equal(rows.reduce((sum, row) => sum + row.actual_tokens, 0), 6);
    assert.ok(rows.every(row => row.status === 'settled'));
    assert.ok(rows.every(row => JSON.parse(row.scope_id)[0] === binding.scope.organizationId));
    console.log('Mission OMEGA native route, loopback provider receipts, shared native budget and distinct attempts: PASS');
  } finally {
    await service.close();
    const telemetry = require('../src/services/telemetryObserver');
    await telemetry.flush(); await Promise.allSettled([...telemetry.deferredSideEffects]);
    await require('../src/db').closeDatabase(); await ctx.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
