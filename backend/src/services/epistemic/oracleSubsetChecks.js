'use strict';

const VERSION = 'genos.subset-postconditions/v1';
const STRATEGIES = new Set(['subset_bitset', 'subset_enumeration']);

function validInput(input) {
  return Array.isArray(input?.values) && input.values.length > 0 && input.values.length <= 1000
    && integer(input.target) && input.values.every(integer)
    && input.values.length * (input.target + 1) <= 2000000;
}

function integer(value) { return Number.isSafeInteger(value) && value >= 0 && value <= 1000000; }
function outcome(status, reason) { return { schema: VERSION, status, reason }; }

function bitset(input) {
  const mask = (1n << BigInt(input.target + 1)) - 1n;
  let bits = 1n;
  for (const value of input.values) {
    if (value <= input.target) bits = (bits | (bits << BigInt(value))) & mask;
  }
  return { found: Boolean(bits & (1n << BigInt(input.target))),
    reachableCount: bits.toString(2).split('1').length - 1 };
}

function enumeration(input) {
  const reachable = new Set();
  const combinations = 2 ** input.values.length;
  for (let selection = 0; selection < combinations; selection += 1) {
    let sum = 0;
    for (let index = 0; index < input.values.length; index += 1) {
      if (selection & (2 ** index)) sum += input.values[index];
    }
    if (sum <= input.target) reachable.add(sum);
  }
  return { found: reachable.has(input.target), reachableCount: reachable.size };
}

function validWitness(input, result) {
  const indices = result.indices;
  if (!Array.isArray(indices) || new Set(indices).size !== indices.length) return false;
  if (indices.some(index => !Number.isSafeInteger(index) || index < 0 || index >= input.values.length)) return false;
  return indices.reduce((sum, index) => sum + input.values[index], 0) === input.target
    && result.sum === input.target;
}

function resultMatches(input, result, expected) {
  if (result?.found !== expected.found || result.reachableCount !== expected.reachableCount) return false;
  if (expected.found) return validWitness(input, result);
  return result.indices === null && result.sum === null;
}

function checkSubset(subject, strategy) {
  if (!STRATEGIES.has(strategy) || subject?.method?.version !== 1 || subject.method.methodId !== 'subset_sum') {
    return outcome('inconclusive', 'oracle_domain_unavailable');
  }
  const input = subject.method.parameters;
  if (!validInput(input)) return outcome('inconclusive', 'oracle_input_outside_domain');
  if (strategy === 'subset_enumeration' && input.values.length > 20) {
    return outcome('inconclusive', 'oracle_enumeration_budget_exceeded');
  }
  const expected = strategy === 'subset_bitset' ? bitset(input) : enumeration(input);
  return { ...outcome(resultMatches(input, subject.result, expected) ? 'verified' : 'refuted',
    'subset_postconditions_checked'), strategy, expected,
  domain: { methodId: 'subset_sum', maxValues: strategy === 'subset_enumeration' ? 20 : 1000,
    maxSearchCells: 2000000, nonnegativeSafeIntegers: true } };
}

module.exports = { VERSION, STRATEGIES, checkSubset };
