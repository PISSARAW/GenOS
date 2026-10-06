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
  const args = [input.journal, input.mission, input.mode || 'tick'];
  if (input.authFile) args.push(input.authFile);
  const child = spawn(input.binary, args, { env: input.env, stdio: ['ignore','pipe','pipe'] });
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
    GENOS_RUST_RECEIPT_SECRET: randomUUID(), GENOS_THERAPY_AUTH_SECRET: randomUUID(), TEST_MISSION_ID: mission, TEST_WORKSPACE: dir };
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
    await verifyClinical({ binary,journal,mission,env:rustEnv,port:active.port,cell:first.active_cells.find(cell => cell.genome_id && cell.genome_fingerprint),dir });
    console.log('Rust tick -> authenticated backend HTTP -> SQLite, restart, population identity and retry: PASS');
  } finally {
    if (active) await stop(active.child);
    await fs.rm(dir, { recursive: true, force: true });
  }
}
async function verifyClinical(input) {
  const headers = { authorization: `Bearer ${input.env.GENOS_ADMIN_TOKEN}`, 'content-type':'application/json',
    'x-organization-id':'receipt-org','x-project-id':'receipt-project' };
  const response = await fetch(`http://127.0.0.1:${input.port}/api/rust/clinical-authorizations`, {
    method:'POST',headers,body:JSON.stringify({ missionId:input.mission,cellId:input.cell.cell_id,therapy:'IntensiveCareFluids',approved:true })
  });
  assert.equal(response.status,201,await response.clone().text());
  const { authorization } = await response.json();
  const authFile = path.join(input.dir,'authorization.json');
  await fs.writeFile(authFile,JSON.stringify({ ...authorization,signature:'0'.repeat(64) }));
  await rust({ ...input,mode:'therapy',authFile,failure:true });
  const signer = require('../src/services/medical/therapyAuthorizationService');
  const priorSecret = process.env.GENOS_THERAPY_AUTH_SECRET;
  process.env.GENOS_THERAPY_AUTH_SECRET = input.env.GENOS_THERAPY_AUTH_SECRET;
  const expired = { ...authorization,expires_at_unix_ms:0 };
  expired.signature = signer.signAuthorization(expired);
  await fs.writeFile(authFile,JSON.stringify(expired));
  await rust({ ...input,mode:'therapy',authFile,failure:true });
  const absent = { ...authorization,cell_id:randomUUID() };
  absent.signature = signer.signAuthorization(absent);
  await fs.writeFile(authFile,JSON.stringify(absent));
  await rust({ ...input,mode:'therapy',authFile,failure:true });
  if (priorSecret === undefined) delete process.env.GENOS_THERAPY_AUTH_SECRET;
  else process.env.GENOS_THERAPY_AUTH_SECRET = priorSecret;
  await fs.writeFile(authFile,JSON.stringify(authorization));
  const treated = await rust({ ...input,mode:'therapy',authFile });
  const patient = treated.active_cells.find(cell => cell.cell_id === authorization.cell_id);
  assert.equal(patient.cell_state.clinical.last_treatment_applied, null, 'missing perfusion marker cannot attest application');
  const before = await fs.readFile(input.journal,'utf8');
  const duplicate = await rust({ ...input,mode:'therapy',authFile });
  assert.equal(await fs.readFile(input.journal,'utf8'),before,'authorization replay cannot reapply therapy');
  assert.deepEqual(duplicate.active_cells.find(cell => cell.cell_id === authorization.cell_id).cell_state,patient.cell_state);
  assert.ok(before.includes('genos.clinical-application/v1'),'application receipt is durable');
  console.log('Explicit HTTP authorization -> Rust clinical mutation -> durable receipt -> process reopen and idempotence: PASS');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
