'use strict';

const assert = require('assert');
const { observeExecution } = require('../src/services/ontogenesis/executionLifecycle');

function makeRun(phase, result) {
  return { id: 'race-run', project_id: 'race-project', phase, started_at: new Date().toISOString(),
    budgets_json: JSON.stringify({ seconds: 60 }), result_json: JSON.stringify(result) };
}

function mockDb(initial, onInterrupt) {
  let current = initial;
  return {
    get: async () => current,
    run: async (sql, params) => {
      if (!sql.includes("WHERE id = ? AND phase IN ('prepared','running')")) throw new Error('unexpected-query');
      return onInterrupt({ current, setCurrent: (next) => { current = next; }, params });
    }
  };
}

async function testFinishedDuringObservation() {
  const terminal = { success: false, error: 'MISSION_CLOSURE_REJECTED', detail: 'required proof absent' };
  const db = mockDb(makeRun('running', {}), ({ setCurrent }) => {
    setCurrent(makeRun('finished', terminal));
    return { changes: 1 };
  });
  const result = await observeExecution(db, { project: { id: 'race-project' } }, {
    observe: async () => {
      // The mission runner commits its result before the process watcher returns.
      const run = makeRun('finished', terminal);
      db.get = async () => run;
      return { alive: false };
    }
  });
  assert.strictEqual(result.workerResult, 'done');
  assert.deepStrictEqual(JSON.parse(result.run.result_json), terminal);
}

async function testTerminalWriteWinsCompareAndSet() {
  const terminal = { success: false, error: 'MISSION_CLOSURE_REJECTED', detail: 'proof persisted' };
  const db = mockDb(makeRun('running', {}), ({ setCurrent }) => {
    setCurrent(makeRun('finished', terminal));
    return { changes: 0 };
  });
  const result = await observeExecution(db, { project: { id: 'race-project' } }, {
    observe: async () => ({ alive: false })
  });
  assert.strictEqual(result.workerResult, 'done');
  assert.deepStrictEqual(JSON.parse(result.run.result_json), terminal);
}

async function main() {
  await testFinishedDuringObservation();
  await testTerminalWriteWinsCompareAndSet();
  console.log('Ontogenesis execution lifecycle race checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
