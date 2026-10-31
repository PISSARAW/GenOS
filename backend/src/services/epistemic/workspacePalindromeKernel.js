'use strict';

function compile(text) {
  const lines = text.split(/\r?\n/).map(line => line.split('#')[0].trim()).filter(Boolean);
  const header = lines.shift()?.match(/^def is_palindrome\(([A-Za-z_]\w*)\):\s*(.*)$/);
  if (!header) throw new Error('python_function_outside_domain');
  if (header[2]) lines.unshift(header[2]);
  const variables = new Map([[header[1], []]]);
  let result = null;
  for (const line of lines.flatMap(value => value.split(';')).map(value => value.trim()).filter(Boolean)) {
    result = statement(line, { variables, result });
  }
  if (!result) throw new Error('python_return_required');
  return result;
}

function statement(line, context) {
  if (context.result) throw new Error('python_statement_after_return');
  if (line.startsWith('return ')) return comparison(line.slice(7), context.variables);
  const assignment = line.match(/^([A-Za-z_]\w*)\s*=\s*([^=].*)$/);
  if (!assignment) throw new Error('python_statement_outside_domain');
  context.variables.set(assignment[1], expression(assignment[2], context.variables));
  return null;
}

function comparison(text, variables) {
  const sides = text.split('==');
  if (sides.length !== 2) throw new Error('python_comparison_outside_domain');
  return sides.map(side => expression(side.trim(), variables));
}

function expression(text, variables) {
  const name = text.match(/^([A-Za-z_]\w*)/);
  if (!name || !variables.has(name[1])) throw new Error('python_name_outside_domain');
  const operations = [...variables.get(name[1])];
  let tail = text.slice(name[0].length).trim();
  while (tail) {
    const parsed = operation(tail);
    operations.push(parsed.name);
    tail = tail.slice(parsed.length).trim();
  }
  return operations;
}

function operation(text) {
  if (text.startsWith('.lower()')) return { name: 'lower', length: 8 };
  const replace = text.match(/^\.replace\(\s*(['"]) \1\s*,\s*(['"])\2\s*\)/);
  if (replace) return { name: 'spaces', length: replace[0].length };
  const reverse = text.match(/^\[\s*::\s*-1\s*\]/);
  if (reverse) return { name: 'reverse', length: reverse[0].length };
  throw new Error('python_operation_outside_domain');
}

function symbolic(program) {
  const normal = program.map(operations => operations.filter(op => op !== 'reverse'));
  const reverse = program.map(operations => operations.filter(op => op === 'reverse').length);
  const lateNormalization = program.some(operations => operations.indexOf('reverse') >= 0
    && operations.slice(operations.indexOf('reverse') + 1).some(op => op !== 'reverse'));
  if (lateNormalization) throw new Error('python_normalization_order_outside_domain');
  return normal.every(operations => operations.includes('spaces') && operations.includes('lower'))
    && reverse[0] % 2 !== reverse[1] % 2;
}

function execute(operations, input) {
  return operations.reduce((text, operation) => {
    if (operation === 'lower') return text.toLowerCase();
    if (operation === 'spaces') return text.replaceAll(' ', '');
    return [...text].reverse().join('');
  }, input);
}

function exhaustive(program) {
  let layer = [''];
  for (let size = 0; size <= 6; size += 1) {
    for (const input of layer) if (!checkInput(program, input)) return false;
    layer = layer.flatMap(prefix => ['a', 'A', ' ', '!', '\t'].map(char => prefix + char));
  }
  return true;
}

function checkInput(program, input) {
  const normalized = input.replaceAll(' ', '').toLowerCase();
  const expected = normalized === [...normalized].reverse().join('');
  return (execute(program[0], input) === execute(program[1], input)) === expected;
}

function verify(subject, strategy) {
  if (subject.contract.inputDomain !== 'ascii') throw new Error('python_input_domain_required');
  const text = require('./workspaceOracleValues').source(subject, 'artifact');
  const program = compile(text);
  return strategy === 'source_recompute' ? symbolic(program) : exhaustive(program);
}

module.exports = { compile, symbolic, exhaustive, verify };
