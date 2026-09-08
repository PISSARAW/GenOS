const assert = require('node:assert/strict');
const worker = require('../src/services/jobWorker');
const vectorMemory = require('../src/services/vectorMemoryService');

const original = vectorMemory.sleepCycle;
let calls = 0;
vectorMemory.sleepCycle = async () => { calls++; await new Promise((resolve) => setTimeout(resolve, 10)); return { success: true, consolidated: true }; };
Promise.all([worker.runMemoryConsolidationOnce(), worker.runMemoryConsolidationOnce()])
  .then((results) => {
    assert.equal(calls, 1);
    assert.equal(results.some((result) => result.skipped === true), true);
    console.log('Memory sleep scheduler checks passed.');
  })
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => { vectorMemory.sleepCycle = original; });
