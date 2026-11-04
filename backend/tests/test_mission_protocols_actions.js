'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'mission-actions-adoption-tests';
process.env.GENOS_TEST_MODE = '1';
process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const f = require('./helpers/missionActionsFixture');
const runtime = require('../src/services/missionActionRuntimeService');
const adoption = require('../src/services/missionProtocols/actions');
const context = require('../src/services/missionProtocols/context');
const { TABLES_MODEL_ATTEMPTS } = require('../src/db/schema-model-attempts');

async function endpoint() {
  let calls = 0;
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', bytes => { body += bytes; });
    request.on('end', () => {
      assert.ok(JSON.parse(body).messages[0].content.includes('candidate answer'));
      calls += 1; response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ id: 'signed-action-provider', choices: [{ message: { content: JSON.stringify({ answer: 'candidate answer' }) } }],
        usage: { prompt_tokens: 2, completion_tokens: 1 } }));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}/v1/chat/completions`, calls: () => calls,
    close: () => new Promise(resolve => server.close(resolve)) };
}

async function modelSchema(db, url) {
  await db.exec(TABLES_MODEL_ATTEMPTS);
  await require('../src/db/migrations/migrateOrganismModelTurns').migrateOrganismModelTurns(db);
  await db.exec(`CREATE TABLE provider_configs(provider TEXT,model TEXT,endpoint TEXT,capabilities_json TEXT,
    cost_input REAL,cost_output REAL,latency_ms INTEGER,enabled INTEGER);
    CREATE TABLE agent_model_routing_policies(agent_id TEXT,organization_id TEXT,project_id TEXT,policy_json TEXT);
    CREATE TABLE usage_ledger(id TEXT PRIMARY KEY,organization_id TEXT,project_id TEXT,release_id TEXT,
      category TEXT,quantity REAL,cost_usd REAL,metadata_json TEXT);`);
  await db.run('INSERT INTO provider_configs VALUES(?,?,?,?,?,?,?,?)', 'ollama', 'signed-action', url, '[]', 0, 0, 1, 1);
}

async function providerPath(service) {
  const ctx = await f.create();
  try {
    await modelSchema(ctx.db, service.url);
    assert.equal(await context.load(ctx.db, ctx.executionRun.id), null);
    const candidate = f.action();
    candidate.id = 'signed-model-action'; candidate.kind = 'small_model';
    candidate.cost.execution = { tokens: 20, usd: 0.2, latencyMs: 120000 };
    candidate.calibrationReceipt.validUntil = new Date(Date.now() + 300000).toISOString();
    candidate.execution = { prompt: 'Return a candidate answer without declaring verification.', model: 'ollama://signed-action' };
    const request = f.request(ctx, 'active', f.signed(ctx, candidate));
    const result = await runtime.run({ db: ctx.db, request, config: { active: true, key: f.KEY } });
    assert.equal(result.status, 'executed_unverified'); assert.equal(JSON.parse(result.result.text).answer, 'candidate answer');
    assert.equal(result.missionVerified, false); assert.equal(service.calls(), 1);
    const binding = await context.load(ctx.db, ctx.executionRun.id);
    assert.equal(binding.mission.protocolProfile, 'adopted-sealed-action');
    assert.equal(Object.hasOwn(binding.mission, 'prompt'), false);
    assert.equal(Object.hasOwn(binding.mission, 'synapseContext'), false);
    assert.equal((await fs.readdir(binding.directory)).includes('allostasis.sqlite'), false);
    const rows = await ctx.db.all('SELECT * FROM model_budget_reservations');
    assert.equal(rows.length, 1); assert.equal(rows[0].status, 'settled'); assert.equal(rows[0].actual_tokens, 3);
    assert.equal((await ctx.db.get("SELECT COUNT(*) count FROM mission_protocol_receipts WHERE protocol='OMEGA'")).count, 1);
    const before = await require('../src/services/missionProtocols/continuityStore').read(binding);
    await adoption.adopt(ctx.db, request);
    assert.deepEqual(await require('../src/services/missionProtocols/continuityStore').read(binding), before);
    await assert.rejects(runtime.run({ db: ctx.db, request, config: { active: true, key: f.KEY } }), { code: 'MISSION_ACTION_DUPLICATE' });
    assert.equal(service.calls(), 1);
  } finally { await ctx.close(); }
}

async function staleAndWrongScope() {
  const ctx = await f.create();
  try {
    const request = f.request(ctx, 'active', f.signed(ctx, f.action()));
    await assert.rejects(adoption.adopt(ctx.db, { ...request, missionId: 'foreign-mission' }), { code: 'MISSION_ACTION_SEALED_SCOPE_MISMATCH' });
    await require('../src/services/strategyExecutionService').createExecutionRun(ctx.db, {
      agentId: ctx.agentId, contractRecord: ctx.contractRecord, missionId: ctx.normalizedMission.missionId,
      budget: { tokens: 100, costUsd: 1, latencyMs: 300000 } });
    await assert.rejects(adoption.adopt(ctx.db, request), { code: 'MISSION_ACTION_STALE_INCARNATION' });
    assert.equal(await context.load(ctx.db, ctx.executionRun.id), null);
  } finally { await ctx.close(); }
}

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mission-actions-telemetry-'));
  process.env.GENOS_DB_PATH = path.join(directory, 'telemetry.db');
  await require('../src/db').getDatabase();
  const service = await endpoint();
  try {
    await providerPath(service); await staleAndWrongScope();
    console.log('Mission signed actions: authentic sealed adoption, native OMEGA HTTP inference, budget settlement, stable fencing and stale refusal passed.');
  } finally {
    await service.close();
    await require('./helpers/flushTelemetrySideEffects').flushTelemetrySideEffects();
    await require('../src/db').closeDatabase();
    await fs.rm(directory, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
