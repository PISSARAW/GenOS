'use strict';

const values = require('./workspaceOracleValues');
const MODES = new Set(['observation', 'candidate', 'verification']);

function invalid() { throw new Error('allocation_input_outside_domain'); }

function assertContract(contract) {
  if (!MODES.has(contract.mode) || contract.indexBase !== 0) invalid();
  const paths = new Set(contract.sources.filter(source => !source.mutable).map(source => source.path));
  const keys = contract.mode === 'verification' ? ['problem', 'allocation', 'candidate'] : ['problem', 'allocation'];
  if (!keys.every(key => paths.has(contract.files?.[key]))) invalid();
}

function problemFor(subject) {
  const problem = JSON.parse(values.source(subject, 'problem'));
  if (!Array.isArray(problem.values) || !problem.values.length || problem.values.length > 24) invalid();
  if (!problem.values.every(value => Number.isSafeInteger(value) && value >= 0 && value <= 1000000)) invalid();
  if (!Number.isSafeInteger(problem.target) || problem.target < 0 || problem.target > 24000000) invalid();
  return problem;
}

function assertIndices(indices, problem) {
  if (!Array.isArray(indices) || indices.length > problem.values.length) invalid();
  if (new Set(indices).size !== indices.length) invalid();
  if (!indices.every(index => Number.isSafeInteger(index) && index >= 0 && index < problem.values.length)) invalid();
}

function sumFor(problem, indices, strategy) {
  assertIndices(indices, problem);
  if (strategy === 'source_recompute') return indices.reduce((sum, index) => sum + problem.values[index], 0);
  const selected = new Set(indices);
  let sum = 0n;
  for (let i = 0; i < problem.values.length; i++) {
    if (selected.has(i)) sum += BigInt(problem.values[i]);
  }
  return Number(sum);
}

function exactFields(candidate, expected) {
  return Object.entries(expected).every(([key, value]) => candidate?.[key] === value);
}

function observation(subject, strategy, candidate) {
  const problem = problemFor(subject);
  const allocation = JSON.parse(values.source(subject, 'allocation'));
  const sum = sumFor(problem, allocation.indices, strategy);
  return exactFields(candidate, { observedSum: sum, target: problem.target, anomaly: sum !== problem.target });
}

function proposal(subject, strategy, candidate) {
  const problem = problemFor(subject);
  const sum = sumFor(problem, candidate.indices, strategy);
  return candidate.sum === sum && sum === problem.target;
}

function verification(subject, strategy, candidate) {
  const problem = problemFor(subject);
  const proposed = JSON.parse(values.source(subject, 'candidate'));
  const sum = sumFor(problem, proposed.indices, strategy);
  const accepted = proposed.sum === sum && sum === problem.target;
  const verdict = subject.report?.workerArtifact?.content?.verdict;
  return exactFields(candidate, { sum, target: problem.target, accepted })
    && verdict === (accepted ? 'accept' : 'reject');
}

function check(subject, strategy, candidate) {
  assertContract(subject.contract);
  return { observation, candidate: proposal, verification }[subject.contract.mode](subject, strategy, candidate);
}

module.exports = { assertContract, check };
