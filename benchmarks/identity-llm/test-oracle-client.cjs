'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const { create, OracleClient, TIMEOUT_MS } = require('./oracle-client.cjs');
const corpus = require('./corpus.cjs');
const oracle = require('./oracle.cjs');

function fixture(mode) {
  return new OracleClient(fork(path.join(__dirname, 'test-oracle-child.cjs'), [mode], {
    windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] }));
}

async function actualOracle(directory) {
  const client = await create();
  const world = corpus.world('oracle-transport-unit-only-not-a-campaign');
  const worldPath = path.join(directory, 'world.json');
  fs.writeFileSync(worldPath, JSON.stringify(world));
  const tasks = corpus.tasks(world, { window: 0,
    counts: { number_new: 8, number_composition: 8, text_new: 8, text_composition: 8, unknown: 8 } });
  try {
    for (const task of tasks) {
      const input = { worldPath, task };
      assert.deepEqual(await client.answer(input), oracle.answer(input));
    }
    assert.equal(client.nextId, 40);
    await assert.rejects(client.answer({ worldPath: worldPath + '.missing', task: tasks[0] }), /ORACLE_FAILED/);
    await assert.rejects(client.answer({ worldPath, task: tasks[0] }), /ORACLE_FAILED/);
    assert.equal(client.nextId, 41, 'Failure cannot restart or retry an oracle request');
  } finally { await client.close(); }
}

async function failureCase(mode) {
  const client = fixture(mode);
  try {
    await client.ready;
    const request = { worldPath: 'unit-unused', task: { id: 'unit-task' } };
    const started = performance.now();
    await assert.rejects(client.answer(request), /ORACLE_FAILED/);
    if (mode === 'hang') assert(performance.now() - started >= TIMEOUT_MS);
    await assert.rejects(client.answer(request), /ORACLE_FAILED/);
    assert.equal(client.nextId, 1, 'No request replay after a failure');
  } finally { await client.close(); }
}

async function startupTimeout() {
  const client = fixture('no-ready');
  try { await assert.rejects(client.ready, /ORACLE_FAILED:ETIMEDOUT/); }
  finally { await client.close(); }
}

async function concurrentRequests() {
  const client = fixture('hang');
  await client.ready;
  const request = { worldPath: 'unit-unused', task: { id: 'unit-task' } };
  try {
    const first = assert.rejects(client.answer(request), /CONCURRENT_REQUEST/);
    const second = assert.rejects(client.answer(request), /CONCURRENT_REQUEST/);
    await Promise.all([first, second]);
    assert.equal(client.nextId, 1);
  } finally { await client.close(); }
}

async function main() {
  assert.equal(TIMEOUT_MS, 5000);
  const parent = 'D:/GenOS-runs/identity-llm/unit-tests';
  fs.mkdirSync(parent, { recursive: true });
  const directory = fs.mkdtempSync(path.join(parent, 'oracle-'));
  await actualOracle(directory);
  for (const mode of ['wrong-id', 'wrong-task', 'crash', 'hang']) await failureCase(mode);
  await startupTimeout();
  await concurrentRequests();
  console.log('PASS isolated persistent oracle:40 exact corpus cases,5000ms startup/query bounds,correlation,death,concurrency,no retry. Unit transport checks; no LLM evidence.');
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = main;
