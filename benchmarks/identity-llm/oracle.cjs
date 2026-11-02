'use strict';
const fs = require('node:fs');

function evaluate(expression, operations) {
  if (typeof expression !== 'object') return expression;
  const op = operations.find(item => item.name === expression.op);
  if (!op) throw Error('UNKNOWN_OPERATOR');
  const input = evaluate(expression.input, operations);
  if (op.family === 'number') return op.a * input + op.b;
  let text = String(input);
  if (op.reverse) text = [...text].reverse().join('');
  if (op.upper) text = text.toUpperCase();
  return op.prefix + text + op.suffix;
}

function known(expression, operations) {
  if (typeof expression !== 'object') return true;
  return operations.some(op => op.name === expression.op && op.trained) && known(expression.input, operations);
}

function answer(input) {
  const w = JSON.parse(fs.readFileSync(input.worldPath, 'utf8'));
  const solvable = known(input.task.expression, w.operations);
  return { taskId: input.task.id, solvable, expected: solvable ? evaluate(input.task.expression, w.operations) : null };
}

if (require.main === module) process.stdout.write(JSON.stringify(answer(JSON.parse(fs.readFileSync(0, 'utf8')))));
module.exports = { answer, evaluate, known };
