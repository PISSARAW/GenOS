'use strict';
const assert = require('node:assert/strict');
const { fork, spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');

function reply(child) {
  return Promise.race([
    once(child, 'message').then(([result]) => { if (result.error) throw new Error(result.error); return result; }),
    once(child, 'exit').then(([code]) => { throw new Error(`Backend exited: ${code}`); })
  ]);
}
async function backend(env) {
  const child = fork(require.resolve('./fixtures/receiptBackend.cjs'), [], { env, stdio: ['ignore','ignore','inherit','ipc'] });
  const ready = await reply(child);
  return { child, port: ready.port };
}
async function rust(input) {
  const child = spawn(input.binary, [input.journal, input.mission, input.mode || 'tick'], { env: input.env, stdio: ['ignore','pipe','pipe'] });
  let output = ''; let error = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { error += data; });
  const [code] = await once(child, 'exit');
  if (input.failure) { assert.notEqual(code, 0, 'offline upload must report failure'); return; }
  assert.equal(code, 0, error);
  return JSON.parse(output.trim());
}
async function inspect(child) { const result = reply(child); child.send('inspect'); return result; }
async function stop(child) { const exit = once(child, 'exit'); child.send('stop'); await exit; }

async function main() {
  const binary = process.env.GENOS_RECEIPT_TEST_BINARY;
  assert.ok(binary, 'Build receipt_bridge with --features api and set GENOS_RECEIPT_TEST_BINARY');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-receipt-process-'));
  const mission = randomUUID(); const journal = path.join(dir, 'receipts.jsonl');
  const env = { ...process.env, NODE_ENV: 'test', GENOS_DB_PATH: path.join(dir,'backend.db'),
    GENOS_ADMIN_TOKEN: randomUUID(), GENOS_ADMIN_PASSWORD: 'receipt-e2e',
    GENOS_RUST_RECEIPT_SECRET: randomUUID(), TEST_MISSION_ID: mission, TEST_WORKSPACE: dir };
  let active;
  try {
    active = await backend(env);
    const rustEnv = { ...env, GENOS_BACKEND_URL: `http://127.0.0.1:${active.port}`, GENOS_RUST_RECEIPT_TOKEN: env.GENOS_ADMIN_TOKEN,
      GENOS_RUST_RECEIPT_ORG_ID: 'receipt-org', GENOS_RUST_RECEIPT_PROJECT_ID: 'receipt-project' };
    const first = await rust({ binary, journal, mission, env: rustEnv });
    const before = await inspect(active.child);
    assert.ok(before.receipts.length > 0 && before.cells.length > 0);
    const savedPort = active.port;
    await stop(active.child); active = null;
    await rust({ binary, journal, mission, env: rustEnv, failure: true });
    active = await backend({ ...env, TEST_PORT: String(savedPort) });
    const restored = await rust({ binary, journal, mission, env: rustEnv, mode: 'flush' });
    for (const cell of first.active_cells) {
      const match = restored.active_cells.find(item => item.cell_id === cell.cell_id);
      assert.ok(match, 'cell identity survives process restart');
      assert.equal(match.genome_fingerprint, cell.genome_fingerprint);
    }
    const after = await inspect(active.child);
    assert.ok(after.receipts.length > before.receipts.length, 'offline tick is delivered after process restart');
    await rust({ binary, journal, mission, env: rustEnv, mode: 'flush' });
    assert.equal((await inspect(active.child)).receipts.length, after.receipts.length, 'acknowledged receipts are not duplicated');
    for (const row of after.receipts) {
      const receipt = JSON.parse(row.receipt_json);
      assert.equal(receipt.execution_scope, 'organism'); assert.equal(receipt.cell_id, null);
      const population = JSON.parse(receipt.population_json);
      assert.equal(population.mission_id, mission);
      assert.ok(population.active_cells.every(cell => cell.cell_state.cell_id === cell.cell_id));
    }
    console.log('Rust tick -> authenticated backend HTTP -> SQLite, restart, population identity and retry: PASS');
  } finally {
    if (active) await stop(active.child);
    await fs.rm(dir, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
