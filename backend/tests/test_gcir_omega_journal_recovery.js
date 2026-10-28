'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { createRuntime } = require('../src/services/cognitiveOmegaRuntimeService');

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gcir-journal-'));
  const filename = path.join(directory, 'runtime.db');
  const effects = new Map();
  let calls = 0;
  let shouldInterrupt = true;
  let db;
  const request = { runId: 'run-a4-1', operations: [
    { id: 'effect', kind: 'CALL', reference: 'charge', arguments: { amount: 7 }, dependsOn: [] }
  ], policy: { call: ['charge'] } };
  try {
    db = await open({ filename, driver: sqlite3.Database });
    const interrupted = createRuntime({ journal: db });
    interrupted.registerTool('charge', async ({ idempotencyKey, arguments: args }) => {
      assert.equal(idempotencyKey, 'gcir:run-a4-1:effect');
      if (effects.has(idempotencyKey)) return effects.get(idempotencyKey);
      calls += 1;
      const value = { accepted: true, amount: args.amount };
      effects.set(idempotencyKey, value);
      if (shouldInterrupt) {
        shouldInterrupt = false;
        throw new Error('simulated_interruption_after_external_commit');
      }
      return value;
    }, { idempotent: true });
    assert.equal((await interrupted.execute(request)).reason, 'operation_failed');
    await db.close();

    db = await open({ filename, driver: sqlite3.Database });
    const recovered = createRuntime({ journal: db });
    recovered.registerTool('charge', async ({ idempotencyKey, arguments: args }) => {
      assert.equal(idempotencyKey, 'gcir:run-a4-1:effect');
      if (effects.has(idempotencyKey)) return effects.get(idempotencyKey);
      calls += 1;
      const value = { accepted: true, amount: args.amount };
      effects.set(idempotencyKey, value);
      return value;
    }, { idempotent: true });
    const result = await recovered.execute(request);
    assert.equal(result.status, 'emitted');
    assert.deepEqual(result.values.effect, { accepted: true, amount: 7 });
    assert.equal(calls, 1);

    const replayed = await recovered.execute(request);
    assert.equal(replayed.digest, result.digest);
    assert.equal(calls, 1);
    console.log('G-CIR SQLite journal crash/reopen and idempotent effect recovery passed.');
  } finally {
    if (db) await db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
