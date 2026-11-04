'use strict';

const assert = require('node:assert/strict');

const worker = Object.freeze({ tokens: 12000, events: 100, latencyMs: 180000 });
const preparationMs = 30000;
const stageCounts = Object.freeze([1, 3, 4]);

function controller(stages = 4) {
  assert.ok(Number.isSafeInteger(stages) && stages >= 1 && stages <= 4);
  return { ...worker, latencyMs: preparationMs + stages * (preparationMs + worker.latencyMs) };
}

const limits = Object.freeze({ workers: 8, modelTokens: 0, oracleProcesses: 16,
  elapsedMs: stageCounts.reduce((total, stages) => total + controller(stages).latencyMs, 0) });

module.exports = { worker, controller, limits };
