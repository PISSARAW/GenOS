'use strict';

const { createHash } = require('node:crypto');
const { runProcedure } = require('./deterministicWorkerProcedures');

function teachingError(message) {
  return Object.assign(new Error(message), { code: 'WORKER_TEACHING_INPUT_INVALID' });
}

function assertTeachingInput(methodContract) {
  const input = methodContract?.parameters;
  if (!validTeachingMethod(methodContract, input)) {
    throw teachingError('Teaching requires a bounded subset-sum procedure, prerequisites and learner indices.');
  }
  runProcedure(input.procedure);
  return true;
}

function validTeachingMethod(methodContract, input) {
  return methodContract?.version === 1 && methodContract.methodId === 'teach_subset_sum'
    && input?.procedure?.version === 1 && input.procedure.methodId === 'subset_sum'
    && Array.isArray(input.learnerIndices) && input.learnerIndices.length <= 1000
    && Array.isArray(input.prerequisites) && input.prerequisites.length >= 1
    && input.prerequisites.length <= 10 && input.prerequisites.every(validPrerequisite);
}

function validPrerequisite(value) {
  return typeof value === 'string' && Boolean(value.trim()) && value.length <= 128;
}

function validWitness(indices, values) {
  return indices.every((index) => Number.isSafeInteger(index) && index >= 0
    && index < values.length) && new Set(indices).size === indices.length;
}

function runTeaching(methodContract) {
  assertTeachingInput(methodContract);
  const { procedure, learnerIndices, prerequisites } = methodContract.parameters;
  const executed = runProcedure(procedure);
  const { values, target } = procedure.parameters;
  const valid = validWitness(learnerIndices, values);
  const learnerSum = valid ? learnerIndices.reduce((sum, index) => sum + values[index], 0) : null;
  const transferCheck = { passed: valid && learnerSum === target,
    learnerSum, target, learnerIndices, validIndices: valid };
  const content = { prerequisites, steps: [
    'Start with an empty set and sum zero.',
    'Consider each input value at most once; track reachable sums and their indices.',
    `A valid witness must use distinct indices and sum to ${target}.`
  ], evidence: [executed.receipt.id], demonstration: executed.output,
  transferCheck, procedureReceipt: executed.receipt };
  const digest = createHash('sha256').update(JSON.stringify({ methodContract, content })).digest('hex');
  return { ...content, teachingReceipt: { id: `solver://sha256:${digest}` } };
}

module.exports = { assertTeachingInput, runTeaching };
