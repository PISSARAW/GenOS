'use strict';

const fs = require('node:fs');
const { verifyCandidate } = require('./oracles.cjs');

const taskSet = require('./comparison-task-set.json');

function main() {
  const input = fs.readFileSync(0, 'utf8');
  if (Buffer.byteLength(input) > 65536) throw new Error('Oracle input exceeds limit.');
  const request = JSON.parse(input);
  const task = taskSet.tasks.find((item) => item.id === request.taskId && item.comparisonEligible);
  if (!task || !request.answer || typeof request.answer !== 'object' || Array.isArray(request.answer)) {
    throw new Error('Oracle task or answer is invalid.');
  }
  const verdict = verifyCandidate(task, request.answer);
  process.stdout.write(JSON.stringify({ oracle: task.oracle, passed: verdict.passed }) + '\n');
}

try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
