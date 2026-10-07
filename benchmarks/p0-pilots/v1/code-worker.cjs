'use strict';

const fs = require('node:fs');
const { compile, execute } = require('./expression.cjs');

function equal(actual, expected) {
  if (typeof expected === 'boolean') return actual === expected;
  return typeof actual === 'number' && Math.abs(actual - expected) <= 1e-9;
}

function evaluate(request) {
  const script = compile(request.expression);
  const inputs = request.inputs || request.tests.map(test => test.input);
  const values = inputs.map(input => execute(script, input));
  const passed = request.tests ? request.tests.every((test, index) => equal(values[index], test.expected)) : true;
  return { valid: true, passed, values };
}

function main() {
  try {
    const result = evaluate(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')));
    console.log(JSON.stringify(result));
    if (!result.passed) process.exitCode = 1;
  } catch (error) {
    console.log(JSON.stringify({ valid: false, passed: false, error: error.message }));
    process.exitCode = 1;
  }
}

if (require.main === module) main();
module.exports = { evaluate, equal };

