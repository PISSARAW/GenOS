'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { CASES } = require('./cases.cjs');
const FORBIDDEN = /\b(?:require|process|global|globalThis|import|eval|Function|constructor|__proto__|WebAssembly|fetch|setTimeout|setInterval)\b/;
function assertPure(code) {
  assert.ok(Buffer.byteLength(code) < 20000, 'Candidate exceeds pure-function code size limit');
  assert.ok(!FORBIDDEN.test(code), 'Candidate contains an unavailable host or dynamic-code primitive');
}
function wrapped(value) {
  return { type: typeof value, value, finite: typeof value === 'number' ? Number.isFinite(value) : null,
    mutatedArguments: false };
}
function evaluateCode(code, task, smoke = false) {
  assertPure(code);
  const tests = smoke ? task.tests.slice(0, 2) : task.tests;
  const rows = tests.map((item, index) => evaluateOne({ code, item, index }));
  return { passed: rows.filter(row => row.passed).length, total: tests.length,
    allPassed: rows.every(row => row.passed), cases: rows };
}
function evaluateOne(input) {
  const { code, item, index } = input;
  try {
    const program = `"use strict"; const module = {exports:{}};\n${code}\n`
      + `const args = [${item.args}]; const before = JSON.stringify(args); const value = module.exports(...args);\n`
      + 'JSON.stringify({type:typeof value,value,finite:typeof value === "number" ? Number.isFinite(value) : null,mutatedArguments:before !== JSON.stringify(args)});';
    const actual = JSON.parse(vm.runInNewContext(program, Object.create(null), {
      timeout: 1000, contextCodeGeneration: { strings: false, wasm: false } }));
    const expected = wrapped(item.expected);
    assert.deepEqual(actual, expected);
    return { index, passed: true, actual, expected };
  } catch (error) { return { index, passed: false, error: error.message, expected: wrapped(item.expected) }; }
}
function evaluate(file, caseId, smoke = false) {
  const task = CASES.find(item => item.id === caseId);
  assert.ok(task, 'Unknown task');
  return evaluateCode(fs.readFileSync(file, 'utf8'), task, smoke);
}
if (require.main === module) {
  try {
    const result = evaluate(process.argv[2], process.argv[3], process.argv[4] === 'smoke');
    console.log(JSON.stringify(result));
    process.exitCode = result.allPassed ? 0 : 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { evaluate, evaluateCode, assertPure };
