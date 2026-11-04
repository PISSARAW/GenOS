'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_DB_BACKUP_SKIP = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'mission-local-worker-ledger-only';
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'mission-local-worker-oracle-only';
process.env.GENOS_TEST_MODE = '1';
process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const Database = require('better-sqlite3');
const { seed, addChild } = require('./test_bounded_worker_delegation');
const { getDatabase, closeDatabase } = require('../src/db');
const authorityQualification = require('./helpers/localWorkerAuthorityQualification.cjs');

async function endpoint(workspace) {
  let calls = 0;
  const requests = [];
  const observations = [];
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', bytes => { body += bytes; });
    request.on('end', () => {
      response.setHeader('content-type', 'application/json');
      if (request.method === 'GET') return response.end(JSON.stringify({ models: [{ name: 'protocol-local-worker' }] }));
      requests.push(JSON.parse(body)); calls += 1;
      const report = { outcome: 'unresolved', claims: [],
        uncertainties: ['The supplied mission contains no independently verified business result.'] };
      try {
        authorityQualification.respond(response, { observations, body: JSON.stringify({ id: `local-worker-response:${calls}`,
          choices: [{ message: { content: JSON.stringify(report) } }], usage: { prompt_tokens: 2, completion_tokens: 1 } }) });
      } catch (error) { response.statusCode = 500; response.end(JSON.stringify({ error: error.message })); }
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}/v1/chat/completions`, calls: () => calls, requests, observations,
    close: () => new Promise(resolve => server.close(resolve)) };
}

async function execute(db, input) {
  await seed(db, input.workspace);
  const contract = await addChild(db, { id: 'protocol-local-worker', tokens: 10000 });
  await require('../src/services/agents/boundedDelegationAuthority').bind(db,
    { parentId: 'delegation-sub', childId: 'protocol-local-worker', allocation: 10000 });
  const parent = await db.get('SELECT id FROM strategy_execution_runs WHERE agent_id=? ORDER BY rowid DESC LIMIT 1', 'delegation-sub');
  const modelBudgetScope = await require('../src/services/missionModelBudgetScope').bindTeamScope({ db,
    teamRunId: parent.id, orchestratorAgentId: 'delegation-sub', budget: { tokens: 10000, costUsd: 1 } });
  await db.run(`INSERT INTO provider_configs(id,provider,model,endpoint,capabilities_json,cost_input,cost_output,latency_ms,enabled)
    VALUES(?,?,?,?,?,?,?,?,?)`, 'protocol-local-provider', 'ollama', 'protocol-local-worker', input.service.url, '[]', 0, 0, 1, 1);
  const before = await db.get('SELECT cognitive_budget, conscience_revision FROM agents WHERE id=?', 'protocol-local-worker');
  const result = await require('../src/services/agentRuntimeAdapter').startMission({
    agentId: 'protocol-local-worker', missionId: 'delegation-mission', orchestratorAgentId: 'delegation-sub',
    workerKind: 'bounded_worker', role: 'bounded_worker', workerContract: contract,
    prompt: 'Inspect the supplied mission. Do not invent independent verification.',
    workspaceId: 'delegation-ws', workspaceRoot: input.workspace, workspaceProvisioned: true,
    executor: 'local', localRuntime: true, inProcessWorker: true,
    localModel: 'ollama://protocol-local-worker', localRoutingPolicy: { primary: 'ollama://protocol-local-worker', preferLocal: true },
    modelBudgetScope,
    autonomousOrchestration: false, toolLease: [], timeoutMs: 300000,
    executionBudget: { tokens: 10000, costUsd: 1, latencyMs: 300000, events: 100 } });
  return { result, before };
}

async function qualifyConscience(db, before) {
  const transitions = await db.all(`SELECT from_revision, to_revision, from_budget, to_budget
    FROM conscience_transitions WHERE agent_id=? AND reason=?`, 'protocol-local-worker', 'worker_task_completed');
  assert.equal(transitions.length, 1, 'real local completion must persist its cognitive regulation transition');
  const after = await db.get('SELECT cognitive_budget, conscience_revision FROM agents WHERE id=?', 'protocol-local-worker');
  assert.equal(after.conscience_revision, before.conscience_revision + 1);
  assert.ok(after.cognitive_budget <= before.cognitive_budget, 'completion must never replenish the cognitive budget');
  assert.deepEqual(transitions[0], { from_revision: before.conscience_revision,
    to_revision: after.conscience_revision, from_budget: before.cognitive_budget, to_budget: after.cognitive_budget });
}

async function qualify(db, input) {
  const { result, before } = await execute(db, input);
  await qualifyConscience(db, before);
  const row = await db.get('SELECT * FROM strategy_execution_runs WHERE agent_id=? ORDER BY rowid DESC LIMIT 1', 'protocol-local-worker');
  const records = await require('../src/services/biologicalWorkerStore').observations(db, row.id);
  assert.equal(input.service.calls(), 1, JSON.stringify({ result, row, records }));
  assert.ok(records.some(record => record.applied && record.event.eventType === 'LOCAL_WORKER_STARTED'));
  assert.notEqual(row.status, 'completed', JSON.stringify({ result, row }));
  assert.equal(result.local, true);
  assert.equal(result.unresolved, true, 'a model response cannot satisfy independent business verification');
  assert.ok(input.service.requests[0].messages.some(message => message.content.includes('Inspect the supplied mission.')),
    'the real provider consumes the mission task carried through SYNAPSE');
  const attempts = await db.all('SELECT * FROM model_attempt_ledger WHERE agent_id=?', 'protocol-local-worker');
  assert.equal(attempts.length, 1); assert.equal(attempts[0].provider_called, 1);
  assert.equal(attempts[0].input_tokens, 2); assert.equal(attempts[0].output_tokens, 1);
  assert.equal(attempts[0].token_usage_source, 'provider');
  const reservations = await db.all('SELECT * FROM model_budget_reservations WHERE action_id IN (SELECT action_id FROM model_attempt_ledger WHERE agent_id=?)', 'protocol-local-worker');
  assert.equal(reservations.length, 1);
  assert.equal(reservations[0].status, 'settled');
  assert.equal(reservations[0].actual_tokens, 3);
  const binding = await require('../src/services/missionProtocols/context').load(db, row.id);
  assert.equal(binding.mission.synapseContext.generation, 1);
  const continuity = await require('../src/services/missionProtocols/continuityStore').read(binding);
  assert.equal(continuity.runId, row.id); assert.deepEqual(continuity.actor, binding.actor);
  const tables = ['synapse.sqlite', 'allostasis.sqlite'];
  for (const filename of tables) assert.ok((await fs.stat(path.join(binding.directory, filename))).isFile());
  const omegaFiles = (await fs.readdir(binding.directory)).filter(filename => /^ox-.*\.db$/.test(filename));
  assert.equal(omegaFiles.length, 1);
  const execution = new Database(path.join(binding.directory, omegaFiles[0]));
  try {
    assert.equal(execution.prepare('SELECT status FROM omega_protocol_runs').get().status, 'completed');
  } finally { execution.close(); }
  assert.equal((await db.get("SELECT COUNT(*) count FROM mission_protocol_receipts WHERE run_id=? AND protocol='OMEGA'", row.id)).count, 1);
  const timing = new Database(path.join(binding.directory, 'allostasis.sqlite'));
  try {
    const pool = JSON.parse(timing.prepare('SELECT body FROM allostasis_pools').get().body);
    assert.ok(pool.consumed > 0); assert.equal(pool.held, 0);
    assert.equal(pool.protectedReserve, 15000);
  } finally { timing.close(); }
  const evidenceTable = await db.get("SELECT name FROM sqlite_master WHERE name='mission_protocol_evidence'");
  if (evidenceTable) assert.equal(await db.get('SELECT run_id FROM mission_protocol_evidence WHERE run_id=?', row.id), undefined);
  await authorityQualification.qualify(db, { run: row, observations: input.service.observations });
  console.log('Mission Node runLocalWorker: one real HTTP inference, native token settlement and protocol state; business completion refused without independent proof passed.');
}

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mission-local-worker-'));
  const workspace = path.join(directory, 'workspace');
  await fs.mkdir(workspace);
  await fs.writeFile(path.join(workspace, 'input.txt'), 'Declared mission input only.');
  process.env.GENOS_DB_PATH = path.join(directory, 'control.sqlite');
  process.env.GENOS_STUDIO_ROOT = path.join(directory, 'studio');
  process.env.GENOS_CAPSULE_ROOT = path.join(directory, 'capsules');
  process.env.GENOS_WORKSPACES_ROOT = directory;
  process.env.GENOS_DISABLE_WORKSPACE_GC = '1';
  const service = await endpoint(workspace);
  const db = await getDatabase(process.env.GENOS_DB_PATH);
  try { await qualify(db, { workspace, service }); }
  finally {
    await service.close();
    await require('../src/services/garageRuntimeService').stop(db);
    await require('./helpers/flushTelemetrySideEffects').flushTelemetrySideEffects();
    await closeDatabase();
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
