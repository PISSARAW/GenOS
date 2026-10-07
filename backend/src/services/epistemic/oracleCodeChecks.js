'use strict';

const contracts = require('./codePostconditionContract');
const values = require('../trinityProvenanceValues');
const STRATEGIES = new Set(['code_remainder', 'code_quotient']);
const VERSION = 'genos.code-postconditions/v1';

function outcome(subject, strategy, { status, reason }) {
  return { schema: VERSION, strategy, status, reason,
    contractHash: subject?.contractHash || null, artifactContentHash: subject?.artifact?.contentHash || null };
}

function expected(input, strategy) {
  if (strategy === 'code_remainder') return ((input.a % input.b) + input.b) % input.b;
  return input.a - Math.floor(input.a / input.b) * input.b;
}

function checkCode(subject, strategy) {
  if (!available(subject, strategy)) return outcome(subject, strategy, { status: 'inconclusive', reason: 'code_contract_unavailable' });
  let tree;
  try { tree = require('./codeExpressionCompiler').compile(subject.artifact.expression); }
  catch { return outcome(subject, strategy, { status: 'inconclusive', reason: 'code_language_outside_domain' }); }
  const cases = contracts.cases();
  for (const [index, input] of cases.entries()) {
    const checked = checkCase(tree, { input, strategy });
    if (!checked.passed) return { ...outcome(subject, strategy, { status: 'refuted', reason: 'code_postcondition_false' }),
      counterexample: checked.counterexample, coverage: { expectedCases: cases.length, checkedCases: index + 1, complete: false } };
  }
  return complete(subject, strategy, cases.length);
}

function available(subject, strategy) {
  return STRATEGIES.has(strategy) && values.digest(subject?.contract || null) === contracts.hash() && subject?.contractHash === contracts.hash();
}

function complete(subject, strategy, count) {
  const verdict = subject.verification?.verdict;
  const accepted = verdict === undefined || verdict === 'accept';
  return { ...outcome(subject, strategy, { status: accepted ? 'verified' : 'refuted',
    reason: accepted ? 'code_postconditions_checked' : 'code_declared_verdict_contradiction' }),
  coverage: { expectedCases: count, checkedCases: count, complete: true } };
}

function checkCase(tree, { input, strategy }) {
  const target = expected(input, strategy);
  let actual;
  try { actual = require('./codeExpressionInterpreter').execute(tree, input); }
  catch (failure) { return { passed: false, counterexample: { input, expected: target, actual: null, reason: failure.code } }; }
  return { passed: actual === target, counterexample: { input, expected: target, actual } };
}

module.exports = { STRATEGIES, VERSION, checkCode };
