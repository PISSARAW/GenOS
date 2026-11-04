'use strict';

const vm = require('node:vm');
const assert = require('node:assert/strict');
const { CASES, REFERENCES } = require('./javascriptRepairCases');
const FORBIDDEN = /\b(?:require|process|global|globalThis|import|eval|Function|constructor|__proto__|WebAssembly|fetch|setTimeout|setInterval)\b/;

function evaluate(code, args) {
  const program = `"use strict"; const module = {exports:{}};\n${code}\n`
    + `const args = [${args}]; const before = JSON.stringify(args); const value = module.exports(...args);\n`
    + 'JSON.stringify({type:typeof value,value,finite:typeof value === "number" ? Number.isFinite(value) : null,mutatedArguments:before !== JSON.stringify(args)});';
  return JSON.parse(vm.runInNewContext(program, Object.create(null), {
    timeout: 200, contextCodeGeneration: { strings: false, wasm: false }
  }));
}

function expected(value) {
  return { type: typeof value, value, finite: typeof value === 'number' ? Number.isFinite(value) : null,
    mutatedArguments: false };
}

function checkRepair(subject, strategy) {
  const contract = require('./javascriptRepairContract').assertContract(subject.contract);
  const code = subject.sources.find(source => source.path === contract.artifactPath)?.content;
  if (typeof code !== 'string' || Buffer.byteLength(code) > 20000 || FORBIDDEN.test(code)) {
    return result({ status: 'inconclusive', reason: 'javascript_primitive_outside_domain', strategy, cases: [] });
  }
  const cases = CASES[contract.caseId];
  const order = strategy === 'source_recompute' ? cases : [...cases].reverse();
  const rows = order.map(([args, value]) => checkOne({ code, args, value, caseId: contract.caseId, strategy }));
  return result({ status: rows.every(row => row.passed) ? 'verified' : 'refuted',
    reason: 'bounded_javascript_cases_recomputed', strategy, cases: rows });
}

function checkOne(input) {
  try {
    const actual = evaluate(input.code, input.args);
    const reference = input.strategy === 'source_recompute' ? expected(input.value)
      : evaluate(`module.exports = ${REFERENCES[input.caseId]};`, input.args);
    assert.deepEqual(reference, expected(input.value));
    assert.deepEqual(actual, reference);
    return { args: input.args, passed: true };
  } catch (_) { return { args: input.args, passed: false }; }
}

function result({ status, reason, strategy, cases }) {
  return { schema: 'genos.workspace-postconditions/v1', status, reason, strategy,
    suite: 'genos.pure-js-repair/v1', cases };
}

module.exports = { checkRepair };
