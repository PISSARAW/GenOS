'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const observer = require('../src/services/agentChildTerminationObserver');

async function observe(sequence) {
  const child = new EventEmitter();
  const outcomes = [];
  observer.attach(child, (code, signal) => outcomes.push({ code, signal }), 5);
  sequence(child);
  await new Promise((resolve) => setTimeout(resolve, 15));
  return outcomes;
}

async function run() {
  const normal = await observe((child) => {
    child.emit('exit', 0, null);
    child.emit('close', 0, null);
  });
  assert.deepEqual(normal, [{ code: 0, signal: null }]);

  const orphanedConsole = await observe((child) => child.emit('exit', 1, 'SIGTERM'));
  assert.deepEqual(orphanedConsole, [{ code: 1, signal: 'SIGTERM' }]);

  const lateClose = await observe((child) => {
    child.emit('exit', 2, null);
    setTimeout(() => child.emit('close', 2, null), 10);
  });
  assert.deepEqual(lateClose, [{ code: 2, signal: null }]);
  console.log('Agent child termination observer checks passed.');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
