'use strict';

const fs = require('node:fs');

const ANSWERS = Object.freeze({
  'integer-partitions-12': { triples: [[1, 2, 9], [1, 3, 8], [1, 4, 7], [1, 5, 6], [2, 3, 7], [2, 4, 6], [3, 4, 5]] },
  'distinct-letters-fr': { distinctLetters: ['b', 'c', 'e', 'h', 'i', 'm', 'n', 'o', 'p', 's', 'è'], count: 11 },
  'dependency-order': { order: ['requirements', 'design', 'implementation', 'validation'] },
  'arithmetic-partition': { remaining: 21, perGroup: 3, remainder: 0 }
});

function main() {
  const request = JSON.parse(fs.readFileSync(0, 'utf8'));
  if (!ANSWERS[request.taskId]) throw new Error('Fixture task is unknown.');
  const answer = process.env.GENOS_INSPECT_FIXTURE_WRONG === '1' ? {} : ANSWERS[request.taskId];
  const topologyUsed = request.arm === 'model-alone' ? null
    : request.arm === 'fixed-topology' ? request.forcedTopology : 'trinity';
  process.stdout.write(JSON.stringify({
    schemaVersion: 1, requestId: request.requestId, taskId: request.taskId,
    arm: request.arm, modelId: request.modelId, modelVersion: 'fixture-only', runnerVersion: 'fixture-1',
    status: 'completed', topologyUsed, rawOutput: JSON.stringify(answer),
    tokensUsed: 8, elapsedMs: 1, toolsUsed: [], evidenceRefs: [`fixture:${request.taskId}`]
  }) + '\n');
}

try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
